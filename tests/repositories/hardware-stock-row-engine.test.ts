import { afterEach, describe, expect, it, vi } from "vitest"

// 감사(2026-09-07 #3): 재고 산식 엔진(위치별/lot별 잔량·30일 추세·재주문점)이
// getHardwareDashboardUncached의 .map() 콜백에 인라인으로만 있어 실측 테스트가 0건이었다.
// lib/repositories/hardware-inventory.ts에서 computeHardwareStockRow로 순수 함수 추출(동작 변경
// 없음) 후 이 파일이 그 산식을 직접 검증한다.
//
// hardware-inventory.ts는 모듈 최상단에서 unstable_cache(next/cache)를 호출하므로, 다른
// 하드웨어 repository 테스트(hardware-inventory.test.ts)와 같은 목킹 없이는 import 자체가
// 실패한다 — computeHardwareStockRow는 순수 함수라도 같은 모듈에 있어 예외가 아니다.

type HardwareMovementType = "inbound" | "outbound" | "return" | "transfer" | "repair" | "adjust"

interface MovementFixture {
  id: string
  item_id: string
  product_name: string
  movement_type: HardwareMovementType
  quantity: number
  occurred_at: string | null
  from_location: string | null
  to_location: string | null
  owner: string | null
  status: string | null
  reference_no: string | null
  memo: string | null
  serials: string[]
  lot_no: string | null
  unit_price: number | null
  amount_usd: number | null
  amount_cny: number | null
  storage_location: string | null
  importer: string | null
  source: "admin_manual" | "sheet_import"
  raw: unknown
  created_at: string
  voided_at: string | null
  converted_from_movement_id: string | null
  converted_to_movement_id: string | null
}

function movement(overrides: Partial<MovementFixture> & Pick<MovementFixture, "movement_type" | "quantity">): MovementFixture {
  return {
    id: overrides.id ?? `m-${Math.random().toString(36).slice(2)}`,
    item_id: "item-1",
    product_name: "86 IFP",
    occurred_at: "2026-09-01",
    from_location: null,
    to_location: null,
    owner: null,
    status: null,
    reference_no: null,
    memo: null,
    serials: [],
    lot_no: null,
    unit_price: null,
    amount_usd: null,
    amount_cny: null,
    storage_location: null,
    importer: null,
    source: "admin_manual",
    raw: {},
    created_at: "2026-09-01T00:00:00.000Z",
    voided_at: null,
    converted_from_movement_id: null,
    converted_to_movement_id: null,
    ...overrides,
  }
}

const ITEM = { id: "item-1", name: "86 IFP", category: "전자칠판", reorder_point: 2, lead_time_days: 14 }
// "지금"을 고정 — occurred_at이 이 기준 30일 안/밖인지로 outbound30d 경계를 테스트한다.
const NOW = new Date("2026-09-10T00:00:00.000Z").getTime()
const CUTOFF_30D = NOW - 30 * 24 * 60 * 60 * 1000

async function loadEngine() {
  vi.resetModules()
  vi.doMock("next/cache", () => ({
    revalidateTag: vi.fn(),
    unstable_cache: (fn: unknown) => fn,
  }))
  vi.doMock("@/lib/supabase/admin", () => ({
    createSupabaseAdminClient: vi.fn(),
  }))
  vi.doMock("@/lib/repositories/branch-hw", () => ({
    fetchAllSupabaseRows: vi.fn(async () => []),
    listFreshHwInbound: vi.fn(),
    listFreshHwOutbound: vi.fn(),
    listFreshHwStock: vi.fn(),
  }))
  const { computeHardwareStockRow } = await import("@/lib/repositories/hardware-inventory")
  return computeHardwareStockRow
}

afterEach(() => {
  vi.restoreAllMocks()
  vi.resetModules()
})

