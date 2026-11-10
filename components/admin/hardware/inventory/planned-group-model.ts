import { plannedLotKey } from "./lot-allocation-model"
import { formatLotLabel, type HardwareMovement } from "./shared"

export interface PlannedGroup {
  key: string
  customer: string
  owner: string | null
  date: string | null
  /** 물류번호 표시(여러 개면 "C1 · C3") — 묶음 열쇠는 아니다. */
  lot: string | null
  orderNo: string | null
  totalQty: number
  items: HardwareMovement[]
}

/**
 * 배송 예정을 주문(딜) 단위로 묶는다 — 주문 → 하위 품목. 확정·수정은 품목별로 그대로다.
 *
 * 열쇠 = 오더번호가 있으면 오더번호 + 예정일, 없으면 고객사 + 담당자 + 예정일.
 * - 물류번호는 열쇠에 넣지 않는다. 한 주문의 부품이 서로 다른 번호에서 나가면(86" C1 · STD1 C3) 같은 딜이
 *   두 줄로 갈라졌다(2026-11-10 피보트수학). 번호는 묶음 머리에 모아 보여 준다.
 * - 예정일은 남긴다. 부품마다 따로 나가거나 따로 결제하는 주문(예: 86" 먼저, 스탠드는 다음 달)은 날짜마다
 *   다른 할 일이다.
 * 정렬: 예정일 최신순(날짜 없는 묶음은 뒤), 같으면 고객사 이름순.
 */
export function buildPlannedGroups(movements: readonly HardwareMovement[]): PlannedGroup[] {
  const groups = new Map<string, PlannedGroup>()
  const lotsByKey = new Map<string, string[]>()
  for (const movement of movements) {
    const customer = movement.to_location ?? "도착지 미정"
    const orderNo = movement.order_no ?? null
    const key = orderNo
      ? `order|${orderNo}|${movement.occurred_at ?? ""}`
      : `${customer}|${movement.owner ?? ""}|${movement.occurred_at ?? ""}`
    let group = groups.get(key)
    if (!group) {
      group = { key, customer, owner: movement.owner, date: movement.occurred_at, lot: null, orderNo, totalQty: 0, items: [] }
      groups.set(key, group)
    }
    group.totalQty += movement.quantity
    group.items.push(movement)
    const label = formatLotLabel(plannedLotKey(movement))
    if (label) {
      const lots = lotsByKey.get(key) ?? []
      if (!lots.includes(label)) lots.push(label)
      lotsByKey.set(key, lots)
    }
  }
  for (const [key, lots] of lotsByKey) {
    const group = groups.get(key)
    if (group) group.lot = lots.join(" · ")
  }
  return Array.from(groups.values()).sort((a, b) => {
    const at = a.date ? new Date(a.date).getTime() : Number.NEGATIVE_INFINITY
    const bt = b.date ? new Date(b.date).getTime() : Number.NEGATIVE_INFINITY
    if (at !== bt) return bt - at
    return a.customer.localeCompare(b.customer, "ko")
  })
}
