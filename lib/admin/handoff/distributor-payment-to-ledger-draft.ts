import "server-only"

import type { DistributorSettlementPayment, DistributorSettlementRecord } from "@/lib/distributor-settlements"
import {
  createBranchSalesLedgerDraft,
  deleteBranchSalesLedgerDraft,
  type BranchSalesLedgerDraftStatus,
} from "@/lib/repositories/branch-sales-ledger-drafts"
import { createSupabaseAdminClient } from "@/lib/supabase/admin"

/**
 * C1 매출 인식(2026-10-23) — 하드웨어 총판의 원가 입금이 확인되면 그 입금분을 매출로 잡는다.
 *
 * C1 물량: 회사가 하드웨어를 원가로 미리 사 두고, 고객은 총액을 총판에게 내고, 총판이 원가(구입가)를
 * 회사로 입금한다. 그래서 회사 매출은 설치 시점이 아니라 '총판 입금 확인' 시점이다.
 *
 * 설계 원칙(계약 서명 핸드오프 contract-to-ledger-draft.ts 와 같다):
 * - 매출 원장 입력 큐에 draft 까지만 넣는다. 검수(checked) → 적용(apply)은 사람이 한다.
 * - 통화 환산 금지: 원장은 CNY, 입금액은 KRW 이므로 amount 는 0(CNY)으로 두고 KRW 는 note/metadata 에 참고로 남긴다.
 * - 원장 월 = 입금일(paidOn)의 달. 입금 1건 = 초안 1건(입금 id 로 dedup).
 * - 입금 기록을 지우면 아직 draft 인 초안만 함께 지운다. checked/applied 는 원장에서 사람이 정정한다.
 * - 실패는 throw 하지 않고 결과 객체로 돌려준다(입금 기록 응답을 막지 않는다).
 */

export const DISTRIBUTOR_PAYMENT_HANDOFF_ACTOR = "system:distributor-payment"
const OPERATION = "distributor-payment-confirmed"

export type DistributorLedgerProposal =
  | { status: "created"; draftId: string }
  | { status: "skipped"; reason: string }
  | { status: "error"; error: string }

export type DistributorLedgerWithdrawal =
  | { status: "removed" }
  | { status: "kept"; draftStatus: BranchSalesLedgerDraftStatus }
  | { status: "none" }
  | { status: "error"; error: string }

interface LedgerDraftRow {
  id: string
  status: BranchSalesLedgerDraftStatus
  metadata: Record<string, unknown> | null
}

async function findDraftsForPayment(paymentId: string): Promise<LedgerDraftRow[]> {
  const { data, error } = await createSupabaseAdminClient()
    .from("branch_sales_ledger_drafts")
    .select("id, status, metadata")
    .eq("metadata->>operation", OPERATION)
    .eq("metadata->>sourceDistributorPaymentId", paymentId)
  if (error) throw new Error(`[distributor-payment-handoff] 원장 초안 조회 실패: ${error.message}`)
  return (data ?? []) as LedgerDraftRow[]
}

function won(value: number) {
  return `₩${Math.round(value).toLocaleString("ko-KR")}`
}

export async function proposeLedgerDraftForDistributorPayment(input: {
  settlement: DistributorSettlementRecord
  payment: DistributorSettlementPayment
  customerName: string | null
  quoteNumber: string | null
}): Promise<DistributorLedgerProposal> {
  try {
    try {
      if ((await findDraftsForPayment(input.payment.id)).length > 0) {
        return { status: "skipped", reason: "ledger-draft-already-exists-for-payment" }
      }
    } catch (dedupError) {
      // 원장 표 미적용 등 — 매출 초안은 부가 기능이라 입금 기록을 막지 않는다.
      return {
        status: "skipped",
        reason: dedupError instanceof Error ? `dedup-unavailable: ${dedupError.message}` : "dedup-unavailable",
      }
    }

    const { settlement, payment } = input
    const customer = input.customerName?.trim() || "고객명 미입력"
    const { draft, dedupedRecent } = await createBranchSalesLedgerDraft(
      {
        kind: "new-row",
        sourceDealId: settlement.dealId,
        customer,
        month: payment.paidOn.slice(0, 7),
        // 통화 환산 금지: 원장은 CNY, 입금액은 KRW 이므로 자동 amount 는 0으로 두고 검수자가 입력한다.
        amount: 0,
        currency: "CNY",
        note: [
          `C1 총판 원가 입금 확인 — ${settlement.distributorName} ${won(payment.amount)} 입금(${payment.paidOn})`,
          input.quoteNumber ? `견적 ${input.quoteNumber}` : null,
          "KRW 금액은 참고용, CNY 금액은 검수자가 입력",
        ].filter(Boolean).join(" · "),
        metadata: {
          operation: OPERATION,
          confidence: "confirmed",
          handoff: "distributor-payment",
          sourceDistributorSettlementId: settlement.id,
          sourceDistributorPaymentId: payment.id,
          sourceQuoteDocumentId: settlement.quoteDocumentId,
          sourceDealId: settlement.dealId,
          distributorName: settlement.distributorName,
          sourceAmount: payment.amount,
          sourceAmountCurrency: "KRW",
          paidOn: payment.paidOn,
        },
      },
      DISTRIBUTOR_PAYMENT_HANDOFF_ACTOR,
    )
    // 원장 저장소의 60초 이중 제출 방어(같은 고객·월·금액)에 걸리면 직전 초안이 돌아온다 —
    // 이 입금용 초안이 새로 생긴 것이 아니므로 그대로 알린다(검수자가 원장에서 금액을 합쳐 입력).
    if (dedupedRecent) return { status: "skipped", reason: `merged-into-recent-draft:${draft.id}` }
    return { status: "created", draftId: draft.id }
  } catch (error) {
    return { status: "error", error: error instanceof Error ? error.message : String(error) }
  }
}

/** 입금 기록을 지울 때 — 아직 draft 인 매출 초안만 함께 지운다. */
export async function withdrawLedgerDraftForDistributorPayment(paymentId: string): Promise<DistributorLedgerWithdrawal> {
  try {
    const drafts = await findDraftsForPayment(paymentId)
    if (drafts.length === 0) return { status: "none" }
    const locked = drafts.find((draft) => draft.status === "checked" || draft.status === "applied")
    for (const draft of drafts) {
      if (draft.status === "draft") await deleteBranchSalesLedgerDraft(draft.id)
    }
    return locked ? { status: "kept", draftStatus: locked.status } : { status: "removed" }
  } catch (error) {
    return { status: "error", error: error instanceof Error ? error.message : String(error) }
  }
}

/** 정산의 입금별 매출 원장 초안 상태(paymentId → status). 원장 표가 없으면 빈 객체. */
export async function listLedgerDraftStatusesForSettlement(
  settlementId: string
): Promise<Record<string, BranchSalesLedgerDraftStatus>> {
  const { data, error } = await createSupabaseAdminClient()
    .from("branch_sales_ledger_drafts")
    .select("id, status, metadata")
    .eq("metadata->>operation", OPERATION)
    .eq("metadata->>sourceDistributorSettlementId", settlementId)
  if (error) {
    console.warn("[distributor-payment-handoff] 원장 상태 조회 생략:", error.message)
    return {}
  }
  const statuses: Record<string, BranchSalesLedgerDraftStatus> = {}
  for (const row of (data ?? []) as LedgerDraftRow[]) {
    const paymentId = row.metadata?.sourceDistributorPaymentId
    if (typeof paymentId === "string") statuses[paymentId] = row.status
  }
  return statuses
}
