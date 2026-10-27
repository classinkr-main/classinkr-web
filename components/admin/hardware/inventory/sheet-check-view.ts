// 시트 확인 탭 보기 모델 — 종류별로 묶고 종류마다 고칠 방법을 붙인다(시안 2026-10-26 "시트 확인 A").
import type { SheetOrderCheck, SheetOrderCheckKind } from "@/lib/orders/sheet-order-check"

export const SHEET_CHECK_KIND_ORDER: SheetOrderCheckKind[] = [
  "missing_order_no",
  "unknown_order_no",
  "order_not_approved",
  "product_not_in_order",
  "over_order_quantity",
]

/** 요약 칸의 짧은 이름과 고칠 방법 한 줄. */
export const SHEET_CHECK_KIND_SUMMARY: Record<SheetOrderCheckKind, { label: string; fix: string }> = {
  missing_order_no: { label: "오더번호 없음", fix: "오더번호 칸에 번호 적기" },
  unknown_order_no: { label: "없는 번호", fix: "오타 고치기" },
  order_not_approved: { label: "취소된 오더", fix: "시트 줄 지우기" },
  product_not_in_order: { label: "오더에 없는 품목", fix: "번호·품목 확인" },
  over_order_quantity: { label: "수량 초과", fix: "중복·추가분 확인" },
}

export interface SheetCheckGroup {
  kind: SheetOrderCheckKind
  checks: SheetOrderCheck[]
}

/** 정해진 종류 순서로 묶는다. 빈 종류는 뺀다. */
export function groupSheetChecks(checks: readonly SheetOrderCheck[]): SheetCheckGroup[] {
  return SHEET_CHECK_KIND_ORDER.map((kind) => ({ kind, checks: checks.filter((check) => check.kind === kind) })).filter(
    (group) => group.checks.length > 0
  )
}

/** 후보가 없을 때 그 줄을 어떻게 고칠지 — 종류마다 한 문장. */
export function sheetCheckFixText(check: SheetOrderCheck): string {
  switch (check.kind) {
    case "missing_order_no":
      return "같은 고객·품목의 승인 오더가 없습니다. 견적 승인부터 받아야 하는 출고인지 확인하세요."
    case "unknown_order_no":
      return "비슷한 승인 오더번호가 없습니다. 시트에 적힌 번호를 확인하세요."
    case "order_not_approved":
      return check.orderStatus === "cancelled"
        ? `${check.orderNo ?? "이 번호"}는 취소된 오더입니다. 시트의 이 줄을 지우거나, 다시 주문이면 견적을 새로 승인받으세요.`
        : `${check.orderNo ?? "이 번호"}는 아직 승인되지 않은 오더입니다. 승인된 뒤 출고하세요.`
    case "product_not_in_order":
      return "오더에 없는 품목입니다. 번호가 맞는지 확인하거나, 견적에 품목을 더해 새로 승인받으세요."
    case "over_order_quantity":
      return "추가 주문이면 견적을 고쳐 다시 승인받고, 시트 중복이면 줄을 지우세요."
  }
}
