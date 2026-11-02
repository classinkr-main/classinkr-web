import "server-only"

import { advanceDealStageSafely } from "@/lib/orders/deal-stage"
import {
  orderNosWithActualSheetOutbound,
  rawOrderNo,
  selectAppRowsReplacedBySheet,
  type LedgerOrderRow,
} from "@/lib/orders/sheet-order-check"
import { createSupabaseAdminClient } from "@/lib/supabase/admin"

// 시트 가져오기 직후 — 오더번호가 적힌 시트 출고 줄을 오더에 묶는다(연결 로직 §4-4).
//  1) 같은 오더·품목을 앱이 만든 예정·출고는 취소한다(§8-6 "시트가 이긴다" — 같은 물량이 두 번 잡히지 않게).
//  2) 시트에 실제 출고가 생긴 오더의 딜을 설치 단계로 올린다.
// 가져오기는 이미 커밋된 뒤라, 여기 실패는 가져오기를 실패로 만들지 않는다(실행 기록에 남긴다).

export const SHEET_ORDER_REPLACE_REASON = "시트 출고 줄이 같은 오더번호로 대체(연결 로직 §4-4, 시트가 이긴다)"

export interface SheetOrderLinkResult {
  appRowsReplaced: number
  dealsAdvanced: number
  error: string | null
}

interface ImportedRowLike {
  product_name: string | null
  movement_type: string
  status: string | null
  raw: unknown
}

function isMissingTable(error: { code?: string } | null) {
  return error?.code === "42P01" || error?.code === "PGRST205"
}

export async function linkSheetOutboundToOrders(
  importedRows: readonly ImportedRowLike[],
  options: { actor?: string | null } = {}
): Promise<SheetOrderLinkResult> {
  const sheetRows: LedgerOrderRow[] = importedRows
    .filter((row) => row.movement_type === "outbound")
    .map((row, index) => ({
      id: `sheet-${index}`,
      productName: row.product_name,
      status: row.status,
      orderNo: rawOrderNo(row.raw),
    }))
    .filter((row) => row.orderNo)
  if (sheetRows.length === 0) return { appRowsReplaced: 0, dealsAdvanced: 0, error: null }

  const orderNos = Array.from(new Set(sheetRows.map((row) => row.orderNo as string)))
  const sb = createSupabaseAdminClient()
  let appRowsReplaced = 0
  let dealsAdvanced = 0

  try {
    const { data: appData, error: appError } = await sb
      .from("hardware_movements")
      .select("id,product_name,status,raw")
      .eq("source", "admin_manual")
      .eq("movement_type", "outbound")
      .is("voided_at", null)
      .in("raw->>order_no", orderNos)
    if (appError) throw appError
    const appRows: LedgerOrderRow[] = ((appData ?? []) as Array<{
      id: string
      product_name: string | null
      status: string | null
      raw: unknown
    }>).map((row) => ({ id: row.id, productName: row.product_name, status: row.status, orderNo: rawOrderNo(row.raw) }))

    const replaceIds = selectAppRowsReplacedBySheet(sheetRows, appRows)
    if (replaceIds.length > 0) {
      const { error: voidError } = await sb
        .from("hardware_movements")
        .update({
          voided_at: new Date().toISOString(),
          voided_by: options.actor ?? null,
          void_reason: SHEET_ORDER_REPLACE_REASON,
        })
        .in("id", replaceIds)
        .is("voided_at", null)
      if (voidError) throw voidError
      appRowsReplaced = replaceIds.length
    }

    const shippedOrderNos = orderNosWithActualSheetOutbound(sheetRows)
    if (shippedOrderNos.length > 0) {
      const { data: orders, error: ordersError } = await sb
        .from("sales_orders")
        .select("order_no,deal_id,status")
        .in("order_no", shippedOrderNos)
        .eq("status", "approved")
      if (ordersError && !isMissingTable(ordersError)) throw ordersError
      const dealIds = new Set(
        ((orders ?? []) as Array<{ deal_id: string | null }>).map((order) => order.deal_id).filter(Boolean) as string[]
      )
      for (const dealId of dealIds) {
        if (await advanceDealStageSafely(dealId, "installation")) dealsAdvanced += 1
      }
    }
    return { appRowsReplaced, dealsAdvanced, error: null }
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : error && typeof error === "object" && "message" in error
          ? String((error as { message?: unknown }).message)
          : "오더 연결 실패"
    return { appRowsReplaced, dealsAdvanced, error: message.slice(0, 300) }
  }
}