describe("computeHardwareStockRow — warehouse/available/planned", () => {
  it("adds inbound quantity to the warehouse location", async () => {
    const compute = await loadEngine()
    const row = compute({
      item: ITEM,
      itemMovements: [movement({ movement_type: "inbound", quantity: 5, to_location: "창고" })],
      cutoff30dMs: CUTOFF_30D,
    })
    expect(row.warehouseStock).toBe(5)
    expect(row.availableStock).toBe(5)
    expect(row.plannedOut).toBe(0)
  })

  it("inbound with no to_location defaults to the warehouse", async () => {
    const compute = await loadEngine()
    const row = compute({
      item: ITEM,
      itemMovements: [movement({ movement_type: "inbound", quantity: 4, to_location: null })],
      cutoff30dMs: CUTOFF_30D,
    })
    expect(row.warehouseStock).toBe(4)
  })

  it("actual (non-planned) outbound reduces the warehouse and credits the destination", async () => {
    const compute = await loadEngine()
    const row = compute({
      item: ITEM,
      itemMovements: [
        movement({ movement_type: "inbound", quantity: 10, to_location: "창고" }),
        movement({ movement_type: "outbound", quantity: 3, from_location: "창고", to_location: "남명학원", status: "출고" }),
      ],
      cutoff30dMs: CUTOFF_30D,
    })
    expect(row.warehouseStock).toBe(7)
    expect(row.availableStock).toBe(7)
    expect(row.plannedOut).toBe(0)
    expect(row.locationBalances).toEqual(
      expect.arrayContaining([{ location: "남명학원", quantity: 3 }])
    )
  })

  it("planned outbound is held out of the warehouse ledger but subtracted from available stock", async () => {
    const compute = await loadEngine()
    const row = compute({
      item: ITEM,
      itemMovements: [
        movement({ movement_type: "inbound", quantity: 10, to_location: "창고" }),
        movement({ movement_type: "outbound", quantity: 4, from_location: "창고", to_location: "고객사A", status: "배송 예정" }),
      ],
      cutoff30dMs: CUTOFF_30D,
    })
    // 예정은 위치 원장을 건드리지 않는다 — warehouseStock은 그대로, availableStock만 차감.
    expect(row.warehouseStock).toBe(10)
    expect(row.plannedOut).toBe(4)
    expect(row.availableStock).toBe(6)
  })

  it("recognizes 예약/대기/planned status text as planned, in addition to 예정", async () => {
    const compute = await loadEngine()
    for (const status of ["예약", "대기", "planned", "Planned"]) {
      const row = compute({
        item: ITEM,
        itemMovements: [movement({ movement_type: "outbound", quantity: 1, from_location: "창고", to_location: "고객", status })],
        cutoff30dMs: CUTOFF_30D,
      })
      expect(row.plannedOut, `status=${status}`).toBe(1)
    }
  })

  it("return moves quantity from the source and back into the warehouse by default", async () => {
    const compute = await loadEngine()
    const row = compute({
      item: ITEM,
      itemMovements: [movement({ movement_type: "return", quantity: 2, from_location: "샘플", to_location: null })],
      cutoff30dMs: CUTOFF_30D,
    })
    expect(row.warehouseStock).toBe(2)
    expect(row.locationBalances).toEqual(expect.arrayContaining([{ location: "샘플", quantity: -2 }]))
  })

  it("transfer moves quantity between two named locations (no default destination)", async () => {
    const compute = await loadEngine()
    const row = compute({
      item: ITEM,
      itemMovements: [
        movement({ movement_type: "inbound", quantity: 5, to_location: "창고" }),
        movement({ movement_type: "transfer", quantity: 2, from_location: "창고", to_location: "사무실" }),
      ],
      cutoff30dMs: CUTOFF_30D,
    })
    expect(row.warehouseStock).toBe(3)
    expect(row.locationBalances).toEqual(expect.arrayContaining([{ location: "사무실", quantity: 2 }]))
  })

  it("repair defaults from=warehouse and to=수리 when locations are omitted", async () => {
    const compute = await loadEngine()
    const row = compute({
      item: ITEM,
      itemMovements: [
        movement({ movement_type: "inbound", quantity: 5, to_location: "창고" }),
        movement({ movement_type: "repair", quantity: 1, from_location: null, to_location: null }),
      ],
      cutoff30dMs: CUTOFF_30D,
    })
    expect(row.warehouseStock).toBe(4)
    expect(row.locationBalances).toEqual(expect.arrayContaining([{ location: "수리", quantity: 1 }]))
  })

  it("adjust with only a from_location subtracts from that location (draw-down correction)", async () => {
    const compute = await loadEngine()
    const row = compute({
      item: ITEM,
      itemMovements: [
        movement({ movement_type: "inbound", quantity: 10, to_location: "창고" }),
        movement({ movement_type: "adjust", quantity: 3, from_location: "창고", to_location: null }),
      ],
      cutoff30dMs: CUTOFF_30D,
    })
    expect(row.warehouseStock).toBe(7)
  })

  it("adjust with a to_location (or neither) adds to that location, defaulting to the warehouse", async () => {
    const compute = await loadEngine()
    const row = compute({
      item: ITEM,
      itemMovements: [movement({ movement_type: "adjust", quantity: 6, from_location: null, to_location: null })],
      cutoff30dMs: CUTOFF_30D,
    })
    expect(row.warehouseStock).toBe(6)
  })

  it("negative warehouse stock (ledger anomaly) is preserved, not floored at zero", async () => {
    const compute = await loadEngine()
    const row = compute({
      item: ITEM,
      itemMovements: [movement({ movement_type: "outbound", quantity: 5, from_location: "창고", to_location: "고객", status: "출고" })],
      cutoff30dMs: CUTOFF_30D,
    })
    expect(row.warehouseStock).toBe(-5)
    expect(row.availableStock).toBe(-5)
  })
})

