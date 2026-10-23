import "server-only"

import { NextResponse } from "next/server"

import { listLedgerDraftStatusesForSettlement } from "@/lib/admin/handoff/distributor-payment-to-ledger-draft"
import type { VerifiedAdminContext } from "@/lib/admin-auth"
import {
  buildDistributorLinesFromQuote,
  type DistributorPriceTemplate,
  type DistributorSettlementLine,
  type DistributorSettlementPayment,
  type DistributorSettlementRecord,
} from "@/lib/distributor-settlements"
import { getQuoteDetailsFromStructuredJson } from "@/lib/portal/quote-details"
import type { BranchSalesLedgerDraftStatus } from "@/lib/repositories/branch-sales-ledger-drafts"
import {
  DistributorSettlementsNotReadyError,
  getDistributorSettlementByQuote,
  getLatestDistributorContact,
  listDistributorPayments,
  listDistributorPriceTemplates,
} from "@/lib/repositories/distributor-settlements"
import { distributorShareUrl, loadQuoteContext } from "@/lib/server/distributor-settlement-issue"

// /api/admin/quotes/[id]/distributor-settlement* · /api/admin/distributor-* 라우트 공용.

export function distributorActor(admin: Pick<VerifiedAdminContext, "name" | "userId" | "role">) {
  return admin.name?.trim() || admin.userId || admin.role
}

export async function readJsonObject(req: Request): Promise<Record<string, unknown> | null> {
  const body = await req.json().catch(() => null)
  if (!body || typeof body !== "object" || Array.isArray(body)) return null
  return body as Record<string, unknown>
}

export function distributorWriteError(error: unknown, label: string, fallback: string) {
  if (error instanceof DistributorSettlementsNotReadyError) {
    return NextResponse.json({ error: error.message }, { status: 503 })
  }
  console.error(`[${label}]`, error instanceof Error ? error.message : error)
  return NextResponse.json({ error: fallback }, { status: 500 })
}

export interface DistributorSettlementQuoteSummary {
  id: string
  quoteNumber: string
  versionId: string
  versionNumber: number
  customerName: string | null
  customerTotalAmount: number
  vatIncluded: boolean
}

export interface DistributorSettlementPayload {
  available: boolean
  warning: string | null
  quote: DistributorSettlementQuoteSummary
  settlement: DistributorSettlementRecord | null
  payments: DistributorSettlementPayment[]
  /** 입금별 매출 원장 초안 상태(paymentId → draft/checked/applied/cancelled). C1 매출 = 총판 입금 확인 시점. */
  ledgerStatuses: Record<string, BranchSalesLedgerDraftStatus>
  /** 발행 전 편집용 줄 — 현재 고객 견적 품목 기준(저장된 포함 여부·원가를 이어받는다). */
  draftLines: DistributorSettlementLine[]
  /** 저장 후 고객 견적 버전이 바뀌었는지. true 면 다시 저장해야 발행된다. */
  versionChanged: boolean
  defaults: {
    distributorName: string | null
    distributorContactName: string | null
    distributorEmail: string | null
    distributorPhone: string | null
  }
  templates: DistributorPriceTemplate[]
  shareUrl: string | null
}

/** 견적 + 고객 품목 + 저장된 정산을 한 번에. 견적이 없으면 null. */
export async function loadDistributorSettlementPayload(
  quoteDocumentId: string,
  origin?: string | null
): Promise<DistributorSettlementPayload | null> {
  const context = await loadQuoteContext(quoteDocumentId)
  if (!context) return null
  const customerDetails = getQuoteDetailsFromStructuredJson(context.version.structured_json, {
    customerName: context.customerName,
    validUntil: context.version.valid_until,
  })

  const quote: DistributorSettlementQuoteSummary = {
    id: context.document.id,
    quoteNumber: context.document.quote_number,
    versionId: context.version.id,
    versionNumber: context.version.version_number,
    customerName: context.customerName,
    customerTotalAmount: context.version.total_amount,
    vatIncluded: customerDetails?.vatIncluded ?? true,
  }

  const read = await getDistributorSettlementByQuote(quoteDocumentId)
  if (!read.available) {
    return {
      available: false,
      warning: read.warning,
      quote,
      settlement: null,
      payments: [],
      ledgerStatuses: {},
      draftLines: buildDistributorLinesFromQuote(customerDetails?.lineItems),
      versionChanged: false,
      defaults: { distributorName: null, distributorContactName: null, distributorEmail: null, distributorPhone: null },
      templates: [],
      shareUrl: null,
    }
  }

  const settlement = read.value
  const [payments, templates, latest, ledgerStatuses] = await Promise.all([
    settlement ? listDistributorPayments(settlement.id) : Promise.resolve([]),
    listDistributorPriceTemplates(),
    settlement ? Promise.resolve(null) : getLatestDistributorContact(),
    settlement ? listLedgerDraftStatusesForSettlement(settlement.id) : Promise.resolve({}),
  ])

  return {
    available: true,
    warning: null,
    quote,
    settlement,
    payments,
    ledgerStatuses,
    draftLines: buildDistributorLinesFromQuote(customerDetails?.lineItems, { previous: settlement?.lines }),
    versionChanged: Boolean(
      settlement && settlement.status === "draft" && settlement.sourceVersionId && settlement.sourceVersionId !== context.version.id
    ),
    defaults: {
      distributorName: settlement?.distributorName ?? latest?.distributorName ?? null,
      distributorContactName: settlement?.distributorContactName ?? latest?.distributorContactName ?? null,
      distributorEmail: settlement?.distributorEmail ?? latest?.distributorEmail ?? null,
      distributorPhone: settlement?.distributorPhone ?? latest?.distributorPhone ?? null,
    },
    templates: templates.value ?? [],
    shareUrl: settlement?.shareToken ? distributorShareUrl(settlement.shareToken, origin) : null,
  }
}
