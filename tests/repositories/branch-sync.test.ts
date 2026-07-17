// getRecentSyncRuns 캐시 + startSyncRun/finishSyncRun 무효화 배선 회귀 가드.
// summary 라우트는 매 요청 getRecentSyncRuns(3)을 불러 lastSync/lastError를 계산한다 —
// 이 값은 신선도에 민감하다(동기화 직후 새로고침하면 즉시 반영돼야 한다, 2026-07-16
// 스테일 임포트 사고 계열). 그래서 캐시를 얹되 startSyncRun/finishSyncRun 양쪽에서
// BRANCH_SYNC_RUNS_CACHE_TAG를 무효화하는 것으로 신선도를 담보한다. 이 테스트는
// (1) 같은 limit 재호출이 Supabase를 다시 때리지 않는지(캐시가 실제로 동작하는지),
// (2) 뮤테이션마다 태그가 무효화되는지를 고정한다.
import { afterEach, describe, expect, it, vi } from "vitest"

function branchSyncClient(runs: unknown[]) {
  let insertCalls = 0
  let updateCalls = 0
  let selectCalls = 0

  const from = vi.fn(() => ({
    insert: () => {
      insertCalls += 1
      return {
        select: () => ({
          single: () => Promise.resolve({ data: { id: "run-id-1" }, error: null }),
        }),
      }
    },
    update: () => {
      updateCalls += 1
      return {
        eq: () => Promise.resolve({ error: null }),
      }
    },
    select: () => {
      selectCalls += 1
      return {
        order: () => ({
          limit: () => Promise.resolve({ data: runs, error: null }),
        }),
      }
    },
  }))

  return {
    from,
    get insertCalls() { return insertCalls },
    get updateCalls() { return updateCalls },
    get selectCalls() { return selectCalls },
  }
}

let capturedTags: Record<string, string[]> = {}
const revalidateTag = vi.fn()

async function loadRepository(runs: unknown[] = []) {
  vi.resetModules()
  capturedTags = {}
  revalidateTag.mockClear()
  const client = branchSyncClient(runs)

  vi.doMock("@/lib/supabase/admin", () => ({
    createSupabaseAdminClient: vi.fn(() => client),
  }))

  // identity(fn => fn)로 치환하면 캐시가 사라져 "재호출 시 Supabase를 안 때린다"를 검증할
  // 수 없다 — (key, args) 조합으로 메모이즈하는 경량 스텁을 쓴다(sales-ledger-imports 테스트와 동일 패턴).
  vi.doMock("next/cache", () => {
    const stores = new Map<string, Map<string, unknown>>()
    return {
      revalidateTag,
      unstable_cache: (
        fn: (...args: unknown[]) => Promise<unknown>,
        keyParts: string[],
        options?: { tags?: string[] },
      ) => {
        const cacheKey = keyParts.join("|")
        capturedTags[cacheKey] = options?.tags ?? []
        if (!stores.has(cacheKey)) stores.set(cacheKey, new Map())
        const store = stores.get(cacheKey)!
        return async (...args: unknown[]) => {
          const argsKey = JSON.stringify(args)
          if (store.has(argsKey)) return store.get(argsKey)
          const result = await fn(...args)
          store.set(argsKey, result)
          return result
        }
      },
    }
  })

  const repository = await import("@/lib/repositories/branch-sync")
  return { repository, client }
}

describe("getRecentSyncRuns caching", () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.resetModules()
  })

  it("tags the cache with BRANCH_SYNC_RUNS_CACHE_TAG", async () => {
    const { repository } = await loadRepository([])
    await repository.getRecentSyncRuns(3)
    expect(capturedTags["branch-recent-sync-runs"]).toEqual([repository.BRANCH_SYNC_RUNS_CACHE_TAG])
  })

  it("reuses the cached result for the same limit instead of re-querying Supabase", async () => {
    const { repository, client } = await loadRepository([
      { id: "r1", started_at: "2026-07-16T08:00:00Z", finished_at: "2026-07-16T08:05:00Z", status: "success" },
    ])

    await repository.getRecentSyncRuns(3)
    await repository.getRecentSyncRuns(3)

    expect(client.selectCalls).toBe(1)
  })

  it("startSyncRun revalidates the tag so a just-started run is immediately visible", async () => {
    const { repository, client } = await loadRepository([])

    await repository.startSyncRun("all", "manual")

    expect(client.insertCalls).toBe(1)
    expect(revalidateTag).toHaveBeenCalledWith(repository.BRANCH_SYNC_RUNS_CACHE_TAG, "max")
  })

  it("finishSyncRun revalidates the tag so a just-completed run's lastSync is immediately visible", async () => {
    const { repository, client } = await loadRepository([])

    await repository.finishSyncRun("run-id-1", { status: "success", rows_affected: 10 })

    expect(client.updateCalls).toBe(1)
    expect(revalidateTag).toHaveBeenCalledWith(repository.BRANCH_SYNC_RUNS_CACHE_TAG, "max")
  })
})
