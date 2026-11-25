// DSH/KPI 액티브 임포트 콘텐츠 캐시 회귀 가드.
// readDshFromActiveImport/readKpiBlocksFromActiveImport는 REV의 readCachedRevDealsForImportRun과
// 같은 패턴으로 (importRunId 키, SALES_LEDGER_IMPORTS_CACHE_TAG 태그) unstable_cache에 감싸져
// KR Team/summary가 요청마다 전량 페이징 재조회하던 비용을 없앤다. 이 테스트는 실제 Next.js
// 캐시 런타임 없이도 (1) 같은 importRunId 재호출이 Supabase를 다시 때리지 않는지,
// (2) 서로 다른 활성 런(연도별 active_sources 전환)이 서로의 캐시를 오염시키지 않는지,
// (3) REV와 같은 태그(SALES_LEDGER_IMPORTS_CACHE_TAG)로 걸려 있는지를 검증한다 — ③이 깨지면
// 이 캐시만 무효화 경로 없이 남아 "방금 재캡처한 장부가 300초간 안 보이는" 회귀가 생긴다.
//
// 품질 웨이브3: 액티브 포인터 조회가 tabKey별 개별 쿼리에서 fiscal_year 단위 배치 쿼리로
// 바뀌어(lookupActiveImportRunInfoForYear) sales_ledger_active_sources 픽스처도 tab_key별
// 다건 응답(더는 .eq("tab_key", ...) 필터도, .maybeSingle() 단건 종결도 없음)을 흉내내야 한다.
import { afterEach, describe, expect, it, vi } from "vitest"

interface ActiveSourceEntry {
  tabKey: "dsh" | "rev" | "kpi"
  runId: string
  startedAt: string
}

interface SupabaseFixture {
  activeSourcesByFiscalYear: Record<number, ActiveSourceEntry[] | undefined>
  dshRowsByRunId?: Record<string, unknown[]>
  kpiRowsByRunId?: Record<string, unknown[]>
}

function supabaseClient(fixture: SupabaseFixture) {
  const dshQueryCount: Record<string, number> = {}
  const kpiQueryCount: Record<string, number> = {}
  let activeSourceQueryCount = 0

  // Supabase-js PostgrestFilterBuilder처럼 select/eq가 체이너블 빌더를 반환하고, 그 빌더
  // 자체가 thenable(진짜 supabase-js 빌더처럼 명시적 종결 메서드 없이 await 가능)이다.
  const from = vi.fn((table: string) => {
    if (table === "sales_ledger_active_sources") {
      let fiscalYear: number | undefined
      const builder: {
        select: () => typeof builder
        eq: (column: string, value: unknown) => typeof builder
        then: (resolve: (v: { data: unknown; error: null }) => void) => void
      } = {
        select: () => builder,
        eq: (column, value) => {
          if (column === "fiscal_year") fiscalYear = value as number
          return builder
        },
        then: (resolve) => {
          activeSourceQueryCount += 1
          const entries = (fiscalYear != null ? fixture.activeSourcesByFiscalYear[fiscalYear] : undefined) ?? []
          const data = entries.map((entry) => ({
            tab_key: entry.tabKey,
            import_run_id: entry.runId,
            sales_ledger_import_runs: { started_at: entry.startedAt },
          }))
          resolve({ data, error: null })
        },
      }
      return builder
    }

    if (table === "branch_dsh_rows" || table === "branch_kpi_rows") {
      let importRunId: string | undefined
      const builder: {
        select: () => typeof builder
        eq: (column: string, value: unknown) => typeof builder
        order: () => typeof builder
        range: () => Promise<{ data: unknown[]; error: null }>
      } = {
        select: () => builder,
        eq: (column, value) => {
          if (column === "import_run_id") importRunId = value as string
          return builder
        },
        order: () => builder,
        range: () => {
          const counts = table === "branch_dsh_rows" ? dshQueryCount : kpiQueryCount
          const key = importRunId ?? "unknown"
          counts[key] = (counts[key] ?? 0) + 1
          const bucket = table === "branch_dsh_rows" ? fixture.dshRowsByRunId : fixture.kpiRowsByRunId
          const rows = (importRunId ? bucket?.[importRunId] : undefined) ?? []
          return Promise.resolve({ data: rows, error: null })
        },
      }
      return builder
    }

    throw new Error(`[test] unexpected table: ${table}`)
  })

  return {
    from,
    dshQueryCount,
    kpiQueryCount,
    get activeSourceQueryCount() {
      return activeSourceQueryCount
    },
  }
}

