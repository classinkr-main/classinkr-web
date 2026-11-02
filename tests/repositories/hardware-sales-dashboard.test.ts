import { afterEach, describe, expect, it, vi } from "vitest"

// 판매대시보드 서버 집계(lib/repositories/hardware-sales-dashboard.ts) — 갭 문서 §3-4·§6 D10.
// 순수 집계(aggregateHardwareSalesDashboard)와 DB 읽기(키셋·칸 누락 재시도)를 나눠 본다.

type Query = { table: string; columns: string; filters: Array<[string, unknown]> }
const queries: Query[] = []
let movementPages: Array<{ data: unknown[] | null; error: unknown }> = []
let itemResults: Array<{ data: unknown[] | null; error: unknown }> = []

function tableClient(table: string) {
  const query: Query = { table, columns: "", filters: [] }
  const builder: Record<string, unknown> = {}
  builder.select = (columns: string) => {
    query.columns = columns
    queries.push(query)
    return builder
  }
  for (const method of ["order", "limit", "gt", "eq", "is", "in"]) {
    builder[method] = (...args: unknown[]) => {
      query.filters.push([method, args])
      return builder
    }
  }
  builder.then = (onFulfilled: (value: unknown) => unknown, onRejected?: (reason: unknown) => unknown) => {
    const result = table === "hardware_movements"
      ? movementPages.shift() ?? { data: [], error: null }
      : itemResults.shift() ?? { data: [], error: null }
    return Promise.resolve(result).then(onFulfilled, onRejected)
  }
  return builder
}

async function loadRepository() {
  vi.resetModules()
  vi.doMock("next/cache", () => ({
    revalidateTag: vi.fn(),
    unstable_cache: (fn: unknown) => fn,
  }))
  vi.doMock("@/lib/supabase/admin", () => ({
    createSupabaseAdminClient: vi.fn(() => ({ from: vi.fn((table: string) => tableClient(table)) })),
  }))
  return import("@/lib/repositories/hardware-sales-dashboard")
}

afterEach(() => {
  queries.length = 0
  movementPages = []
  itemResults = []
  vi.restoreAllMocks()
  vi.resetModules()
})

const NOW = new Date("2026-10-28T03:00:00Z") // FY2026

const ITEMS = [
  { id: "i-86", name: '86" IFP', active: true, report_group: "board", sort_order: 20 },
  { id: "i-110", name: '110" IFP', active: true, report_group: "board", sort_order: 10 },
  { id: "i-75", name: '75" IFP', active: true, report_group: "board", sort_order: 30 },
  { id: "i-t1", name: "T1", active: true, report_group: "camera", sort_order: 10 },
  { id: "i-std1", name: "STD1", active: true, report_group: "stand", sort_order: 10 },
  { id: "i-std-old", name: "STD0", active: false, report_group: "stand", sort_order: 99 },
  { id: "i-ops", name: "OPS", active: true, report_group: "accessory", sort_order: 10 },
  { id: "i-pen", name: "A1", active: true, report_group: "pen", sort_order: 10 },
  { id: "i-misc", name: "케이블 묶음", active: true, report_group: null, sort_order: null },
]

let seq = 0
function movement(overrides: Record<string, unknown> = {}) {
  seq += 1
  return {
    id: `mv-${String(seq).padStart(4, "0")}`,
    item_id: "i-86",
    product_name: '86" IFP',
    movement_type: "outbound",
    quantity: 1,
    occurred_at: "2026-05-10",
    from_location: "창고",
    to_location: "서울고",
    status: "설치 완료",
    memo: null,
    outbound_type: "sales",
    customer_id: null,
    sheet_type: null,
    ...overrides,
  }
}

async function aggregate(movements: Array<Record<string, unknown>>, fy = 2026) {
  const repo = await loadRepository()
  return repo.aggregateHardwareSalesDashboard({ movements: movements as never, items: ITEMS, fy, now: NOW })
}

function row(dashboard: Awaited<ReturnType<typeof aggregate>>, name: string) {
  for (const group of dashboard.groups) {
    const found = group.rows.find((entry) => entry.name === name)
    if (found) return found
  }
  return undefined
}

