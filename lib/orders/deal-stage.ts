import "server-only"

import { getDeal, updateDeal } from "@/lib/portal/repositories/deals"
import { createSupabaseAdminClient } from "@/lib/supabase/admin"
import type { DealStage } from "@/lib/portal/types"

// 오더가 딜 단계를 전진시킨다 — 오더번호가 붙으면 확정(confirmed), 실제 출고가 생기면 설치(installation).
// docs/active/hardware-order-revenue-link-plan-2026-10-22.md §4-3·§4-4.
// 견적 → 계약 전환 라우트와 같은 원칙: 전진만 하고 후퇴·취소 딜은 건드리지 않는다. 실패해도 호출부를 막지 않는다.

const STAGE_RANK: Record<DealStage, number> = {
  contact: 0,
  quote: 1,
  contract: 2,
  confirmed: 3,
  installation: 4,
  payment: 5,
  closed: 6,
  cancelled: -1,
}

/** 딜이 target 보다 앞 단계일 때만 target 으로 올린다. 올렸으면 true. */
export async function advanceDealStageSafely(dealId: string | null | undefined, target: "confirmed" | "installation") {
  if (!dealId) return false
  try {
    const deal = await getDeal(dealId)
    if (!deal) return false
    const current = STAGE_RANK[deal.current_stage as DealStage]
    if (current == null || current < 0 || current >= STAGE_RANK[target]) return false
    await updateDeal(dealId, { current_stage: target })
    return true
  } catch (error) {
    console.error("[orders/deal-stage] deal stage advance skipped:", error instanceof Error ? error.message : "Error")
    return false
  }
}

/**
 * 앱에서 배송 예정을 출고 확정했을 때 — 확정 행 raw 에 실린 오더(sales_order_id)의 딜을 설치 단계로 올린다.
 * 오더 없이 만든 예정이면 아무 일도 하지 않는다.
 */
export async function advanceDealForShippedMovementSafely(movement: { raw?: unknown } | null | undefined) {
  const raw = movement?.raw
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return false
  const salesOrderId = (raw as Record<string, unknown>).sales_order_id
  if (typeof salesOrderId !== "string" || !salesOrderId) return false
  try {
    const sb = createSupabaseAdminClient()
    const { data, error } = await sb.from("sales_orders").select("deal_id,status").eq("id", salesOrderId).limit(1)
    if (error) return false
    const order = ((data ?? []) as Array<{ deal_id: string | null; status: string }>)[0]
    if (!order || order.status !== "approved") return false
    return advanceDealStageSafely(order.deal_id, "installation")
  } catch {
    return false
  }
}