const DSH_TEAM_ROW = {
  row_level: "team",
  row_kind: "goal",
  team: "BD",
  member: null,
  category: null,
  status_type: null,
  channel: null,
  annual: 100,
  q1: 25,
  q2: 25,
  q3: 25,
  q4: 25,
  months: {},
}

const KPI_ROW = {
  period_key: "2026-04",
  period_month: null,
  row_kind: "goal",
  team: "BD",
  member: "Han",
  metrics: { lead: 10 },
}

let capturedTags: Record<string, string[]> = {}

async function loadRepository(fixture: SupabaseFixture) {
  vi.resetModules()
  capturedTags = {}
  const client = supabaseClient(fixture)

  vi.doMock("@/lib/supabase/admin", () => ({
    createSupabaseAdminClient: vi.fn(() => client),
  }))

  // identity(fn => fn)로 치환하면 캐시 자체가 사라져 "재호출 시 Supabase를 안 때린다"를
  // 검증할 수 없다 — 실제처럼 (key, args) 조합으로 메모이즈하는 경량 스텁을 쓴다.
  vi.doMock("next/cache", () => {
    const stores = new Map<string, Map<string, unknown>>()
    return {
      revalidateTag: vi.fn(),
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

  const repository = await import("@/lib/repositories/sales-ledger-imports")
  return { repository, client }
}

describe("DSH/KPI active-import content caching", () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.resetModules()
  })

  it("tags the DSH and KPI content caches with SALES_LEDGER_IMPORTS_CACHE_TAG (same tag REV's activation path already revalidates)", async () => {
    const { repository } = await loadRepository({
      activeSourcesByFiscalYear: { 2026: [{ tabKey: "dsh", runId: "run-1", startedAt: "2026-07-01T00:00:00Z" }, { tabKey: "kpi", runId: "run-1", startedAt: "2026-07-01T00:00:00Z" }] },
      dshRowsByRunId: { "run-1": [DSH_TEAM_ROW] },
      kpiRowsByRunId: { "run-1": [KPI_ROW] },
    })

    await repository.readDshFromActiveImport(2026)
    await repository.readKpiBlocksFromActiveImport(2026)

    expect(capturedTags["sales-ledger-dsh-import-run"]).toEqual([repository.SALES_LEDGER_IMPORTS_CACHE_TAG])
    expect(capturedTags["sales-ledger-kpi-import-run"]).toEqual([repository.SALES_LEDGER_IMPORTS_CACHE_TAG])
  })

  it("reuses cached DSH content for the same active import run instead of re-querying Supabase", async () => {
    const { repository, client } = await loadRepository({
      activeSourcesByFiscalYear: { 2026: [{ tabKey: "dsh", runId: "run-1", startedAt: "2026-07-01T00:00:00Z" }] },
      dshRowsByRunId: { "run-1": [DSH_TEAM_ROW] },
    })

    await repository.readDshFromActiveImport(2026)
    await repository.readDshFromActiveImport(2026)

    expect(client.dshQueryCount["run-1"]).toBe(1)
  })

  it("reuses cached KPI content for the same active import run instead of re-querying Supabase", async () => {
    const { repository, client } = await loadRepository({
      activeSourcesByFiscalYear: { 2026: [{ tabKey: "kpi", runId: "run-1", startedAt: "2026-07-01T00:00:00Z" }] },
      kpiRowsByRunId: { "run-1": [KPI_ROW] },
    })

    await repository.readKpiBlocksFromActiveImport(2026)
    await repository.readKpiBlocksFromActiveImport(2026)

    expect(client.kpiQueryCount["run-1"]).toBe(1)
  })

  it("does not leak DSH content across two different active import runs (active-source switch still refreshes)", async () => {
    const { repository, client } = await loadRepository({
      activeSourcesByFiscalYear: {
        2025: [{ tabKey: "dsh", runId: "run-old", startedAt: "2025-07-01T00:00:00Z" }],
        2026: [{ tabKey: "dsh", runId: "run-new", startedAt: "2026-07-01T00:00:00Z" }],
      },
      dshRowsByRunId: {
        "run-old": [{ ...DSH_TEAM_ROW, annual: 999 }],
        "run-new": [DSH_TEAM_ROW],
      },
    })

    const old = await repository.readDshFromActiveImport(2025)
    const fresh = await repository.readDshFromActiveImport(2026)

    expect(client.dshQueryCount["run-old"]).toBe(1)
    expect(client.dshQueryCount["run-new"]).toBe(1)
    expect(old?.rows[0]?.annual).toBe(999)
    expect(fresh?.rows[0]?.annual).toBe(100)
  })

  it("returns null without querying content tables when there is no active import run", async () => {
    const { repository, client } = await loadRepository({
      activeSourcesByFiscalYear: { 2026: [] },
    })

    const dsh = await repository.readDshFromActiveImport(2026)
    const kpi = await repository.readKpiBlocksFromActiveImport(2026)

    expect(dsh).toBeNull()
    expect(kpi).toBeNull()
    expect(client.dshQueryCount).toEqual({})
    expect(client.kpiQueryCount).toEqual({})
  })

  it("batches dsh/rev/kpi active-source lookups for the same fiscal year into a single Supabase query", async () => {
    const { repository, client } = await loadRepository({
      activeSourcesByFiscalYear: {
        2026: [
          { tabKey: "dsh", runId: "run-1", startedAt: "2026-07-01T00:00:00Z" },
          { tabKey: "kpi", runId: "run-1", startedAt: "2026-07-01T00:00:00Z" },
        ],
      },
      dshRowsByRunId: { "run-1": [DSH_TEAM_ROW] },
      kpiRowsByRunId: { "run-1": [KPI_ROW] },
    })

    // 순차 호출(같은 unstable_cache 스텁 스토어를 공유)이므로 두 번째 호출은 배치 쿼리
    // 캐시를 재사용해야 한다 — tabKey별로 따로 쿼리하던 이전 동작이면 2회가 됐을 것.
    await repository.readDshFromActiveImport(2026)
    await repository.readKpiBlocksFromActiveImport(2026)

    expect(client.activeSourceQueryCount).toBe(1)
  })
})