describe("aggregateHardwareSalesDashboard", () => {
  it("세일즈·프로모션·유형 모름은 세고 A/S·샘플은 뺀다", async () => {
    const dashboard = await aggregate([
      movement({ quantity: 2, outbound_type: "sales" }),
      movement({ quantity: 3, outbound_type: "promotion" }),
      movement({ quantity: 4, outbound_type: "as" }),
      movement({ quantity: 5, outbound_type: "sample", to_location: "서울고" }),
      // 시트 행: 칸이 비어 있고 유형 열·메모로도 모르면 세일즈로 센다.
      movement({ quantity: 7, outbound_type: null, memo: null }),
      // 시트 유형 열(raw.values[11])이 A/S 면 뺀다.
      movement({ quantity: 11, outbound_type: null, sheet_type: "A/S" }),
      movement({ quantity: 13, outbound_type: null, sheet_type: "Promotion" }),
    ])
    const board86 = row(dashboard, '86" IFP')!
    expect(board86.months[1].installed).toBe(2 + 3 + 7 + 13) // 5월 = FY 2번째 칸
    expect(board86.total.installed).toBe(25)
  })

  it("창고·샘플·사무실·수리로 가는 내부 이동은 세지 않는다(CRM 고객이 붙으면 센다)", async () => {
    const dashboard = await aggregate([
      movement({ quantity: 1, to_location: "오산 창고" }),
      movement({ quantity: 2, to_location: "사무실" }),
      movement({ quantity: 4, to_location: "수리" }),
      movement({ quantity: 8, to_location: "샘플" }),
      movement({ quantity: 16, to_location: "대치수리학원" }),
      movement({ quantity: 32, to_location: "창고", customer_id: "cust-1" }),
    ])
    expect(row(dashboard, '86" IFP')!.total.installed).toBe(16 + 32)
  })

  it("배송 예정은 +칸, 날짜 없는 행은 현재 FY 의 날짜 미정 칸에만 들어간다", async () => {
    const rows = [
      movement({ quantity: 3, status: "배송 예정", occurred_at: "2026-11-02" }),
      movement({ quantity: 2, status: "배송 예정", occurred_at: null }),
      movement({ quantity: 5, status: "출고", occurred_at: null }),
      movement({ quantity: 9, status: "설치 완료", occurred_at: "2026-11-20" }),
    ]
    const current = await aggregate(rows, 2026)
    const board = row(current, '86" IFP')!
    expect(board.months[7]).toEqual({ installed: 9, planned: 3, returned: 0 }) // 11월
    expect(board.undated).toEqual({ installed: 5, planned: 2, returned: 0 })
    expect(board.total).toEqual({ installed: 14, planned: 5, returned: 0 })

    const previous = await aggregate(rows, 2025)
    expect(row(previous, '86" IFP')!.total).toEqual({ installed: 0, planned: 0, returned: 0 })
  })

  it("회수는 판매에서 빼지 않고 따로 센다(샘플 반납·A/S 회수는 제외)", async () => {
    const dashboard = await aggregate([
      movement({ quantity: 4 }),
      movement({ movement_type: "return", quantity: 1, from_location: "서울고", to_location: "창고", status: "회수", outbound_type: "sales" }),
      movement({ movement_type: "return", quantity: 1, from_location: "서울고", to_location: "창고", status: "회수", outbound_type: "as" }),
      movement({ movement_type: "return", quantity: 1, from_location: "샘플", to_location: "창고", status: "반납", outbound_type: null }),
    ])
    const board = row(dashboard, '86" IFP')!
    expect(board.total).toEqual({ installed: 4, planned: 0, returned: 1 })
    expect(board.months[1].returned).toBe(1)
  })

  it("FY 경계 — 4월 1일은 새 FY 첫 칸, 3월 31일은 직전 FY 마지막 칸", async () => {
    const rows = [
      movement({ quantity: 1, occurred_at: "2026-03-31" }),
      movement({ quantity: 2, occurred_at: "2026-04-01" }),
      movement({ quantity: 4, occurred_at: "2027-03-31" }),
      movement({ quantity: 8, occurred_at: "2027-04-01" }),
    ]
    const fy2026 = await aggregate(rows, 2026)
    const board = row(fy2026, '86" IFP')!
    expect(board.months[0].installed).toBe(2)
    expect(board.months[11].installed).toBe(4)
    expect(board.total.installed).toBe(6)
    expect(fy2026.months[0]).toBe("2026-04")
    expect(fy2026.months[11]).toBe("2027-03")

    const fy2025 = await aggregate(rows, 2025)
    expect(row(fy2025, '86" IFP')!.months[11].installed).toBe(1)
    expect(fy2025.availableFys).toEqual([2027, 2026, 2025])
  })

  it("고정 묶음(전자칠판·카메라·스탠드)은 0대여도 보이고, 액세서리·터치펜·기타는 기록이 있을 때만", async () => {
    const empty = await aggregate([])
    expect(empty.groups.map((group) => group.key)).toEqual(["board", "camera", "stand"])
    expect(empty.groups[0].rows.map((entry) => entry.name)).toEqual(['110" IFP', '86" IFP', '75" IFP'])
    // 비활성 품목은 0대면 숨긴다.
    expect(empty.groups[2].rows.map((entry) => entry.name)).toEqual(["STD1"])

    const withExtras = await aggregate([
      movement({ item_id: "i-ops", product_name: "OPS", quantity: 2 }),
      movement({ item_id: "i-misc", product_name: "케이블 묶음", quantity: 1 }),
      movement({ item_id: null, product_name: "DT1", quantity: 3 }),
      movement({ item_id: "i-t1", product_name: "T1", quantity: 5 }),
    ])
    expect(withExtras.groups.map((group) => group.key)).toEqual(["board", "camera", "stand", "accessory", "other"])
    const other = withExtras.groups.find((group) => group.key === "other")!
    expect(other.label).toBe("기타")
    expect(other.rows.map((entry) => entry.name).sort()).toEqual(["DT1", "케이블 묶음"])
    expect(other.subtotal.total.installed).toBe(4)
    expect(withExtras.groups.find((group) => group.key === "camera")!.subtotal.total.installed).toBe(5)
    expect(withExtras.grandTotal.total.installed).toBe(2 + 1 + 3 + 5)
  })

  it("현재 FY 는 KST 날짜로 정한다", async () => {
    const repo = await loadRepository()
    expect(repo.currentSalesFy(new Date("2026-03-31T14:59:00Z"))).toBe(2025)
    expect(repo.currentSalesFy(new Date("2026-03-31T15:00:00Z"))).toBe(2026)
  })

  it("?fy= 검사 — 비면 현재 FY, 형식·범위 밖은 null", async () => {
    const repo = await loadRepository()
    expect(repo.parseSalesDashboardFy(null, NOW)).toBe(2026)
    expect(repo.parseSalesDashboardFy("", NOW)).toBe(2026)
    expect(repo.parseSalesDashboardFy("2024", NOW)).toBe(2024)
    expect(repo.parseSalesDashboardFy("2027", NOW)).toBe(2027)
    expect(repo.parseSalesDashboardFy("2028", NOW)).toBeNull()
    expect(repo.parseSalesDashboardFy("2014", NOW)).toBeNull()
    expect(repo.parseSalesDashboardFy("26", NOW)).toBeNull()
    expect(repo.parseSalesDashboardFy("2026.5", NOW)).toBeNull()
    expect(repo.parseSalesDashboardFy("abcd", NOW)).toBeNull()
  })
})

