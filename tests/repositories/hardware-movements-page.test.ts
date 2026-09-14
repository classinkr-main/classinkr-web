import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

// 감사(2026-09-07 #7): /api/admin/hardware가 이동 2,000건까지 무페이징 통짜로 응답하고, 그
// 너머는 화면에서 아예 닿을 방법이 없었다. getHardwareMovementsPage(lib/repositories/
// hardware-inventory.ts)가 그 간극 — "2000건 캡 너머를 명시적으로 더 불러오기" — 를 메운다.
// 기본 대시보드(getHardwareDashboard)의 movements 배열·2000건 캡 자체는 바꾸지 않았다 — 홈 요약·
// 검색 등 기존 소비처가 그 배열 전체 집계에 의존해서다(hardware-dashboard-payload.test.ts가
// movementsTotal 계약을 검증).

function movementRow(overrides: Record<string, unknown>) {
  return {
    id: "mv-1",
    item_id: "item-1",
    product_name: "86 IFP",
    movement_type: "outbound",
    quantity: 1,
    occurred_at: "2026-08-20T00:00:00.000Z",
    from_location: "창고",
    to_location: "서울고",
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
    created_at: "2026-08-20T00:00:00.000Z",
    voided_at: null,
    converted_from_movement_id: null,
    converted_to_movement_id: null,
    ...overrides,
  }
}

// 최신순으로 mv-5(가장 최근) ~ mv-1(가장 오래됨) 5건 — offset/limit 슬라이싱을 명확히 볼 수 있게
// 날짜를 하루씩 벌린다. mv-3은 취소(voided)라 전체 카운트·페이지 어디에도 안 잡혀야 한다.
const MOVEMENT_ROWS = [
  movementRow({ id: "mv-1", occurred_at: "2026-08-01T00:00:00.000Z" }),
  movementRow({ id: "mv-2", occurred_at: "2026-08-02T00:00:00.000Z" }),
  movementRow({ id: "mv-3", occurred_at: "2026-08-03T00:00:00.000Z", voided_at: "2026-08-04T00:00:00.000Z" }),
  movementRow({ id: "mv-4", occurred_at: "2026-08-04T00:00:00.000Z" }),
  movementRow({ id: "mv-5", occurred_at: "2026-08-05T00:00:00.000Z" }),
]

function tableClient(table: string) {
  const builder: Record<string, unknown> = {}
  const chain = () => builder
  for (const method of ["order", "limit", "gt", "eq", "is", "in"]) builder[method] = chain
  builder.select = () => builder
  const resolve = () => {
    if (table === "hardware_movements") return { data: MOVEMENT_ROWS, error: null }
    return { data: null, error: null }
  }
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

beforeEach(() => {
  vi.resetModules()
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.resetModules()
})

describe("getHardwareMovementsPage", () => {
  it("returns the most recent page first and excludes voided rows from both the page and the total", async () => {
    const { getHardwareMovementsPage } = await loadRepository()

    const page = await getHardwareMovementsPage(0, 2)

    // 4건이 활성(mv-3은 취소) — 최신순으로 mv-5, mv-4가 1페이지.
    expect(page.movementsTotal).toBe(4)
    expect(page.movements.map((m) => m.id)).toEqual(["mv-5", "mv-4"])
  })

  it("advances with offset to reach older rows beyond the first page", async () => {
    const { getHardwareMovementsPage } = await loadRepository()

    const page = await getHardwareMovementsPage(2, 2)

    expect(page.movements.map((m) => m.id)).toEqual(["mv-2", "mv-1"])
    expect(page.movementsTotal).toBe(4)
  })

  it("returns an empty page (not an error) once the offset runs past the end", async () => {
    const { getHardwareMovementsPage } = await loadRepository()

    const page = await getHardwareMovementsPage(10, 2)

    expect(page.movements).toEqual([])
    expect(page.movementsTotal).toBe(4)
  })

  it("clamps a negative or non-finite offset to 0 instead of throwing", async () => {
    const { getHardwareMovementsPage } = await loadRepository()

    const page = await getHardwareMovementsPage(-5, 2)

    expect(page.movements.map((m) => m.id)).toEqual(["mv-5", "mv-4"])
  })

  it("caps an oversized limit request instead of returning unbounded rows", async () => {
    const { getHardwareMovementsPage } = await loadRepository()

    const page = await getHardwareMovementsPage(0, 999999)

    // 캡을 걸어도 실제 활성 행이 4건뿐이라 그대로 4건 — 캡 자체는 별도 대량 픽스처가 있어야
    // 직접 관측되지만, 최소한 "터지지 않고 안전하게 처리"는 여기서 확인한다.
    expect(page.movements).toHaveLength(4)
  })

  it("keeps the response raw redacted to { crmLink } like the main dashboard (T5-A contract)", async () => {
    const { getHardwareMovementsPage } = await loadRepository()
    const page = await getHardwareMovementsPage(0, 10)
    for (const movement of page.movements) {
      expect(movement.raw).toBeNull()
      expect(typeof movement.planned).toBe("boolean")
    }
  })
})