// REV 읽기: 라인/엔트리 동시 조회 + 인스턴스 내 in-flight 공유.
describe("REV active-import read (concurrent lines/entries, shared in-flight)", () => {
  type PageResult = { data: unknown[] | null; error: { code?: string; message: string } | null }

  interface RevFixture {
    lines: () => Promise<PageResult>
    entries: () => Promise<PageResult>
  }

  async function loadRevRepository(fixture: RevFixture) {
    vi.resetModules()
    const calls = { lines: 0, entries: 0, order: [] as string[] }
    const client = {
      from: vi.fn((table: string) => {
        if (table === "sales_ledger_active_sources") {
          const builder = {
            select: () => builder,
            eq: () => builder,
            then: (resolve: (v: { data: unknown; error: null }) => void) =>
              resolve({
                data: [
                  { tab_key: "rev", import_run_id: "run-1", sales_ledger_import_runs: { started_at: "2026-07-01T00:00:00Z" } },
                ],
                error: null,
              }),
          }
          return builder
        }
        const isLines = table === "branch_rev_lines"
        const builder = {
          select: () => builder,
          eq: () => builder,
          order: () => builder,
          range: () => {
            const key = isLines ? "lines" : "entries"
            calls[key] += 1
            calls.order.push(key)
            return isLines ? fixture.lines() : fixture.entries()
          },
        }
        return builder
      }),
    }
    vi.doMock("@/lib/supabase/admin", () => ({ createSupabaseAdminClient: vi.fn(() => client) }))
    // 실제 unstable_cache 처럼 동시 미스를 합치지 않는 스텁(완료 후에만 메모이즈).
    vi.doMock("next/cache", () => ({
      revalidateTag: vi.fn(),
      unstable_cache: (fn: (...args: unknown[]) => Promise<unknown>) => {
        const store = new Map<string, unknown>()
        return async (...args: unknown[]) => {
          const key = JSON.stringify(args)
          if (store.has(key)) return store.get(key)
          const result = await fn(...args)
          store.set(key, result)
          return result
        }
      },
    }))
    const repository = await import("@/lib/repositories/sales-ledger-imports")
    const shared = await import("@/lib/server/share-in-flight")
    shared.__resetShareInFlightForTests()
    return { repository, calls }
  }

  const LINE = {
    id: "line-1",
    source_row: 5,
    source_record_key: "k1",
    account_name: "A학원",
    branch_contact: null,
    location: null,
    scale: null,
    importance: null,
    team: "BD",
    manager: "Han",
    status: null,
    deal_type: null,
    product: null,
    first_payment: null,
    remark: null,
    total_amount: 100,
    raw: {},
    created_at: "2026-07-01T00:00:00Z",
  }
  const ok = (data: unknown[]): Promise<PageResult> => Promise.resolve({ data, error: null })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.resetModules()
  })

  it("starts the entries read before the lines read has resolved", async () => {
    let releaseLines: () => void = () => {}
    const { repository, calls } = await loadRevRepository({
      lines: () => new Promise<PageResult>((resolve) => { releaseLines = () => resolve({ data: [LINE], error: null }) }),
      entries: () => ok([]),
    })

    const pending = repository.readRevDealsFromActiveImport(2026)
    await new Promise((r) => setTimeout(r, 0))
    expect(calls.order).toEqual(["entries", "lines"])
    releaseLines()
    const deals = await pending
    expect(deals).toHaveLength(1)
  })

  it("shares one underlying read between concurrent callers with the same (importRunId, team)", async () => {
    const { repository, calls } = await loadRevRepository({
      lines: () => ok([LINE]),
      entries: () => ok([]),
    })

    const [a, b] = await Promise.all([
      repository.readRevDealsFromActiveImport(2026),
      repository.readRevDealsFromActiveImport(2026),
    ])

    expect(calls.lines).toBe(1)
    expect(calls.entries).toBe(1)
    expect(a).toEqual(b)
  })

  it("does not merge callers with a different team", async () => {
    const { repository, calls } = await loadRevRepository({
      lines: () => ok([LINE]),
      entries: () => ok([]),
    })

    await Promise.all([
      repository.readRevDealsFromActiveImport(2026),
      repository.readRevDealsFromActiveImport(2026, { team: "BD" }),
    ])

    expect(calls.lines).toBe(2)
  })

  it("line error wins over an entries error (missing table -> null, other -> throw)", async () => {
    const missing = await loadRevRepository({
      lines: () => Promise.resolve({ data: null, error: { code: "42P01", message: 'relation "branch_rev_lines" does not exist' } }),
      entries: () => Promise.resolve({ data: null, error: { message: "entries boom" } }),
    })
    await expect(missing.repository.readRevDealsFromActiveImport(2026)).resolves.toBeNull()

    const other = await loadRevRepository({
      lines: () => Promise.resolve({ data: null, error: { message: "lines boom" } }),
      entries: () => Promise.resolve({ data: null, error: { message: "entries boom" } }),
    })
    await expect(other.repository.readRevDealsFromActiveImport(2026)).rejects.toThrow(
      "[sales-ledger-imports] REV line import read failed: lines boom",
    )
  })

  it("returns null for zero lines even when the entries read rejects (no unhandled rejection)", async () => {
    const unhandled = vi.fn()
    process.on("unhandledRejection", unhandled)
    const { repository } = await loadRevRepository({
      lines: () => ok([]),
      entries: () => Promise.reject(new Error("entries rejected")),
    })

    await expect(repository.readRevDealsFromActiveImport(2026)).resolves.toBeNull()
    await new Promise((r) => setTimeout(r, 10))
    process.off("unhandledRejection", unhandled)
    expect(unhandled).not.toHaveBeenCalled()
  })

  it("entries error is reported after lines succeed (missing -> null, other -> throw)", async () => {
    const missing = await loadRevRepository({
      lines: () => ok([LINE]),
      entries: () => Promise.resolve({ data: null, error: { code: "42P01", message: 'relation "branch_rev_period_entries" does not exist' } }),
    })
    await expect(missing.repository.readRevDealsFromActiveImport(2026)).resolves.toBeNull()

    const other = await loadRevRepository({
      lines: () => ok([LINE]),
      entries: () => Promise.resolve({ data: null, error: { message: "entries boom" } }),
    })
    await expect(other.repository.readRevDealsFromActiveImport(2026)).rejects.toThrow(
      "[sales-ledger-imports] REV period import read failed: entries boom",
    )
  })
})
