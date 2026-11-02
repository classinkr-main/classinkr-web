import { afterEach, describe, expect, it, vi } from "vitest"

// 재고 알림(buildHardwareStockAlerts) — 갭 문서 §3-3: 가용 < 최소재고(같으면 안 뜸), 가용 음수 알림,
// 창고 음수(원장 점검)가 가장 위. hardware-inventory.ts 는 모듈 최상단에서 unstable_cache 를 부르므로
// 다른 저장소 테스트와 같은 목을 깐다.

type StockRow = {
  itemId: string
  product: string
  category: string | null
  reorderPoint: number
  leadTimeDays: number
  warehouseStock: number
  plannedOut: number
  availableStock: number
  outbound30d: number
  weeklyOutboundAvg: number
  trendOrderPoint: number
  daysUntilStockout: number | null
  low: boolean
  orderRecommended: boolean
  locationBalances: Array<{ location: string; quantity: number }>
  lotBalances: Array<{ lot: string; quantity: number }>
}

async function loadAlerts() {
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
  return import("@/lib/repositories/hardware-inventory")
}

afterEach(() => {
  vi.restoreAllMocks()
  vi.resetModules()
})

function stockRow(overrides: Partial<StockRow> & Pick<StockRow, "itemId">): StockRow {
  const warehouseStock = overrides.warehouseStock ?? 10
  const plannedOut = overrides.plannedOut ?? 0
  return {
    product: overrides.itemId,
    category: null,
    reorderPoint: 2,
    leadTimeDays: 14,
    warehouseStock,
    plannedOut,
    availableStock: warehouseStock - plannedOut,
    outbound30d: 0,
    weeklyOutboundAvg: 0,
    trendOrderPoint: 2,
    daysUntilStockout: null,
    low: false,
    orderRecommended: false,
    locationBalances: [],
    lotBalances: [],
    ...overrides,
  }
}

const ITEM = { id: "item-1", category: "전자칠판", reorder_point: 3, lead_time_days: 14 }

describe("buildHardwareStockAlerts", () => {
  it("가용 = 최소재고면 부족 알림이 없고, 가용 < 최소재고면 있다(computeHardwareStockRow 와 같은 판정)", async () => {
    const { buildHardwareStockAlerts, computeHardwareStockRow } = await loadAlerts()
    const inbound = (quantity: number) => ({
      id: `in-${quantity}`,
      item_id: "item-1",
      product_name: "86 IFP",
      movement_type: "inbound" as const,
      quantity,
      occurred_at: "2026-09-01",
      from_location: null,
      to_location: "창고",
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
      source: "admin_manual" as const,
      raw: {},
      created_at: "2026-09-01T00:00:00.000Z",
      voided_at: null,
      converted_from_movement_id: null,
      converted_to_movement_id: null,
    })
    const atPoint = computeHardwareStockRow({ item: { ...ITEM, name: "86 IFP" }, itemMovements: [inbound(3)], cutoff30dMs: 0 })
    const below = computeHardwareStockRow({ item: { ...ITEM, name: "86 IFP" }, itemMovements: [inbound(2)], cutoff30dMs: 0 })
    expect(buildHardwareStockAlerts([atPoint]).filter((alert) => alert.kind === "low")).toEqual([])
    expect(buildHardwareStockAlerts([below])).toContainEqual(
      expect.objectContaining({ id: "low-item-1", kind: "low", severity: "critical", title: "최소재고 미만", detail: "가용 2대 < 최소 3대" })
    )
  })

  it("가용 음수(창고 0 이상 + 예정 초과)는 부족 대신 가용 음수 알림 하나만 올린다 — 판촉 라인도", async () => {
    const { buildHardwareStockAlerts } = await loadAlerts()
    const alerts = buildHardwareStockAlerts([
      stockRow({ itemId: "board", warehouseStock: 2, plannedOut: 5, low: true, orderRecommended: true }),
      stockRow({ itemId: "promo", product: "STD1(promoted)", warehouseStock: 0, plannedOut: 3 }),
    ])
    const stockSignals = alerts.filter((alert) => alert.kind !== "planned")
    expect(stockSignals.map((alert) => [alert.id, alert.kind, alert.severity])).toEqual([
      ["negative-board", "negative_available", "critical"],
      ["negative-promo", "negative_available", "critical"],
    ])
    expect(stockSignals[0].detail).toBe("창고 2대 − 배송 예정 5대 = 가용 -3대 — 입고하거나 예정을 정리하세요.")
    // 배송 예정 안내는 그대로 붙는다.
    expect(alerts.filter((alert) => alert.kind === "planned").map((alert) => alert.id)).toEqual(["planned-board", "planned-promo"])
  })

  it("창고 음수는 원장 점검 하나만, 가용 음수보다 앞에 — 행 정렬과 무관하게 급한 순서로 싣는다", async () => {
    const { buildHardwareStockAlerts } = await loadAlerts()
    const alerts = buildHardwareStockAlerts([
      stockRow({ itemId: "order", orderRecommended: true, outbound30d: 9, trendOrderPoint: 12 }),
      stockRow({ itemId: "neg-available", warehouseStock: 1, plannedOut: 4 }),
      stockRow({ itemId: "low", warehouseStock: 1, low: true }),
      stockRow({ itemId: "ledger", product: "STD1(promoted)", warehouseStock: -16 }),
    ])
    expect(alerts.map((alert) => alert.id)).toEqual([
      "check-ledger",
      "negative-neg-available",
      "order-order",
      "planned-neg-available",
      "low-low",
    ])
    expect(alerts[0]).toMatchObject({ kind: "ledger_check", title: "원본 점검 필요" })
  })

  it("미가동 품목(창고 0·예정 0·30일 출고 0)의 부족 알림은 muted 로 뒤에 둔다", async () => {
    const { buildHardwareStockAlerts } = await loadAlerts()
    const alerts = buildHardwareStockAlerts([
      stockRow({ itemId: "dormant", warehouseStock: 0, low: true }),
      stockRow({ itemId: "active-low", warehouseStock: 1, low: true, outbound30d: 3 }),
    ])
    expect(alerts.map((alert) => [alert.id, Boolean(alert.muted)])).toEqual([
      ["low-active-low", false],
      ["low-dormant", true],
    ])
  })

  it("실신호와 muted 를 각각 12건까지 싣는다", async () => {
    const { buildHardwareStockAlerts } = await loadAlerts()
    const rows = [
      ...Array.from({ length: 15 }, (_, index) => stockRow({ itemId: `neg-${index}`, warehouseStock: 0, plannedOut: 1 })),
      ...Array.from({ length: 14 }, (_, index) => stockRow({ itemId: `dormant-${index}`, warehouseStock: 0, low: true })),
    ]
    const alerts = buildHardwareStockAlerts(rows)
    expect(alerts.filter((alert) => !alert.muted)).toHaveLength(12)
    expect(alerts.filter((alert) => !alert.muted).every((alert) => alert.kind === "negative_available")).toBe(true)
    expect(alerts.filter((alert) => alert.muted)).toHaveLength(12)
  })
})
