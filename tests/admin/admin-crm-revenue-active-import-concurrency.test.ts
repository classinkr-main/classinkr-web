import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  readActiveImport: vi.fn(),
  gate: { open: () => {}, promise: Promise.resolve() },
  queryStarted: 0,
}))

vi.mock("server-only", () => ({}))
vi.mock("next/cache", () => ({
  unstable_cache: (fn: unknown) => fn,
}))
vi.mock("@/lib/repositories/sales-ledger-imports", () => ({
  readRevDealsFromActiveImport: mocks.readActiveImport,
}))
vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: () => {
    const makeBuilder = (): unknown =>
      new Proxy(() => {}, {
        get(_target, prop) {
          if (prop === "then") {
            mocks.queryStarted += 1
            return (resolve: (v: unknown) => void) =>
              mocks.gate.promise.then(() => resolve({ data: [], error: null }))
          }
          return () => makeBuilder()
        },
      })
    return { from: () => makeBuilder() }
  },
}))

describe("assembleAdminCrmRevenueDashboard 액티브 임포트 읽기", () => {
  beforeEach(() => {
    mocks.readActiveImport.mockReset()
    mocks.queryStarted = 0
    mocks.gate.promise = new Promise<void>((resolve) => {
      mocks.gate.open = resolve
    })
  })

  it("그룹 쿼리가 끝나기 전에 시작되고, 결과 형태는 그대로다", async () => {
    mocks.readActiveImport.mockResolvedValue(null)
    vi.resetModules()
    const { getAdminCrmRevenueDashboard } = await import("@/lib/admin-crm-revenue")

    const pending = getAdminCrmRevenueDashboard(3)
    await new Promise((r) => setTimeout(r, 0))

    // 쿼리 묶음은 아직 게이트에 막혀 있는데 액티브 임포트 읽기는 이미 시작됐다.
    expect(mocks.queryStarted).toBeGreaterThan(0)
    expect(mocks.readActiveImport).toHaveBeenCalledTimes(1)
    mocks.gate.open()
    const dashboard = await pending
    expect(dashboard.range.months).toBe(3)
  })

  it("액티브 임포트 읽기가 reject 되어도 null 로 폴백한다", async () => {
    mocks.readActiveImport.mockRejectedValue(new Error("boom"))
    vi.resetModules()
    const { getAdminCrmRevenueDashboard } = await import("@/lib/admin-crm-revenue")

    const pending = getAdminCrmRevenueDashboard(3)
    await new Promise((r) => setTimeout(r, 0))
    mocks.gate.open()
    await expect(pending).resolves.toBeDefined()
  })
})
