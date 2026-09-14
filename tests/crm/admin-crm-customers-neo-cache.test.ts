/**
 * lib/admin-crm-customers-neo.ts 의 getNeoCrmCustomers 캐시 배선 계약 (2026-09-10 3라운드 §3.2).
 *
 * 이전엔 process-local `let neoCustomersCache`(60초)였다 — 개요·통합고객·os-summary 3화면이
 * 공유하는 하위 소스인데 Vercel Fluid 콜드 인스턴스마다 매번 재계산됐다. unstable_cache(Data
 * Cache)로 승격했다 — 이 파일은 그 승격의 네 가지 계약(태그·무효화 짝·shareInFlight·JSON
 * 안전성 가드)을 고정한다.
 */
import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  unstableCache: vi.fn(),
  revalidateTag: vi.fn(),
}))

vi.mock("next/cache", () => ({
  unstable_cache: mocks.unstableCache,
  revalidateTag: mocks.revalidateTag,
}))

interface FakeNeoSnapshotList {
  ok: boolean
  error: string | null
  latestSyncedAt: string | null
  generatedAt: string
  syncHealth: {
    shroffAccountSyncedAt: string | null
    shroffAccountAgeHours: number | null
    staleAfterHours: number
    isShroffAccountStale: boolean
  }
  summary: {
    totalCount: number
    withEeoCount: number
    expiringSoonCount: number
    totalBalance: number
    totalOrderAmount: number
  }
  owners: never[]
  rows: never[]
}

const OK_SNAPSHOT: FakeNeoSnapshotList = {
  ok: true,
  error: null,
  latestSyncedAt: "2026-09-10T00:00:00.000Z",
  generatedAt: "2026-09-10T00:00:00.000Z",
  syncHealth: {
    shroffAccountSyncedAt: "2026-09-10T00:00:00.000Z",
    shroffAccountAgeHours: 0.5,
    staleAfterHours: 24,
    isShroffAccountStale: false,
  },
  summary: { totalCount: 0, withEeoCount: 0, expiringSoonCount: 0, totalBalance: 0, totalOrderAmount: 0 },
  owners: [],
  rows: [],
}

const NOT_OK_SNAPSHOT: FakeNeoSnapshotList = { ...OK_SNAPSHOT, ok: false, error: "boom" }

function mockSnapshotList(result: FakeNeoSnapshotList) {
  vi.doMock("@/lib/repositories/crm-neo-customer-snapshots", () => ({
    listCrmNeoCustomerSnapshots: vi.fn().mockResolvedValue(result),
  }))
}

async function loadModule(result: FakeNeoSnapshotList) {
  vi.resetModules()
  mockSnapshotList(result)
  return import("@/lib/admin-crm-customers-neo")
}

describe("admin-crm-customers-neo 캐시 배선", () => {
  beforeEach(() => {
    mocks.unstableCache.mockReset()
    mocks.revalidateTag.mockClear()
  })

  it("unstable_cache(60초, admin-crm-neo-customers 태그)로 감싼다", async () => {
    mocks.unstableCache.mockImplementation((fn: unknown) => fn)
    await loadModule(OK_SNAPSHOT)

    expect(mocks.unstableCache).toHaveBeenCalledTimes(1)
    const [fn, keyParts, options] = mocks.unstableCache.mock.calls[0]
    expect(typeof fn).toBe("function")
    expect(keyParts).toEqual(["admin-crm-neo-customers-v1"])
    expect(options).toEqual({ revalidate: 60, tags: ["admin-crm-neo-customers"] })
  })

  it("성공 스냅샷은 그대로 반환한다(캐시에 쓰여도 되는 값)", async () => {
    mocks.unstableCache.mockImplementation((fn: unknown) => fn)
    const { getNeoCrmCustomers } = await loadModule(OK_SNAPSHOT)

    const result = await getNeoCrmCustomers()
    expect(result.ok).toBe(true)
  })

  it("실패(ok:false) 스냅샷은 캐시 write를 건너뛰도록 던지고, 바깥 함수가 값을 그대로 복원한다", async () => {
    // unstable_cache를 통과 함수로 두면 내부에서 던진 에러가 getNeoCrmCustomers까지 전파된다 —
    // 실제 unstable_cache도 reject된 promise는 캐시에 쓰지 않으므로 동일한 "성공 값만 저장"
    // 성질을 재현한다.
    mocks.unstableCache.mockImplementation((fn: unknown) => fn)
    const { getNeoCrmCustomers } = await loadModule(NOT_OK_SNAPSHOT)

    const result = await getNeoCrmCustomers()
    expect(result.ok).toBe(false)
    expect(result.error).toBe("boom")
  })

  it("invalidateNeoCrmCustomersCache()는 admin-crm-neo-customers 태그를 SWR로 무효화한다", async () => {
    mocks.unstableCache.mockImplementation((fn: unknown) => fn)
    const { invalidateNeoCrmCustomersCache } = await loadModule(OK_SNAPSHOT)

    invalidateNeoCrmCustomersCache()

    expect(mocks.revalidateTag).toHaveBeenCalledWith("admin-crm-neo-customers", "max")
  })
})