describe("listSalesDashboardMovements", () => {
  it("취소 안 된 출고·회수를 키셋으로 전부 읽고 raw 는 유형 열만 고른다", async () => {
    const page = Array.from({ length: 1000 }, () => movement())
    movementPages = [{ data: page, error: null }, { data: [movement()], error: null }]
    const repo = await loadRepository()

    const rows = await repo.listSalesDashboardMovements()

    expect(rows).toHaveLength(1001)
    const movementQueries = queries.filter((query) => query.table === "hardware_movements")
    expect(movementQueries).toHaveLength(2)
    expect(movementQueries[0].columns).toContain("sheet_type:raw->values->>11")
    expect(movementQueries[0].columns).not.toMatch(/(^|,)raw(,|$)/)
    expect(movementQueries[0].columns).toContain("outbound_type,customer_id")
    expect(movementQueries[0].filters).toContainEqual(["in", ["movement_type", ["outbound", "return"]]])
    expect(movementQueries[0].filters).toContainEqual(["is", ["voided_at", null]])
    expect(movementQueries[1].filters).toContainEqual(["gt", ["id", page[999].id]])
  })

  it("유형·고객 칸이 없는 DB 에서는 그 칸 없이 다시 읽는다", async () => {
    movementPages = [
      { data: null, error: { code: "42703", message: "column hardware_movements.outbound_type does not exist" } },
      { data: [movement({ outbound_type: undefined, customer_id: undefined })], error: null },
    ]
    const repo = await loadRepository()

    const rows = await repo.listSalesDashboardMovements()

    expect(rows).toHaveLength(1)
    const movementQueries = queries.filter((query) => query.table === "hardware_movements")
    expect(movementQueries[1].columns).not.toContain("outbound_type")
  })

  it("품목 묶음 칸이 없으면 이름만 읽는다", async () => {
    itemResults = [
      { data: null, error: { code: "42703", message: "column hardware_items.report_group does not exist" } },
      { data: [{ id: "i-86", name: '86" IFP', active: true }], error: null },
    ]
    const repo = await loadRepository()

    const items = await repo.listSalesDashboardItems()

    expect(items).toEqual([{ id: "i-86", name: '86" IFP', active: true }])
    expect(queries.filter((query) => query.table === "hardware_items").map((query) => query.columns)).toEqual([
      "id,name,active,report_group,sort_order",
      "id,name,active",
    ])
  })
})
