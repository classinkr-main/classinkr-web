import { describe, expect, it } from "vitest"

import {
  buildOfficeSamplePool,
  OFFICE_POOL_CONFIRM_CORRECTION_TARGETS,
  officePoolGapChips,
  sampleUnitMatchesItem,
  splitPoolSelectionForQuickRecord,
} from "@/components/admin/hardware/inventory/office-sample-pool"
import type { HardwareSampleUnit, HardwareStockRow } from "@/components/admin/hardware/inventory/shared"

// 하드웨어 라운드 3 — 사무실·샘플 풀 P-5(유닛↔품목 매칭 정본)·P-6(부호 있는 원장 차이)·P-8(선택 → 빠른 기록)·P-13(끝 상태 확인).

const TODAY = "2026-09-24"

function stockRow(overrides: Partial<HardwareStockRow> & Pick<HardwareStockRow, "itemId" | "product">): HardwareStockRow {
  return {
    category: null,
    reorderPoint: 0,
    leadTimeDays: 14,
    warehouseStock: 0,
    plannedOut: 0,
    availableStock: 0,
    outbound30d: 0,
    weeklyOutboundAvg: 0,
    trendOrderPoint: 0,
    daysUntilStockout: null,
    low: false,
    orderRecommended: false,
    locationBalances: [],
    lotBalances: [],
    ...overrides,
  }
}

let unitSeq = 0
function unit(overrides: Partial<HardwareSampleUnit> & Pick<HardwareSampleUnit, "status" | "product_name">): HardwareSampleUnit {
  unitSeq += 1
  return {
    id: `unit-${unitSeq}`,
    item_id: null,
    asset_code: `S-86-${String(unitSeq).padStart(2, "0")}`,
    serial_no: null,
    current_customer: null,
    current_owner: null,
    loaned_at: null,
    expected_return_at: null,
    created_by: null,
    created_at: "2026-07-27T00:00:00Z",
    updated_at: "2026-07-27T00:00:00Z",
    ...overrides,
  }
}

describe("sampleUnitMatchesItem — 매칭 정본(P-5)", () => {
  const target = { itemId: "item-86", productName: '86" IFP' }

  it("양쪽에 item_id 가 있으면 id 로 본다 — 이름이 바뀌어도 잇고, 같은 이름의 다른 품목은 떼어 놓는다", () => {
    expect(sampleUnitMatchesItem({ item_id: "item-86", product_name: '86" IFP (구 이름)' }, target)).toBe(true)
    expect(sampleUnitMatchesItem({ item_id: "item-other", product_name: '86" IFP' }, target)).toBe(false)
  })

  it("item_id 가 없으면 공백·대소문자를 접은 이름으로 본다", () => {
    expect(sampleUnitMatchesItem({ item_id: null, product_name: ' 86"  ifp ' }, target)).toBe(true)
    expect(sampleUnitMatchesItem({ item_id: "item-86", product_name: '86" IFP' }, { itemId: null, productName: '86" IFP' })).toBe(true)
  })

  it("재고 행에 없는 item_id(비활성 품목)는 이름으로 잇는다 — 풀과 같은 규칙", () => {
    const known = new Set(["item-86"])
    expect(sampleUnitMatchesItem({ item_id: "item-retired", product_name: '86" IFP' }, target, known)).toBe(true)
    expect(sampleUnitMatchesItem({ item_id: "item-retired", product_name: '86" IFP' }, target)).toBe(false)
  })

  it("풀이 유닛을 붙인 행과 매칭 정본이 늘 같은 답을 낸다", () => {
    const stockRows = [
      stockRow({ itemId: "item-86", product: '86" IFP', warehouseStock: 3 }),
      stockRow({ itemId: "item-t1", product: "T1", warehouseStock: 2 }),
    ]
    const units = [
      unit({ status: "office", product_name: '86" IFP 신형', item_id: "item-86" }),
      unit({ status: "loaned", product_name: '86"  ifp', item_id: null }),
      unit({ status: "loaned", product_name: "T1", item_id: "item-gone" }),
      unit({ status: "office", product_name: "T1", item_id: "item-t1" }),
    ]
    const pool = buildOfficeSamplePool({ stockRows, sampleUnits: units, todayKey: TODAY })
    const known = new Set(stockRows.map((row) => row.itemId))
    for (const poolRow of pool.rows) {
      for (const attached of poolRow.units) {
        expect(sampleUnitMatchesItem(attached, { itemId: poolRow.itemId, productName: poolRow.product }, known)).toBe(true)
      }
    }
    expect(pool.rows.find((poolRow) => poolRow.itemId === "item-86")?.units).toHaveLength(2)
    expect(pool.rows.find((poolRow) => poolRow.itemId === "item-t1")?.units).toHaveLength(2)
  })
})