describe("computeHardwareStockRow — lot balances", () => {
  it("inbound and return credit a lot; outbound debits it even when planned", async () => {
    const compute = await loadEngine()
    const row = compute({
      item: ITEM,
      itemMovements: [
        movement({ movement_type: "inbound", quantity: 10, to_location: "창고", lot_no: "H9" }),
        movement({ movement_type: "outbound", quantity: 2, from_location: "창고", to_location: "고객", status: "배송 예정", lot_no: "H9" }),
      ],
      cutoff30dMs: CUTOFF_30D,
    })
    // FIFO 배정은 lot 잔량 기준이라, 예정 출고도 즉시 lot에서 빠져야 이중 배정을 막는다.
    expect(row.lotBalances).toEqual([{ lot: "H9", quantity: 8 }])
  })

  it("falls back to reference_no as the lot key for sheet-imported rows without lot_no", async () => {
    const compute = await loadEngine()
    const row = compute({
      item: ITEM,
      itemMovements: [
        movement({
          movement_type: "inbound",
          quantity: 4,
          to_location: "창고",
          lot_no: null,
          reference_no: "H8",
          source: "sheet_import",
        }),
      ],
      cutoff30dMs: CUTOFF_30D,
    })
    expect(row.lotBalances).toEqual([{ lot: "H8", quantity: 4 }])
  })

  it("does not use reference_no as a lot key for admin_manual rows", async () => {
    const compute = await loadEngine()
    const row = compute({
      item: ITEM,
      itemMovements: [
        movement({
          movement_type: "inbound",
          quantity: 4,
          to_location: "창고",
          lot_no: null,
          reference_no: "deal:123",
          source: "admin_manual",
        }),
      ],
      cutoff30dMs: CUTOFF_30D,
    })
    expect(row.lotBalances).toEqual([])
  })

  it("transfer and repair preserve lot balance (no lot delta)", async () => {
    const compute = await loadEngine()
    const row = compute({
      item: ITEM,
      itemMovements: [
        movement({ movement_type: "inbound", quantity: 5, to_location: "창고", lot_no: "H9" }),
        movement({ movement_type: "transfer", quantity: 2, from_location: "창고", to_location: "사무실", lot_no: "H9" }),
      ],
      cutoff30dMs: CUTOFF_30D,
    })
    expect(row.lotBalances).toEqual([{ lot: "H9", quantity: 5 }])
  })

  it("hides zero and negative lot balances from the response (sorted by quantity desc)", async () => {
    const compute = await loadEngine()
    const row = compute({
      item: ITEM,
      itemMovements: [
        movement({ movement_type: "inbound", quantity: 3, to_location: "창고", lot_no: "H7" }),
        movement({ movement_type: "inbound", quantity: 8, to_location: "창고", lot_no: "H8" }),
        movement({ movement_type: "outbound", quantity: 3, from_location: "창고", to_location: "고객", status: "출고", lot_no: "H7" }),
      ],
      cutoff30dMs: CUTOFF_30D,
    })
    expect(row.lotBalances).toEqual([{ lot: "H8", quantity: 8 }])
  })
})

