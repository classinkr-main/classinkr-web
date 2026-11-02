// getRecentSyncRuns 캐시 + startSyncRun/finishSyncRun 무효화 배선 회귀 가드.
// summary 라우트는 매 요청 getRecentSyncRuns(3)을 불러 lastSync/lastError를 계산한다 —
// 이 값은 신선도에 민감하다(동기화 직후 새로고침하면 즉시 반영돼야 한다, 2026-07-16
// 스테일 임포트 사고 계열). 그래서 캐시를 얹되 startSyncRun/finishSyncRun 양쪽에서
// BRANCH_SYNC_RUNS_CACHE_TAG를 무효화하는 것으로 신선도를 담보한다. 이 테스트는
// (1) 같은 limit 재호출이 Supabase를 다시 때리지 않는지(캐시가 실제로 동작하는지),
// (2) 뮤테이션마다 태그가 무효화되는지를 고정한다.
import { afterEach, describe, expect, it, vi } from "vitest"

type InsertError = { code?: string; message: string }

function branchSyncClient(runs: unknown[], options: { insertErrors?: Array<InsertError | null> } = {}) {
  let insertCalls = 0
  let updateCalls = 0
  let selectCalls = 0
  const insertPayloads: Array<Record<string, unknown>> = []
  // n 번째 insert 가 돌려줄 오류(없으면 성공) — runtime 컬럼 부재 폴백을 재현한다.
  const insertErrors = [...(options.insertErrors ?? [])]

  const from = vi.fn(() => ({
    insert: (row: Record<string, unknown>) => {
      insertCalls += 1
      insertPayloads.push(row)
      const error = insertErrors.shift() ?? null
      return {
        select: () => ({
          single: () => Promise.resolve(error ? { data: null, error } : { data: { id: "run-id-1" }, error: null }),
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
    insertPayloads,
    get insertCalls() { return insertCalls },
    get updateCalls() { return updateCalls },
    get selectCalls() { return selectCalls },
  }
}

let capturedTags: Record<string, string[]> = {}
const revalidateTag = vi.fn()

async function loadRepository(runs: unknown[] = [], options: { insertErrors?: Array<InsertError | null> } = {}) {
  vi.resetModules()
  capturedTags = {}
  revalidateTag.mockClear()
  const client = branchSyncClient(runs, options)

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

// 2026-10-28 — 실행 기록에 출처(runtime: 환경·배포·커밋·리전)를 남긴다. 컬럼은 20261028_branch_sync_runs_runtime.sql 이
// 더하는데 마이그레이션은 수동 적용이라, 컬럼이 아직 없는 환경에서도 동기화가 죽지 않아야 한다
// (런북 "새 컬럼 기록은 코어 경로와 분리") — 42703/PGRST204 면 컬럼 없이 한 번 더 기록한다.
describe("startSyncRun runtime 기록", () => {
  const RUNTIME = { env: "production", deploymentId: "dpl_1", sha: "abc123", region: "icn1", allowedBy: "production" as const }

  afterEach(() => {
    vi.restoreAllMocks()
    vi.resetModules()
  })

  it("runtime 을 런 행에 그대로 싣는다", async () => {
    const { repository, client } = await loadRepository([])

    const id = await repository.startSyncRun("all", "cron", RUNTIME)

    expect(id).toBe("run-id-1")
    expect(client.insertCalls).toBe(1)
    expect(client.insertPayloads[0]).toEqual({ source: "all", trigger: "cron", status: "running", runtime: RUNTIME })
  })

  it("runtime 을 안 넘기면 예전과 같은 행을 쓴다(컬럼 키 자체가 없다)", async () => {
    const { repository, client } = await loadRepository([])

    await repository.startSyncRun("rev", "manual")

    expect(client.insertPayloads[0]).toEqual({ source: "rev", trigger: "manual", status: "running" })
    expect(client.insertPayloads[0]).not.toHaveProperty("runtime")
  })

  it.each([
    ["42703", 'column "runtime" of relation "branch_sync_runs" does not exist'],
    ["PGRST204", "Could not find the 'runtime' column of 'branch_sync_runs' in the schema cache"],
    [undefined, "Could not find the 'runtime' column of 'branch_sync_runs' in the schema cache"],
  ])("컬럼이 없으면(code=%s) 컬럼 없이 다시 기록하고 경고만 남긴다 — 동기화는 계속된다", async (code, message) => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
    const { repository, client } = await loadRepository([], { insertErrors: [{ code, message }] })

    const id = await repository.startSyncRun("all", "cron", RUNTIME)

    expect(id).toBe("run-id-1")
    expect(client.insertCalls).toBe(2)
    expect(client.insertPayloads[0]).toHaveProperty("runtime")
    expect(client.insertPayloads[1]).toEqual({ source: "all", trigger: "cron", status: "running" })
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("20261028_branch_sync_runs_runtime.sql"))
    // 폴백으로 기록된 런도 "지금 도는 중" 상태 변화라 캐시를 무효화한다.
    expect(revalidateTag).toHaveBeenCalledWith(repository.BRANCH_SYNC_RUNS_CACHE_TAG, "max")
  })

  it("컬럼 부재가 아닌 오류는 삼키지 않고 던진다 — 재시도도 없다", async () => {
    const { repository, client } = await loadRepository([], { insertErrors: [{ code: "42501", message: "permission denied for table branch_sync_runs" }] })

    await expect(repository.startSyncRun("all", "cron", RUNTIME)).rejects.toMatchObject({ code: "42501" })
    expect(client.insertCalls).toBe(1)
    expect(revalidateTag).not.toHaveBeenCalled()
  })

  it("테이블 부재(42P01)는 컬럼 폴백 대상이 아니다", async () => {
    const { repository, client } = await loadRepository([], { insertErrors: [{ code: "42P01", message: 'relation "branch_sync_runs" does not exist' }] })

    await expect(repository.startSyncRun("all", "cron", RUNTIME)).rejects.toMatchObject({ code: "42P01" })
    expect(client.insertCalls).toBe(1)
  })

  it("폴백한 두 번째 insert 까지 실패하면 그 오류를 던진다", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {})
    const { repository, client } = await loadRepository([], {
      insertErrors: [{ code: "42703", message: "column runtime does not exist" }, { code: "08006", message: "connection failure" }],
    })

    await expect(repository.startSyncRun("all", "cron", RUNTIME)).rejects.toMatchObject({ code: "08006" })
    expect(client.insertCalls).toBe(2)
  })
})