describe("officePoolGapChips — 부호 있는 위치별 차이(P-6)", () => {
  it("+2 와 −2 를 '4대 차이'로 뭉치지 않고 위치마다 따로 말한다", () => {
    const chips = officePoolGapChips({
      gaps: { office: 2, sample: -2 },
      ledger: { office: 6, sample: 3 },
      office: { held: 4, available: 2, showroom: 2 },
      loaned: { count: 5, long90: 0, dueSoon: 0 },
    })
    expect(chips.map((chip) => chip.chip)).toEqual(["사무실 원장 +2", "샘플 원장 −2"])
    expect(chips[0].detail).toBe("사무실: 원장 6 · 유닛 4(보관 2 + 전시 2) → 원장이 2대 많음")
    expect(chips[1].detail).toBe("샘플: 원장 3 · 대여 유닛 5 → 유닛이 2대 많음")
    expect(chips.map((chip) => chip.value)).toEqual([2, -2])
  })

  it("차이가 없는 위치는 칩을 만들지 않는다", () => {
    const chips = officePoolGapChips({
      gaps: { office: 0, sample: 1 },
      ledger: { office: 3, sample: 2 },
      office: { held: 3, available: 3, showroom: 0 },
      loaned: { count: 1, long90: 0, dueSoon: 0 },
    })
    expect(chips.map((chip) => chip.location)).toEqual(["sample"])
  })

  it("풀 행의 gaps 부호를 그대로 쓴다(원장 − 유닛)", () => {
    const pool = buildOfficeSamplePool({
      stockRows: [
        stockRow({
          itemId: "item-86",
          product: '86" IFP',
          locationBalances: [
            { location: "사무실", quantity: 1 },
            { location: "샘플", quantity: 3 },
          ],
        }),
      ],
      sampleUnits: [
        unit({ status: "office", product_name: '86" IFP', item_id: "item-86" }),
        unit({ status: "showroom", product_name: '86" IFP', item_id: "item-86" }),
        unit({ status: "loaned", product_name: '86" IFP', item_id: "item-86" }),
      ],
      todayKey: TODAY,
    })
    expect(officePoolGapChips(pool.rows[0]).map((chip) => chip.chip)).toEqual(["사무실 원장 −1", "샘플 원장 +2"])
  })
})

describe("splitPoolSelectionForQuickRecord — 선택 → 빠른 기록(P-8)", () => {
  it("대여는 사무실 보관 유닛만, 반납은 대여중 유닛만 넘긴다 — 서버 전이 규칙과 같다", () => {
    const selected = [
      unit({ status: "office", product_name: "T1" }),
      unit({ status: "loaned", product_name: "T1" }),
      unit({ status: "showroom", product_name: "T1" }),
      unit({ status: "loaned", product_name: "T1" }),
    ]
    const { loanIds, returnIds } = splitPoolSelectionForQuickRecord(selected)
    expect(loanIds).toEqual([selected[0].id])
    expect(returnIds).toEqual([selected[1].id, selected[3].id])
  })
})

describe("상태 정정 끝 상태 확인(P-13)", () => {
  it("폐기·판매 전환만 한 번 더 확인한다", () => {
    expect([...OFFICE_POOL_CONFIRM_CORRECTION_TARGETS].sort()).toEqual(["converted", "retired"])
  })
})
