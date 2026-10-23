import "server-only"

import { randomBytes } from "crypto"

import {
  DISTRIBUTOR_ISSUE_REASON_LABELS,
  buildDistributorQuoteDetails,
  computeDistributorTotals,
  getDistributorIssueBlocker,
  type DistributorIssueReason,
  type DistributorSettlementRecord,
} from "@/lib/distributor-settlements"
import { sendEmail, wrapNotificationHtml } from "@/lib/email"
import { emitNotificationEvent } from "@/lib/notifications/emit-event"
import { getCustomer } from "@/lib/portal/repositories/customers"
import { getDeal } from "@/lib/portal/repositories/deals"
import { getQuoteDocument, getResolvableQuoteVersion } from "@/lib/portal/repositories/quote-documents"
import { getQuoteDetailsFromStructuredJson } from "@/lib/portal/quote-details"
import type { QuoteDocument, QuoteDocumentVersion } from "@/lib/portal/types"
import {
  DistributorSettlementsNotReadyError,
  flagDistributorSettlementReview,
  getDistributorSettlementByQuote,
  markDistributorSettlementIssued,
  recordDistributorEmailResult,
} from "@/lib/repositories/distributor-settlements"
import { escapeHtmlAttribute } from "@/lib/safe-public-url"
import { SITE_URL } from "@/lib/seo"

// 총판용 견적서 발행(2026-10-23).
//
//  - 자동(auto): 고객 동의 라우트가 부른다. 정산 설정이 '고객 동의 시 발행'일 때만 발행하고,
//    고객 견적 버전이 바뀌었거나 원가가 비어 있으면 발행하지 않고 재확인 알림을 남긴다.
//  - 수동(manual): 어드민이 '설치 완료 → 발행' 또는 '지금 발행'을 누를 때. 트리거 설정과 무관하다.
//  - 발행 = 조건부 UPDATE(status=draft → issued) + 공유 토큰. 동시 발행이 겹쳐도 한 번만 성공한다.
//  - 총판 이메일은 발행이 끝난 뒤 보낸다. 실패해도 발행은 되돌리지 않고 email_status=failed 로 남겨
//    화면에서 링크를 직접 전달하거나 다시 보낼 수 있게 한다.

export type DistributorIssueOutcome =
  | { status: "issued"; settlement: DistributorSettlementRecord; shareUrl: string }
  | { status: "already_issued"; settlement: DistributorSettlementRecord }
  | { status: "not_configured" }
  | { status: "skipped"; reason: string }
  | { status: "blocked"; reason: string; settlement: DistributorSettlementRecord }

export function distributorShareUrl(token: string, origin?: string | null) {
  return `${(origin || SITE_URL).replace(/\/$/, "")}/share/distributor-quote/${token}`
}

function createShareToken() {
  return randomBytes(24).toString("hex")
}

function won(value: number) {
  return `${value.toLocaleString("ko-KR")}원`
}

export interface QuoteContext {
  document: QuoteDocument
  version: QuoteDocumentVersion
  customerName: string | null
}

export async function loadQuoteContext(quoteDocumentId: string): Promise<QuoteContext | null> {
  const document = await getQuoteDocument(quoteDocumentId)
  if (!document) return null
  const version = await getResolvableQuoteVersion(document)
  if (!version) return null
  const deal = await getDeal(document.deal_id).catch(() => null)
  const customer = deal ? await getCustomer(deal.customer_id).catch(() => null) : null
  return { document, version, customerName: customer?.name ?? null }
}

/** 공유 페이지·이메일 공용 — 발행 스냅샷 기준 총판용 견적서 본문. */
export async function loadDistributorQuoteView(settlement: DistributorSettlementRecord) {
  const context = await loadQuoteContext(settlement.quoteDocumentId)
  if (!context) return null
  const customerDetails = getQuoteDetailsFromStructuredJson(context.version.structured_json, {
    customerName: context.customerName,
    validUntil: context.version.valid_until,
  })
  if (!customerDetails) return null
  return {
    ...context,
    details: buildDistributorQuoteDetails(customerDetails, settlement, {
      issuedAt: settlement.issuedAt,
      customerName: context.customerName,
    }),
  }
}

