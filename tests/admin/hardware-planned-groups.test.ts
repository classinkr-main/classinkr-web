import { describe, expect, it } from "vitest"

import { buildPlannedGroups } from "@/components/admin/hardware/inventory/planned-group-model"
import type { HardwareMovement } from "@/components/admin/hardware/inventory/shared"

const planned = (patch: Partial<HardwareMovement>): HardwareMovement => ({
  id: patch.id ?? `m-${Math.random().toString(36).slice(2)}`,
  item_id: "item",
  product_name: '86" IFP',
  movement_type: "outbound",
  quantity: 1,
  occurred_at: "2026-11-03",
  from_location: "창고",
  to_location: "피보트수학",
  owner: "Wangchan",
  status: "배송 예정",
  reference_no: null,
  memo: null,
  serials: [],
  lot_no: null,
  unit_price: null,
  amount_usd: null,
  amount_cny: null,
  storage_location: null,
  importer: null,
  source: "sheet_import",
  created_at: "2026-11-10T00:00:00.000Z",
  voided_at: null,
  converted_from_movement_id: null,
  converted_to_movement_id: null,
  planned: true,
  ...patch,
})

describe("buildPlannedGroups — 주문 단위 묶음(2026-11-10)", () => {
  it("한 주문의 부품이 다른 물류번호에서 나가도 한 묶음이고, 번호는 머리에 모은다", () => {
    const groups = buildPlannedGroups([
      planned({ product_name: '86" IFP', quantity: 2, reference_no: "C1" }),
      planned({ product_name: "STD1", quantity: 2, reference_no: "C3" }),
    ])
    expect(groups).toHaveLength(1)
    expect(groups[0]).toMatchObject({ customer: "피보트수학", totalQty: 4, lot: "C1 · C3", orderNo: null })
  })

  it("부품마다 예정일이 다르면 날짜마다 따로 묶는다 — 따로 나가는(따로 결제하는) 부품은 다른 할 일이다", () => {
    const groups = buildPlannedGroups([
      planned({ to_location: "형아람", occurred_at: "2026-06-10", product_name: '86" IFP' }),
      planned({ to_location: "형아람", occurred_at: "2026-06-17", product_name: "T1" }),
    ])
    expect(groups.map((group) => group.date)).toEqual(["2026-06-17", "2026-06-10"])
  })

  it("오더번호가 있으면 담당자가 달라도 오더로 묶고, 오더번호를 싣는다", () => {
    const groups = buildPlannedGroups([
      planned({ source: "admin_manual", occurred_at: null, order_no: "ORD-2611-001", owner: "A", to_location: "고객" }),
      planned({ source: "admin_manual", occurred_at: null, order_no: "ORD-2611-001", owner: "B", to_location: "고객", product_name: "STD1" }),
      planned({ source: "admin_manual", occurred_at: null, order_no: "ORD-2611-002", owner: "A", to_location: "고객" }),
    ])
    expect(groups.map((group) => [group.orderNo, group.items.length])).toEqual([
      ["ORD-2611-001", 2],
      ["ORD-2611-002", 1],
    ])
  })
})
