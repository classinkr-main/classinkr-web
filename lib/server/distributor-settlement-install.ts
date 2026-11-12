import "server-only"

import {
  DEFAULT_HARDWARE_DISTRIBUTOR,
  buildDistributorLinesFromQuote,
  buildInstallReviewReason,
  computeDistributorTotals,
  inferFulfillmentModeFromLots,
  isInstallReviewReason,
  type DistributorFulfillmentMode,
  type DistributorSettlementInput,
  type DistributorSettlementRecord,
} from "@/lib/distributor-settlements"
import { emitNotificationEvent } from "@/lib/notifications/emit-event"
import { getQuoteDetailsFromStructuredJson } from "@/lib/portal/quote-details"
import {
  flagDistributorSettlementReview,
  getDistributorSettlementByQuote,
  getLatestDistributorContact,
  listDistributorPriceTemplates,
  saveDistributorSettlementDraft,
} from "@/lib/repositories/distributor-settlements"
import { loadQuoteContext } from "@/lib/server/distributor-settlement-issue"
import { createSupabaseAdminClient } from "@/lib/supabase/admin"

// 설치 완료 → 총판 정산 자동 준비 · 검토 요청(2026-11).
//
// 재고 앱에서 오더로 만든 배송 예정을 출고 확정하면(PATCH /api/admin/hardware/movements/[id] confirm-planned,
// 진행 상태 '설치 완료') 그 오더의 고객 견적에 대해:
//  - 정산이 없으면 발행 전(draft) 정산을 자동으로 만든다 — 방식은 출고 로트 첫 글자(C1 = C, H1~H8 = H),
//    모르면 기본 C. 총판은 마지막에 저장한 총판(없으면 퀴드러닝), 원가는 원가 템플릿이 하나뿐일 때만 채운다.
//  - 발행 전 정산이 있으면 사람이 정한 원가·포함 여부는 건드리지 않는다.
//  - 어느 쪽이든 '검토 요청' 사유를 남기고 팀 알림을 보낸다. 자동 발행·자동 매출은 하지 않는다.
//    C방식은 사람이 '검토 완료' 버튼으로 총판 견적서를 발행하고, H방식은 같은 버튼으로 매출을 잡는다.
//  - 이미 발행·완료·취소된 정산, 오더 없는 출고, 승인되지 않은 오더는 건드리지 않는다.
//  - 같은 오더의 출고 확정이 여러 번(품목별·부분 출고) 와도 검토 요청·알림은 한 번만 한다.
//    단, 나중 출고의 로트 방식이 정산 방식과 어긋나면 그 로트 기준으로 한 번 더 요청한다.

const SYSTEM_ACTOR = "system:hardware-install"

export type InstallReviewOutcome =
  | {
      status: "review_requested"
      settlement: DistributorSettlementRecord
      created: boolean
      mode: DistributorFulfillmentMode
      reason: string
    }
  | { status: "already_requested"; settlement: DistributorSettlementRecord }
  | { status: "skipped"; reason: string }

export interface InstalledMovementLike {
  raw?: unknown
  lot_no?: string | null
  occurred_at?: string | null
  /** 출고 확정 요청의 물류번호 배정(여러 로트일 수 있다). 없으면 lot_no 한 개로 본다. */
  lotNos?: ReadonlyArray<string> | null
}

function salesOrderIdOf(movement: InstalledMovementLike) {
  const raw = movement.raw
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null
  const value = (raw as Record<string, unknown>).sales_order_id
  return typeof value === "string" && value ? value : null
}

async function readApprovedOrder(salesOrderId: string) {
  const { data, error } = await createSupabaseAdminClient()
    .from("sales_orders")
    .select("id,quote_document_id,deal_id,status")
    .eq("id", salesOrderId)
    .limit(1)
  if (error) throw new Error(error.message ?? "오더를 불러오지 못했습니다.")
  const order = ((data ?? []) as Array<{ quote_document_id: string | null; deal_id: string | null; status: string }>)[0]
  return order && order.status === "approved" && order.quote_document_id ? order : null
}

function notifyInstallReview(input: {
  settlement: DistributorSettlementRecord
  quoteNumber: string
  quoteDocumentId: string
  customerName: string | null
  reason: string
}) {
  emitNotificationEvent({
    eventType: "distributor_settlement.install_review",
    notificationType: "action_required",
    categoryTag: "finance",
    severity: "info",
    scopeTag: "org_admin",
    title: `설치 완료 — 총판 정산 검토 요청 · 견적 ${input.quoteNumber}`,
    message: [
      `${input.customerName?.trim() || "고객"} 건 하드웨어 출고가 확정됐습니다.`,
      input.reason,
      "총판 미수금 탭 '검토 대기' 또는 견적 상세 › 총판 정산에서 확인해 주세요.",
    ].join("\n"),
    routeUrl: `/admin/quotes?tab=hardware&quote=${input.quoteDocumentId}`,
    source: "distributor_settlement",
    sourceId: input.settlement.id,
    payload: { quoteNumber: input.quoteNumber, mode: input.settlement.fulfillmentMode },
    channels: ["wecom_webhook"],
  }).catch((error) => {
    console.error("[distributor-settlement] install review notification failed:", error)
  })
}

