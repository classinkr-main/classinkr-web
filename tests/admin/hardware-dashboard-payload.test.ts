import { beforeEach, describe, expect, it, vi } from "vitest"

// /api/admin/hardware 대시보드 payload 슬림(T5-A) 계약:
// - movements.raw는 { crmLink }만 남고 시트 원본 행 등 나머지 raw는 버려진다
// - 각 movement에 서버가 planned: boolean을 붙인다
// - recentOutbound·plannedMovements는 응답에 없다(클라이언트 파생)
// - items에서 sku/active/created_at/updated_at이 빠진다
// - hardware_movements select는 미사용 6컬럼을 요청하지 않는다

const selectedColumns: Record<string, string[]> = {}

const ITEM_ROWS = [
  {
    id: "item-1",
    name: "86\" IFP",
    sku: "IFP-86",
    category: "전자칠판",
    reorder_point: 2,
    lead_time_days: 14,
    active: true,
    source_aliases: ["86 IFP"],
    created_at: "2026-08-01T00:00:00.000Z",
    updated_at: "2026-08-01T00:00:00.000Z",
  },
]

const BIG_RAW = {
  crmLink: { sourceLabel: "포털 딜", title: "서울고 계약", referenceNo: "deal:deal-1", href: "/admin/crm/deals/orders?deal=deal-1" },
  sheetRow: { 제품: "86 IFP", 수량: 1, 도착지: "서울고", 비고: "x".repeat(2000) },
  amount_usd: 1234.5,
  importer: "classin",
}

function movementRow(overrides: Record<string, unknown>) {
  return {
    id: "mv-1",
    item_id: "item-1",
    product_name: "86\" IFP",
    movement_type: "outbound",
    quantity: 1,
    occurred_at: "2026-08-20T00:00:00.000Z",
    from_location: "창고",
    to_location: "서울고",
    owner: null,
    status: null,
    reference_no: "deal:deal-1",
    memo: null,
    serials: [],
    lot_no: "LOT-1",
    unit_price: null,
    amount_usd: null,
    amount_cny: null,
    storage_location: null,
    importer: null,
    source: "admin_manual",
    raw: {},
    created_at: "2026-08-20T00:00:00.000Z",
    voided_at: null,
    converted_from_movement_id: null,
    converted_to_movement_id: null,
    ...overrides,
  }
}

const MOVEMENT_ROWS = [
  movementRow({ id: "mv-1", raw: BIG_RAW }),
  movementRow({ id: "mv-2", status: "배송 예정", occurred_at: "2026-08-25T00:00:00.000Z", raw: { sheetRow: { 제품: "86 IFP" } } }),
  movementRow({ id: "mv-3", movement_type: "inbound", from_location: null, to_location: "창고", occurred_at: "2026-08-10T00:00:00.000Z", raw: null }),
]

// 체이닝 가능한 최소 쿼리 빌더 — 어떤 메서드 체인이든 await 시 테이블별 고정 응답을 돌려준다.
function tableClient(table: string) {
  const builder: Record<string, unknown> = {}
  const chain = () => builder
  for (const method of ["order", "limit", "gt", "eq", "is", "in"]) builder[method] = chain
  builder.select = (columns = "*") => {
    selectedColumns[table] = String(columns).split(",").map((column) => column.trim())
    return builder
  }
  const resolve = () => {
    if (table === "hardware_items") return { data: ITEM_ROWS, error: null }
    if (table === "hardware_movements") return { data: MOVEMENT_ROWS, error: null }
    return { data: null, error: null }
  }
  builder.maybeSingle = async () => resolve()
  builder.then = (onFulfilled: (value: unknown) => unknown, onRejected?: (reason: unknown) => unknown) =>
    Promise.resolve(resolve()).then(onFulfilled, onRejected)
  return builder
}

async function loadRepository() {
  vi.resetModules()
  vi.doMock("next/cache", () => ({
    revalidateTag: vi.fn(),
    unstable_cache: (fn: unknown) => fn,
  }))
  vi.doMock("@/lib/repositories/branch-hw", () => ({
    // 실제 구현과 같은 계약(한 페이지가 limit 미만이면 종료) — 여기서는 항상 한 페이지.
    fetchAllSupabaseRows: async (buildQuery: (afterId: string | null, limit: number) => PromiseLike<{ data: unknown[] | null; error: unknown }>) => {
      const { data, error } = await buildQuery(null, 1000)
      if (error) throw error
      return data ?? []
    },
    listFreshHwInbound: vi.fn(),
    listFreshHwOutbound: vi.fn(),
    listFreshHwStock: vi.fn(),
  }))
  vi.doMock("@/lib/supabase/admin", () => ({
    createSupabaseAdminClient: vi.fn(() => ({ from: vi.fn((table: string) => tableClient(table)) })),
  }))
  return import("@/lib/repositories/hardware-inventory")
}

describe("getHardwareDashboard payload (T5-A)", () => {
  beforeEach(() => {
    for (const key of Object.keys(selectedColumns)) delete selectedColumns[key]
  })

  it("keeps only raw.crmLink on movements and attaches planned", async () => {
    const { getHardwareDashboard } = await loadRepository()
    const dashboard = await getHardwareDashboard()

    const withCrm = dashboard.movements.find((movement) => movement.id === "mv-1")
    expect(withCrm?.raw).toEqual({ crmLink: BIG_RAW.crmLink })
    expect(Object.keys(withCrm?.raw ?? {})).toEqual(["crmLink"])
    // raw에서 회수한 금액·수입자는 컬럼으로 복원된 채 남는다(recoverMoneyFromRaw).
    expect(withCrm?.amount_usd).toBe(1234.5)
    expect(withCrm?.importer).toBe("classin")

    for (const movement of dashboard.movements) {
      expect(typeof movement.planned).toBe("boolean")
    }
    expect(dashboard.movements.find((movement) => movement.id === "mv-2")).toMatchObject({ planned: true, raw: null })
    expect(dashboard.movements.find((movement) => movement.id === "mv-3")).toMatchObject({ planned: false, raw: null })
    expect(withCrm?.planned).toBe(false)
  })

  it("does not serialize movement subsets or unread item fields", async () => {
    const { getHardwareDashboard } = await loadRepository()
    const dashboard = await getHardwareDashboard()

    expect(dashboard).not.toHaveProperty("recentOutbound")
    expect(dashboard).not.toHaveProperty("plannedMovements")
    // movements 자체는 무효 제외 최신순 그대로 — 클라이언트가 여기서 부분집합을 파생한다.
    expect(dashboard.movements.map((movement) => movement.id)).toEqual(["mv-2", "mv-1", "mv-3"])

    expect(dashboard.items).toEqual([
      { id: "item-1", name: "86\" IFP", category: "전자칠판", reorder_point: 2, lead_time_days: 14, source_aliases: ["86 IFP"] },
    ])
  })

  it("selects explicit ledger columns without the six unread fields", async () => {
    const { getHardwareDashboard, HARDWARE_MOVEMENT_LEDGER_COLUMNS } = await loadRepository()
    await getHardwareDashboard()

    const columns = selectedColumns.hardware_movements
    expect(columns).toEqual(HARDWARE_MOVEMENT_LEDGER_COLUMNS.split(","))
    expect(columns).toContain("id")
    expect(columns).toContain("raw")
    for (const dropped of ["source_table", "source_key", "import_run_id", "created_by", "voided_by", "void_reason"]) {
      expect(columns).not.toContain(dropped)
    }
  })
})