describe("computeHardwareStockRow — 30일 출고 추세·재주문점", () => {
  it("only counts outbound within the 30-day cutoff window", async () => {
    const compute = await loadEngine()
    const row = compute({
      item: ITEM,
      itemMovements: [
        movement({ movement_type: "outbound", quantity: 5, from_location: "창고", to_location: "고객", status: "출고", occurred_at: "2026-09-05" }),
        movement({ movement_type: "outbound", quantity: 9, from_location: "창고", to_location: "고객", status: "출고", occurred_at: "2026-01-01" }),
      ],
      cutoff30dMs: CUTOFF_30D,
    })
    expect(row.outbound30d).toBe(5)
  })

  it("excludes sample/office/repair destinations from the 30-day outbound trend", async () => {
    const compute = await loadEngine()
    const row = compute({
      item: ITEM,
      itemMovements: [
        movement({ movement_type: "outbound", quantity: 2, from_location: "창고", to_location: "샘플", status: "샘플/대여", occurred_at: "2026-09-05" }),
        movement({ movement_type: "outbound", quantity: 3, from_location: "창고", to_location: "사무실", status: "샘플 배정", occurred_at: "2026-09-05" }),
        movement({ movement_type: "outbound", quantity: 1, from_location: "창고", to_location: "수리", status: "수리중", occurred_at: "2026-09-05" }),
        movement({ movement_type: "outbound", quantity: 4, from_location: "창고", to_location: "고객사B", status: "출고", occurred_at: "2026-09-05" }),
      ],
      cutoff30dMs: CUTOFF_30D,
    })
    expect(row.outbound30d).toBe(4)
  })

  it("derives weeklyOutboundAvg and trendOrderPoint from the 30-day total", async () => {
    const compute = await loadEngine()
    const row = compute({
      item: { ...ITEM, reorder_point: 2, lead_time_days: 14 },
      itemMovements: [
        movement({ movement_type: "outbound", quantity: 30, from_location: "창고", to_location: "고객", status: "출고", occurred_at: "2026-09-05" }),
      ],
      cutoff30dMs: CUTOFF_30D,
    })
    // weeklyOutboundAvg = 30 / 30 * 7 = 7. trendOrderPoint = ceil(7 * 14/7 + 2) = ceil(16) = 16.
    expect(row.weeklyOutboundAvg).toBe(7)
    expect(row.trendOrderPoint).toBe(16)
  })

  it("reports null daysUntilStockout when there is no recent outbound activity", async () => {
    const compute = await loadEngine()
    const row = compute({
      item: ITEM,
      itemMovements: [movement({ movement_type: "inbound", quantity: 10, to_location: "창고" })],
      cutoff30dMs: CUTOFF_30D,
    })
    expect(row.daysUntilStockout).toBeNull()
  })

  it("computes daysUntilStockout from available stock over the daily average, floored at zero", async () => {
    const compute = await loadEngine()
    const row = compute({
      item: ITEM,
      itemMovements: [
        movement({ movement_type: "inbound", quantity: 10, to_location: "창고", occurred_at: "2026-01-01" }),
        movement({ movement_type: "outbound", quantity: 15, from_location: "창고", to_location: "고객", status: "출고", occurred_at: "2026-09-05" }),
      ],
      cutoff30dMs: CUTOFF_30D,
    })
    // dailyAvg = 15/30 = 0.5. availableStock = 10 - 15 = -5 → floor(-5/0.5) 이 음수라 0으로 clamp.
    expect(row.availableStock).toBe(-5)
    expect(row.daysUntilStockout).toBe(0)
  })
})

describe("computeHardwareStockRow — low/orderRecommended, including promoted-line exclusion", () => {
  it("flags low when available stock is at or below the reorder point", async () => {
    const compute = await loadEngine()
    const row = compute({
      item: { ...ITEM, reorder_point: 3 },
      itemMovements: [movement({ movement_type: "inbound", quantity: 3, to_location: "창고" })],
      cutoff30dMs: CUTOFF_30D,
    })
    expect(row.low).toBe(true)
  })

  it("does not flag low above the reorder point", async () => {
    const compute = await loadEngine()
    const row = compute({
      item: { ...ITEM, reorder_point: 3 },
      itemMovements: [movement({ movement_type: "inbound", quantity: 4, to_location: "창고" })],
      cutoff30dMs: CUTOFF_30D,
    })
    expect(row.low).toBe(false)
  })

  it("never flags a promoted-line product as low or order-recommended, even when negative", async () => {
    const compute = await loadEngine()
    const row = compute({
      item: { ...ITEM, name: "STD1 (promoted)", reorder_point: 3 },
      itemMovements: [movement({ movement_type: "outbound", quantity: 16, from_location: "창고", to_location: "고객", status: "출고", occurred_at: "2026-09-05" })],
      cutoff30dMs: CUTOFF_30D,
    })
    expect(row.warehouseStock).toBe(-16)
    expect(row.low).toBe(false)
    expect(row.orderRecommended).toBe(false)
  })
})

describe("computeHardwareStockRow — pass-through item fields", () => {
  it("carries the item's identity, category, reorder point and lead time onto the row", async () => {
    const compute = await loadEngine()
    const row = compute({
      item: { id: "item-9", name: "T1", category: "카메라", reorder_point: 5, lead_time_days: 21 },
      itemMovements: [],
      cutoff30dMs: CUTOFF_30D,
    })
    expect(row).toMatchObject({
      itemId: "item-9",
      product: "T1",
      category: "카메라",
      reorderPoint: 5,
      leadTimeDays: 21,
      warehouseStock: 0,
      plannedOut: 0,
      availableStock: 0,
      outbound30d: 0,
      locationBalances: [],
      lotBalances: [],
    })
  })
})
