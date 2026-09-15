import { readFileSync } from "node:fs"
import { join } from "node:path"

import { describe, expect, it } from "vitest"

import {
  buildOfficeSamplePool,
  isOfficePoolDueSoon,
  isOfficePoolLongLoan,
  officePoolDaysBetween,
  officePoolGapTotal,
  officePoolLoanElapsedDays,
} from "@/components/admin/hardware/inventory/office-sample-pool"
import type { HardwareSampleUnit, HardwareStockRow } from "@/components/admin/hardware/inventory/shared"

// 사무실·샘플 재고 풀 순수 모델 회귀(운영자 결정 2026-09-15).
// office=가용, showroom=전시·사내 사용(보유·가용 아님), loaned=나간 샘플. 원장 사무실·샘플 잔량은 gaps 로만 쓴다.
// 이 저장소는 React 렌더 하네스가 없어 표시·선택 UI 는 렌더 테스트하지 못한다 — 숫자 판정만 여기서 고정한다.

const TODAY = "2026-09-15"

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
function sampleUnit(
  overrides: Partial<HardwareSampleUnit> & Pick<HardwareSampleUnit, "status" | "product_name">
): HardwareSampleUnit {
  unitSeq += 1
  return {
    id: `unit-${unitSeq}`,
    item_id: null,
    asset_code: `S-X-${String(unitSeq).padStart(2, "0")}`,
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

describe("사무실 샘플 풀 — 날짜 경계", () => {
  it("대여 90일째부터 90일+ 로 센다(89일은 아님)", () => {
    expect(officePoolDaysBetween("2026-06-17", TODAY)).toBe(90)
    expect(isOfficePoolLongLoan({ status: "loaned", loaned_at: "2026-06-17" }, TODAY)).toBe(true)
    expect(isOfficePoolLongLoan({ status: "loaned", loaned_at: "2026-06-18" }, TODAY)).toBe(false)
    // 대여가 아니면 오래돼도 90일+ 가 아니다.
    expect(isOfficePoolLongLoan({ status: "office", loaned_at: "2024-01-01" }, TODAY)).toBe(false)
    expect(isOfficePoolLongLoan({ status: "loaned", loaned_at: null }, TODAY)).toBe(false)
  })

  it("회수 예정일이 14일 이내(14일째 포함)이거나 지났으면 회수 예정으로 센다", () => {
    expect(isOfficePoolDueSoon({ status: "loaned", expected_return_at: "2026-09-29" }, TODAY)).toBe(true)
    expect(isOfficePoolDueSoon({ status: "loaned", expected_return_at: "2026-09-30" }, TODAY)).toBe(false)
    expect(isOfficePoolDueSoon({ status: "loaned", expected_return_at: TODAY }, TODAY)).toBe(true)
    expect(isOfficePoolDueSoon({ status: "loaned", expected_return_at: "2026-08-01" }, TODAY)).toBe(true)
    expect(isOfficePoolDueSoon({ status: "loaned", expected_return_at: null }, TODAY)).toBe(false)
    expect(isOfficePoolDueSoon({ status: "showroom", expected_return_at: "2026-09-20" }, TODAY)).toBe(false)
  })

  it("월말·윤년을 날짜 단위로 계산하고 잘못된 날짜는 null 이다", () => {
    expect(officePoolDaysBetween("2028-02-28", "2028-03-01")).toBe(2)
    expect(officePoolDaysBetween("2026-02-30", TODAY)).toBeNull()
    expect(officePoolDaysBetween("not-a-date", TODAY)).toBeNull()
    expect(officePoolLoanElapsedDays({ status: "loaned", loaned_at: "2026-09-20" }, TODAY)).toBe(0)
    expect(officePoolLoanElapsedDays({ status: "office", loaned_at: "2026-09-01" }, TODAY)).toBeNull()
  })
})

describe("사무실 샘플 풀 — 제품별 집계", () => {
  it("office 는 가용, showroom 은 보유에만, loaned 는 나간 샘플로 센다", () => {
    const pool = buildOfficeSamplePool({
      todayKey: TODAY,
      stockRows: [
        stockRow({
          itemId: "item-86",
          product: '86" IFP',
          warehouseStock: 12,
          availableStock: 10,
          plannedOut: 2,
          locationBalances: [
            { location: "창고", quantity: 12 },
            { location: "사무실", quantity: 5 },
            { location: "샘플", quantity: 3 },
          ],
        }),
      ],
      sampleUnits: [
        sampleUnit({ product_name: '86" IFP', item_id: "item-86", status: "office", asset_code: "S-86-10", id: "u10" }),
        sampleUnit({ product_name: '86" IFP', item_id: "item-86", status: "office", asset_code: "S-86-02", id: "u02" }),
        sampleUnit({ product_name: '86" IFP', item_id: "item-86", status: "showroom", asset_code: "S-86-01", id: "u01" }),
        sampleUnit({ product_name: '86" IFP', item_id: "item-86", status: "loaned", loaned_at: "2024-04-01" }),
        sampleUnit({ product_name: '86" IFP', item_id: "item-86", status: "loaned", loaned_at: "2026-09-01", expected_return_at: "2026-09-20" }),
        sampleUnit({ product_name: '86" IFP', item_id: "item-86", status: "loaned", loaned_at: "2026-09-10" }),
        sampleUnit({ product_name: '86" IFP', item_id: "item-86", status: "loaned", loaned_at: "2026-09-10" }),
        sampleUnit({ product_name: '86" IFP', item_id: "item-86", status: "repair" }),
        sampleUnit({ product_name: '86" IFP', item_id: "item-86", status: "converted" }),
        sampleUnit({ product_name: '86" IFP', item_id: "item-86", status: "retired" }),
      ],
    })

    expect(pool.rows).toHaveLength(1)
    const [row] = pool.rows
    expect(row.warehouse).toEqual({ stock: 12, available: 10, planned: 2 })
    expect(row.office).toEqual({ held: 3, available: 2, showroom: 1 })
    expect(row.loaned).toEqual({ count: 4, long90: 1, dueSoon: 1 })
    expect(row.repair).toBe(1)
    expect(row.ledger).toEqual({ office: 5, sample: 3 })
    // gaps = 원장 − 유닛: 사무실 5 − 3 = 2, 샘플 3 − 4 = −1
    expect(row.gaps).toEqual({ office: 2, sample: -1 })
    expect(officePoolGapTotal(row)).toBe(3)
    expect(pool.gapRowCount).toBe(1)
    // 가용 유닛은 관리번호 정렬(숫자 인식), id 는 같은 순서
    expect(row.availableUnits).toEqual(["S-86-02", "S-86-10"])
    expect(row.availableUnitIds).toEqual(["u02", "u10"])
    // 펼침 목록은 상태 순서(가용 → 전시 → 대여 → 수리 → 전환 → 폐기)
    expect(row.units.map((unit) => unit.status)).toEqual([
      "office",
      "office",
      "showroom",
      "loaned",
      "loaned",
      "loaned",
      "loaned",
      "repair",
      "converted",
      "retired",
    ])
    expect(row.hasPoolActivity).toBe(true)
  })

  it("gaps 가 0 이면 차이 행으로 세지 않는다", () => {
    const pool = buildOfficeSamplePool({
      todayKey: TODAY,
      stockRows: [
        stockRow({ itemId: "item-t1", product: "T1", locationBalances: [{ location: "사무실", quantity: 1 }] }),
      ],
      sampleUnits: [sampleUnit({ product_name: "T1", item_id: "item-t1", status: "showroom" })],
    })
    expect(pool.rows[0].gaps).toEqual({ office: 0, sample: 0 })
    expect(pool.gapRowCount).toBe(0)
  })

  it("합계는 판촉형을 빼고, 판촉형은 promotedTotals 로 따로 모은다", () => {
    const pool = buildOfficeSamplePool({
      todayKey: TODAY,
      stockRows: [
        stockRow({ itemId: "item-std1", product: "STD1", warehouseStock: 35, availableStock: 30, plannedOut: 5 }),
        stockRow({ itemId: "item-std1p", product: "STD1(promoted)", warehouseStock: -16, availableStock: -16 }),
      ],
      sampleUnits: [
        sampleUnit({ product_name: "STD1", item_id: "item-std1", status: "loaned", loaned_at: "2026-01-01" }),
        sampleUnit({ product_name: "STD1", item_id: "item-std1", status: "office" }),
        sampleUnit({ product_name: "STD1(promoted)", item_id: "item-std1p", status: "loaned", loaned_at: "2025-02-01" }),
        sampleUnit({ product_name: "STD1(promoted)", item_id: "item-std1p", status: "loaned", loaned_at: "2026-07-27" }),
      ],
    })

    expect(pool.rows.map((row) => [row.product, row.promoted])).toEqual([
      ["STD1", false],
      ["STD1(promoted)", true],
    ])
    expect(pool.totals.warehouse).toEqual({ stock: 35, available: 30, planned: 5 })
    expect(pool.totals.office).toEqual({ held: 1, available: 1, showroom: 0 })
    expect(pool.totals.loaned).toEqual({ count: 1, long90: 1, dueSoon: 0 })
    expect(pool.promotedTotals?.warehouse.stock).toBe(-16)
    expect(pool.promotedTotals?.loaned).toEqual({ count: 2, long90: 1, dueSoon: 0 })
  })

  it("판촉형 행이 없으면 promotedTotals 는 null 이다", () => {
    const pool = buildOfficeSamplePool({
      todayKey: TODAY,
      stockRows: [stockRow({ itemId: "item-86", product: '86" IFP', warehouseStock: 1, availableStock: 1 })],
      sampleUnits: [],
    })
    expect(pool.promotedTotals).toBeNull()
  })
})

describe("사무실 샘플 풀 — 행 노출·연결·순서", () => {
  it("창고·유닛·원장 사무실/샘플이 모두 0 인 품목은 뺀다", () => {
    const pool = buildOfficeSamplePool({
      todayKey: TODAY,
      stockRows: [
        stockRow({ itemId: "item-zero", product: "POE" }),
        stockRow({ itemId: "item-cable", product: "전원 케이블(1m)", warehouseStock: 40, availableStock: 40 }),
        stockRow({ itemId: "item-ledger", product: "S1", locationBalances: [{ location: "샘플", quantity: 2 }] }),
      ],
      sampleUnits: [],
    })

    // 핵심 품목·보드가 아닌 행은 재고 응답 순서를 지킨다(위치 맵과 같은 규칙). 화면이 활동 행을 먼저 보여 준다.
    expect(pool.rows.map((row) => row.product)).toEqual(["전원 케이블(1m)", "S1"])
    const cable = pool.rows.find((row) => row.product === "전원 케이블(1m)")
    expect(cable?.hasPoolActivity).toBe(false)
    expect(pool.rows.find((row) => row.product === "S1")?.hasPoolActivity).toBe(true)
  })

  it("판매 전환·폐기 유닛만 있는 품목은 행을 띄우지 않는다", () => {
    const pool = buildOfficeSamplePool({
      todayKey: TODAY,
      stockRows: [stockRow({ itemId: "item-65", product: '65" IFP' })],
      sampleUnits: [sampleUnit({ product_name: '65" IFP', item_id: "item-65", status: "converted" })],
    })
    expect(pool.rows).toHaveLength(0)
  })

  it("위치 맵 숨김 품목(A1·B1·D2)은 창고만 있으면 빼고, 유닛이 생기면 보인다", () => {
    const stockRows = [
      stockRow({ itemId: "item-a1", product: "A1", warehouseStock: 30, availableStock: 30 }),
      stockRow({ itemId: "item-b1", product: "B1", warehouseStock: 30, availableStock: 30 }),
    ]
    const pool = buildOfficeSamplePool({
      todayKey: TODAY,
      stockRows,
      sampleUnits: [sampleUnit({ product_name: "B1", item_id: "item-b1", status: "office" })],
    })
    expect(pool.rows.map((row) => row.product)).toEqual(["B1"])
  })

  it("유닛은 item_id 로, 없으면 제품명(공백·대소문자 무시)으로 잇고, 못 이으면 자기 행을 만든다", () => {
    const pool = buildOfficeSamplePool({
      todayKey: TODAY,
      stockRows: [stockRow({ itemId: "item-std1", product: "STD1" })],
      sampleUnits: [
        sampleUnit({ product_name: "STD1", item_id: "item-std1", status: "office" }),
        sampleUnit({ product_name: " std1 ", item_id: null, status: "showroom" }),
        sampleUnit({ product_name: "옛 데모 키트", item_id: "item-gone", status: "loaned", loaned_at: "2026-01-01" }),
      ],
    })

    expect(pool.rows.map((row) => [row.product, row.itemId])).toEqual([
      ["STD1", "item-std1"],
      ["옛 데모 키트", "item-gone"],
    ])
    expect(pool.rows[0].office).toEqual({ held: 2, available: 1, showroom: 1 })
    expect(pool.rows[1].warehouse).toEqual({ stock: 0, available: 0, planned: 0 })
    expect(pool.rows[1].loaned.count).toBe(1)
  })

  it("재고 위치 맵과 같은 순서 — 86 → 75 → T1 → STD1 → STD1 판촉 → 보드(큰 인치) → 나머지", () => {
    const pool = buildOfficeSamplePool({
      todayKey: TODAY,
      stockRows: [
        stockRow({ itemId: "ops", product: "OPS", warehouseStock: 3 }),
        stockRow({ itemId: "65", product: '65" IFP', warehouseStock: 1 }),
        stockRow({ itemId: "std1p", product: "STD1(promoted)", warehouseStock: 1 }),
        stockRow({ itemId: "110", product: '110" IFP', warehouseStock: 1 }),
        stockRow({ itemId: "std1", product: "STD1", warehouseStock: 1 }),
        stockRow({ itemId: "t1", product: "T1", warehouseStock: 1 }),
        stockRow({ itemId: "75", product: '75" IFP', warehouseStock: 1 }),
        stockRow({ itemId: "86", product: '86" IFP', warehouseStock: 1 }),
      ],
      sampleUnits: [],
    })

    expect(pool.rows.map((row) => row.product)).toEqual([
      '86" IFP',
      '75" IFP',
      "T1",
      "STD1",
      "STD1(promoted)",
      '110" IFP',
      '65" IFP',
      "OPS",
    ])
  })

  it("유닛 목록을 아직 받지 않았으면(null) 유닛 수는 0, 원장·창고 값은 그대로다", () => {
    const pool = buildOfficeSamplePool({
      todayKey: TODAY,
      stockRows: [
        stockRow({
          itemId: "item-86",
          product: '86" IFP',
          warehouseStock: 4,
          availableStock: 4,
          locationBalances: [{ location: "사무실", quantity: 8 }],
        }),
      ],
      sampleUnits: null,
    })
    expect(pool.rows[0].office.held).toBe(0)
    expect(pool.rows[0].ledger.office).toBe(8)
    expect(pool.totals.warehouse.stock).toBe(4)
  })
})

describe("OfficeSamplePoolSection — 샘플 유닛 데이터 계약", () => {
  const source = readFileSync(
    join(process.cwd(), "components/admin/hardware/inventory/OfficeSamplePoolSection.tsx"),
    "utf8"
  )

  it("샘플 유닛을 직접 조회하지 않는다 — 부모가 받은 목록을 props 로 쓰고 쓰기 후 onUnitsChanged 로 다시 받게 한다", () => {
    expect(source).not.toMatch(/useEffect\s*\(/)
    expect(source).not.toMatch(/adminFetchJsonCached/)
    expect(source).not.toMatch(/method:\s*"GET"/)
    expect(source).toMatch(/method:\s*"POST"/)
    expect(source).toContain("await onUnitsChanged()")
  })

  it("일괄 액션은 샘플 API 의 event 액션으로 showcase·store·adjust(nextStatus)를 보낸다", () => {
    expect(source).toContain('const SAMPLES_API = "/api/admin/hardware/samples"')
    expect(source).toContain('action: "event"')
    expect(source).toContain("{ eventType }")
    expect(source).toContain('eventType: "adjust", nextStatus: target')
  })
})
