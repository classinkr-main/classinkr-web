import { describe, expect, it } from "vitest"

import { plannedLotRequest, rowsWithConsumedLots } from "@/components/admin/hardware/inventory/LotAllocationDialog"
import {
  allocatedTotal,
  confirmLotPayload,
  consumeLots,
  normalizeAllocations,
  plannedRowMayNeedLot,
  selectableLots,
  suggestLotSplit,
  validateLotAllocations,
} from "@/components/admin/hardware/inventory/lot-allocation-model"
import type { HardwareMovement } from "@/components/admin/hardware/inventory/shared"

const lots = [
  { lotNo: "H8", remaining: 0 },
  { lotNo: "C1", remaining: 2 },
  { lotNo: "C2", remaining: 5 },
]

describe("확정 물류번호 나누기", () => {
  it("잔여 1대 이상만 고를 수 있고 서버 순서를 지킨다", () => {
    expect(selectableLots(lots).map((lot) => lot.lotNo)).toEqual(["C1", "C2"])
  })

  it("같은 로트 줄을 합치고 0·빈 줄을 버린다", () => {
    expect(
      normalizeAllocations([
        { lotNo: "C1", quantity: 1 },
        { lotNo: " C1 ", quantity: 1 },
        { lotNo: "C2", quantity: 0 },
        { lotNo: "", quantity: 3 },
      ])
    ).toEqual([{ lotNo: "C1", quantity: 2 }])
    expect(allocatedTotal([{ lotNo: "C1", quantity: 2 }, { lotNo: "C2", quantity: 1.7 }])).toBe(3)
  })

  it("앞 로트부터 채우는 제안 — 모자라면 shortage 로 남긴다", () => {
    expect(suggestLotSplit(lots, 4)).toEqual({ allocations: [{ lotNo: "C1", quantity: 2 }, { lotNo: "C2", quantity: 2 }], shortage: 0 })
    expect(suggestLotSplit(lots, 9)).toEqual({ allocations: [{ lotNo: "C1", quantity: 2 }, { lotNo: "C2", quantity: 5 }], shortage: 2 })
  })

  it("합계가 확정 수량과 같고 로트마다 잔여 안이어야 통과한다", () => {
    const ok = validateLotAllocations({ productName: "S1", target: 4, lots, allocations: [{ lotNo: "C1", quantity: 2 }, { lotNo: "C2", quantity: 2 }] })
    expect(ok).toBeNull()
    expect(validateLotAllocations({ productName: "S1", target: 4, lots, allocations: [] })).toBe("S1의 물류번호를 고르세요.")
    expect(validateLotAllocations({ productName: "S1", target: 4, lots, allocations: [{ lotNo: "C1", quantity: 3 }, { lotNo: "C2", quantity: 1 }] })).toContain(
      "C1 잔여는 2대"
    )
    expect(validateLotAllocations({ productName: "S1", target: 4, lots, allocations: [{ lotNo: "C2", quantity: 3 }] })).toContain("4대 중 3대만")
  })

  it("확정 본문 — 하나면 lotNo, 여럿이면 lotAllocations, 없으면 아무것도 싣지 않는다", () => {
    expect(confirmLotPayload([])).toEqual({})
    expect(confirmLotPayload([{ lotNo: "C2", quantity: 3 }])).toEqual({ lotNo: "C2" })
    expect(confirmLotPayload([{ lotNo: "C1", quantity: 2 }, { lotNo: "C2", quantity: 1 }])).toEqual({
      lotAllocations: [{ lotNo: "C1", quantity: 2 }, { lotNo: "C2", quantity: 1 }],
    })
  })

  it("앞줄이 쓴 만큼 잔여를 뺀다(같은 품목 여러 건 확정)", () => {
    expect(consumeLots(lots, [{ lotNo: "C1", quantity: 2 }, { lotNo: "C2", quantity: 1 }])).toEqual([
      { lotNo: "H8", remaining: 0 },
      { lotNo: "C1", remaining: 0 },
      { lotNo: "C2", remaining: 4 },
    ])
    const rows = rowsWithConsumedLots([
      { entry: { itemId: "ifp86", productName: '86" IFP' }, lots, allocations: [{ lotNo: "C2", quantity: 4 }] },
      { entry: { itemId: "s1", productName: "S1" }, lots, allocations: [] },
      { entry: { itemId: "ifp86", productName: '86" IFP' }, lots, allocations: [] },
    ])
    expect(rows[1].available.find((lot) => lot.lotNo === "C2")?.remaining).toBe(5)
    expect(rows[2].available.find((lot) => lot.lotNo === "C2")?.remaining).toBe(1)
  })

  it("이미 로트가 있거나 수량만 관리하는 품목은 고르지 않는다", () => {
    expect(plannedRowMayNeedLot({ lot_no: "C1" }, { lot_tracked: true })).toBe(false)
    expect(plannedRowMayNeedLot({ lot_no: null }, { lot_tracked: false })).toBe(false)
    expect(plannedRowMayNeedLot({ lot_no: null }, undefined)).toBe(true)
    expect(plannedRowMayNeedLot({ lot_no: " " }, { lot_tracked: true })).toBe(true)
  })

  it("예정 행 → 요청 줄은 자기 자신을 잔여 계산에서 뺀다", () => {
    const movement = { id: "m1", item_id: "ifp86", product_name: '86" IFP', to_location: "남명학원", lot_no: null } as HardwareMovement
    expect(plannedLotRequest(movement, 3)).toEqual({
      key: "m1",
      itemId: "ifp86",
      productName: '86" IFP',
      destination: "남명학원",
      lotNo: null,
      quantity: 3,
      excludeMovementId: "m1",
    })
  })
})