function notifyReviewRequired(settlement: DistributorSettlementRecord, context: QuoteContext, reason: string) {
  emitNotificationEvent({
    eventType: "distributor_settlement.review_required",
    notificationType: "action_required",
    categoryTag: "finance",
    severity: "warning",
    scopeTag: "org_admin",
    title: `총판 견적서 자동 발행 보류 — 견적 ${context.document.quote_number}`,
    message: [
      `${context.customerName?.trim() || "고객"}님이 견적에 동의했지만 총판 견적서를 자동 발행하지 못했습니다.`,
      `사유: ${reason}`,
      "견적 화면에서 원가을 확인하고 발행해 주세요.",
    ].join("\n"),
    routeUrl: `/admin/quotes?tab=hardware&quote=${context.document.id}`,
    source: "distributor_settlement",
    sourceId: settlement.id,
    payload: { quoteNumber: context.document.quote_number, reason },
    channels: ["wecom_webhook"],
  }).catch((error) => {
    console.error("[distributor-settlement] review notification failed:", error)
  })
}

function notifyIssued(
  settlement: DistributorSettlementRecord,
  context: QuoteContext,
  reason: DistributorIssueReason
) {
  emitNotificationEvent({
    eventType: "distributor_settlement.issued",
    notificationType: "status_update",
    categoryTag: "finance",
    severity: "info",
    scopeTag: "org_admin",
    title: `총판 견적서 발행 — 견적 ${context.document.quote_number}`,
    message: [
      `${context.customerName?.trim() || "고객"} 건 · 발행 사유: ${DISTRIBUTOR_ISSUE_REASON_LABELS[reason]}`,
      `총판 ${settlement.distributorName} · 입금 받을 금액 ${won(settlement.totalAmount)}`,
      settlement.dueDate ? `입금 기한 ${settlement.dueDate}` : "입금 기한 미정",
    ].join("\n"),
    routeUrl: "/admin/quotes?tab=receivables",
    source: "distributor_settlement",
    sourceId: settlement.id,
    payload: {
      quoteNumber: context.document.quote_number,
      distributorName: settlement.distributorName,
      totalAmount: settlement.totalAmount,
    },
    channels: ["wecom_webhook"],
  }).catch((error) => {
    console.error("[distributor-settlement] issued notification failed:", error)
  })
}

/** 총판에게 발행 링크를 메일로 보낸다. 결과는 정산 행에 기록한다. */
export async function sendDistributorSettlementEmail(
  settlement: DistributorSettlementRecord,
  input: { quoteNumber: string; customerName: string | null; shareUrl: string }
): Promise<DistributorSettlementRecord> {
  if (!settlement.distributorEmail) {
    return (await recordDistributorEmailResult(settlement.id, { status: "skipped", error: "총판 이메일 없음" })) ?? settlement
  }

  const customerLabel = input.customerName?.trim() || "고객사"
  const subject = `[클래스인] ${customerLabel} 하드웨어 총판 견적서 (No. ${input.quoteNumber})`
  const body = [
    `${escapeHtmlAttribute(settlement.distributorName)} 담당자님, 아래 고객 건의 총판 견적서를 보내 드립니다.`,
    `고객사: ${escapeHtmlAttribute(customerLabel)}`,
    `입금 요청 금액: <strong>${won(settlement.totalAmount)}</strong> (VAT 포함)`,
    settlement.dueDate ? `입금 기한: ${escapeHtmlAttribute(settlement.dueDate)}` : null,
  ].filter(Boolean).join("<br />")

  try {
    const result = await sendEmail({
      to: settlement.distributorEmail,
      subject,
      html: wrapNotificationHtml(escapeHtmlAttribute(subject), body, escapeHtmlAttribute(input.shareUrl)),
    })
    const sent = result.sent > 0 && result.failed === 0
    return (
      (await recordDistributorEmailResult(settlement.id, {
        status: sent ? "sent" : "failed",
        error: sent ? null : result.errors?.[0] ?? "이메일 발송 공급자가 설정되지 않았습니다.",
      })) ?? settlement
    )
  } catch (error) {
    console.error("[distributor-settlement] email failed:", error instanceof Error ? error.message : error)
    return (
      (await recordDistributorEmailResult(settlement.id, {
        status: "failed",
        error: error instanceof Error ? error.message : "이메일 발송 실패",
      })) ?? settlement
    )
  }
}