/** 출고 확정(설치 완료) 한 건 → 총판 정산 자동 준비 · 검토 요청. */
export async function requestDistributorReviewOnInstall(movement: InstalledMovementLike): Promise<InstallReviewOutcome> {
  const salesOrderId = salesOrderIdOf(movement)
  if (!salesOrderId) return { status: "skipped", reason: "오더로 만든 배송 예정이 아닙니다." }

  const order = await readApprovedOrder(salesOrderId)
  if (!order?.quote_document_id) return { status: "skipped", reason: "승인된 오더가 아닙니다." }
  const quoteDocumentId = order.quote_document_id

  const read = await getDistributorSettlementByQuote(quoteDocumentId)
  if (!read.available) return { status: "skipped", reason: read.warning }
  const existing = read.value
  // 발행·입금·설치 완료된 건은 이미 진행 중이고, 취소된 건은 사람이 일부러 끈 것이다.
  if (existing && existing.status !== "draft") {
    return { status: "skipped", reason: `정산이 이미 '${existing.status}' 상태입니다.` }
  }
  const lots = inferFulfillmentModeFromLots(movement.lotNos?.length ? movement.lotNos : [movement.lot_no])
  const lotMode = lots.mode
  if (existing && isInstallReviewReason(existing.reviewRequiredReason)) {
    // 같은 오더의 다음 출고 확정(품목별·부분 출고)은 다시 알리지 않는다. 단, 이번 로트의 방식이 정산 방식과
    // 어긋나면(예: 첫 출고 C1 로 C방식 초안 → 나머지가 H 로트) 사유를 이 로트 기준으로 고쳐 한 번 더 알린다 —
    // 그대로 두면 검토자가 H 재고분까지 C방식 총판 견적서로 발행할 수 있다. 같은 로트로 이미 알렸으면 넘어간다.
    const lotConflict = lots.mixed || (lotMode != null && lotMode !== existing.fulfillmentMode)
    const alreadyNoted = Boolean(lots.label) && Boolean(existing.reviewRequiredReason?.includes(`로트 ${lots.label}`))
    if (!lotConflict || alreadyNoted) return { status: "already_requested", settlement: existing }
  }

  const context = await loadQuoteContext(quoteDocumentId)
  if (!context) return { status: "skipped", reason: "고객 견적 버전을 찾지 못했습니다." }

  let settlement = existing
  let created = false

  if (!settlement) {
    const customerDetails = getQuoteDetailsFromStructuredJson(context.version.structured_json, {
      customerName: context.customerName,
      validUntil: context.version.valid_until,
    })
    const [templates, latestContact] = await Promise.all([listDistributorPriceTemplates(), getLatestDistributorContact()])
    // 원가 템플릿이 여러 개면 어느 것이 맞는지 사람이 고른다 — 하나뿐일 때만 채운다.
    const template = templates.value?.length === 1 ? templates.value[0] : null
    const mode: DistributorFulfillmentMode = lotMode ?? "C"
    const contact = latestContact ?? DEFAULT_HARDWARE_DISTRIBUTOR
    const lines = buildDistributorLinesFromQuote(customerDetails?.lineItems, { rules: template?.rules })
    const input: DistributorSettlementInput = {
      fulfillmentMode: mode,
      distributorName: contact.distributorName,
      distributorContactName: contact.distributorContactName ?? null,
      distributorEmail: contact.distributorEmail ?? null,
      distributorPhone: contact.distributorPhone ?? null,
      issueTrigger: "on_install",
      autoEmail: true,
      priceTemplateId: template?.id ?? null,
      lines,
      vatIncluded: true,
      dueDate: null,
      notes: null,
    }
    settlement = await saveDistributorSettlementDraft({
      quoteDocumentId,
      dealId: order.deal_id ?? context.document.deal_id ?? null,
      sourceVersionId: context.version.id,
      customerTotalAmount: context.version.total_amount,
      input,
      totals: computeDistributorTotals(lines, input.vatIncluded),
      actor: SYSTEM_ACTOR,
    })
    if (!settlement) return { status: "skipped", reason: "총판 정산을 만들지 못했습니다." }
    created = true
  }

  const reason = buildInstallReviewReason({
    mode: settlement.fulfillmentMode,
    installedOn: movement.occurred_at?.slice(0, 10) ?? null,
    created,
    lotNo: lots.label || null,
    lotMode,
    mixedLots: lots.mixed,
    missingPriceCount: computeDistributorTotals(settlement.lines, settlement.vatIncluded).missingPriceCount,
    quoteVersionChangedTo:
      settlement.sourceVersionId && settlement.sourceVersionId !== context.version.id
        ? context.version.version_number
        : null,
  })
  await flagDistributorSettlementReview(settlement.id, reason)
  const flagged = { ...settlement, reviewRequiredReason: reason }
  notifyInstallReview({
    settlement: flagged,
    quoteNumber: context.document.quote_number,
    quoteDocumentId,
    customerName: context.customerName,
    reason,
  })
  return { status: "review_requested", settlement: flagged, created, mode: settlement.fulfillmentMode, reason }
}

/** 출고 확정 라우트용 — 어떤 실패도 출고 확정 응답을 막지 않는다. */
export async function requestDistributorReviewOnInstallSafely(movement: InstalledMovementLike | null | undefined) {
  if (!movement) return null
  try {
    return await requestDistributorReviewOnInstall(movement)
  } catch (error) {
    console.error(
      "[distributor-settlement] install review skipped:",
      error instanceof Error ? error.message : error
    )
    return null
  }
}