export async function issueDistributorSettlement(params: {
  quoteDocumentId: string
  reason: DistributorIssueReason
  mode: "auto" | "manual"
  actor: string
  origin?: string | null
}): Promise<DistributorIssueOutcome> {
  const read = await getDistributorSettlementByQuote(params.quoteDocumentId)
  if (!read.available) {
    if (params.mode === "auto") return { status: "not_configured" }
    throw new DistributorSettlementsNotReadyError()
  }
  const settlement = read.value
  if (!settlement || settlement.status === "cancelled") return { status: "not_configured" }
  if (settlement.status !== "draft") return { status: "already_issued", settlement }

  if (params.mode === "auto") {
    const expected = params.reason === "customer_accepted" ? "on_accept" : "on_install"
    if (settlement.issueTrigger !== expected) {
      return { status: "skipped", reason: "발행 시점 설정이 달라 자동 발행하지 않았습니다." }
    }
  }

  const context = await loadQuoteContext(params.quoteDocumentId)
  if (!context) {
    return { status: "blocked", reason: "고객 견적 버전을 찾지 못했습니다.", settlement }
  }

  const block = (reason: string): DistributorIssueOutcome => {
    if (params.mode === "auto") {
      flagDistributorSettlementReview(settlement.id, reason).catch((error) => {
        console.error("[distributor-settlement] review flag failed:", error)
      })
      notifyReviewRequired(settlement, context, reason)
    }
    return { status: "blocked", reason, settlement }
  }

  if (settlement.sourceVersionId && settlement.sourceVersionId !== context.version.id) {
    return block(
      `고객 견적이 v${context.version.version_number}로 바뀌었습니다. 원가을 다시 확인하고 저장한 뒤 발행해 주세요.`
    )
  }
  const blocker = getDistributorIssueBlocker(settlement)
  if (blocker) return block(blocker)

  const totals = computeDistributorTotals(settlement.lines, settlement.vatIncluded)
  const issued = await markDistributorSettlementIssued({
    id: settlement.id,
    issuedVersionId: context.version.id,
    reason: params.reason,
    shareToken: createShareToken(),
    totals,
    customerTotalAmount: context.version.total_amount,
    actor: params.actor,
  })
  if (!issued) {
    const latest = await getDistributorSettlementByQuote(params.quoteDocumentId)
    return latest.value ? { status: "already_issued", settlement: latest.value } : { status: "not_configured" }
  }

  const shareUrl = distributorShareUrl(issued.shareToken ?? "", params.origin)
  let final = issued
  if (issued.autoEmail) {
    final = await sendDistributorSettlementEmail(issued, {
      quoteNumber: context.document.quote_number,
      customerName: context.customerName,
      shareUrl,
    })
  } else {
    final = (await recordDistributorEmailResult(issued.id, { status: "skipped", error: null })) ?? issued
  }
  notifyIssued(final, context, params.reason)

  return { status: "issued", settlement: final, shareUrl }
}

/** 고객 동의 라우트용 — 어떤 실패도 동의 응답을 막지 않는다. */
export async function issueDistributorSettlementOnAcceptSafely(input: {
  quoteDocumentId: string
  origin?: string | null
}) {
  try {
    return await issueDistributorSettlement({
      quoteDocumentId: input.quoteDocumentId,
      reason: "customer_accepted",
      mode: "auto",
      actor: "system:quote-accept",
      origin: input.origin,
    })
  } catch (error) {
    console.error(
      "[distributor-settlement] auto issue on accept skipped:",
      error instanceof Error ? error.message : error
    )
    return null
  }
}
