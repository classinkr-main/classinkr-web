// DSH/KPI 액티브 임포트 콘텐츠 캐시 회귀 가드.
// readDshFromActiveImport/readKpiBlocksFromActiveImport는 REV의 readCachedRevDealsForImportRun과
// 같은 패턴으로 (importRunId 키, SALES_LEDGER_IMPORTS_CACHE_TAG 태그) unstable_cache에 감싸져
// KR Team/summary가 요청마다 전량 페이징 재조회하던 비용을 없앤다. 이 테스트는 실제 Next.js
// 캐시 런타임 없이도 (1) 같은 importRunId 재호출이 Supabase를 다시 때리지 않는지,
// (2) 서로 다른 활성 런(연도별 active_sources 전환)이 서로의 캐시를 오염시키지 않는지,
// (3) REV와 같은 태그(SALES_LEDGER_IMPORTS_CACHE_TAG)로 걸려 있는지를 검증한다 — ③이 깨지면
// 이 캐시만 무효화 경로 없이 남아 "방금 재캡처한 장부가 300초간 안 보이는" 회귀가 생긴다.
import { afterEach, describe, expect, it, vi } from "vitest"

interface ActiveSourceEntry {
  runId: string
  startedAt: string
}

interface SupabaseFixture {
  activeSourceByFiscalYear: Record<number, ActiveSourceEntry | null>
  dshRowsByRunId?: Record<string, unknown[]>
  kpiRowsByRunId?: Record<string, unknown[]>
}

function supabaseClient(fixture: SupabaseFixture) {
  const dshQueryCount: Record<string, number> = {}
  const kpiQueryCount: Record<string, number> = {}

  // Supabase-js PostgrestFilterBuilder처럼 select/eq/order/range/maybeSingle이 모두 같은
  // 빌더를 반환하는 체이너블 객체. range()/maybeSingle()에서 프라미스로 굳는다.
  const from = vi.fn((table: string) => {
    if (table === "sales_ledger_active_sources") {
      let fiscalYear: number | undefined
      const builder: {
        select: () => typeof builder
        eq: (column: string, value: unknown) => typeof builder
        maybeSingle: () => Promise<{ data: unknown; error: null }>
      } = {
        select: () => builder,
        eq: (column, value) => {
          if (column === "fiscal_year") fiscalYear = value as number
          return builder
        },
        maybeSingle: () => {
          const entry = fiscalYear != null ? fixture.activeSourceByFiscalYear[fiscalYear] : undefined
          if (!entry) return Promise.resolve({ data: null, error: null })
          return Promise.resolve({
            data: {
              import_run_id: entry.runId,
              sales_ledger_import_runs: { started_at: entry.startedAt },
            },
            error: null,
          })
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

  return { from, dshQueryCount, kpiQueryCount }
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
      activeSourceByFiscalYear: { 2026: { runId: "run-1", startedAt: "2026-07-01T00:00:00Z" } },
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
      activeSourceByFiscalYear: { 2026: { runId: "run-1", startedAt: "2026-07-01T00:00:00Z" } },
      dshRowsByRunId: { "run-1": [DSH_TEAM_ROW] },
    })

    await repository.readDshFromActiveImport(2026)
    await repository.readDshFromActiveImport(2026)

    expect(client.dshQueryCount["run-1"]).toBe(1)
  })

  it("reuses cached KPI content for the same active import run instead of re-querying Supabase", async () => {
    const { repository, client } = await loadRepository({
      activeSourceByFiscalYear: { 2026: { runId: "run-1", startedAt: "2026-07-01T00:00:00Z" } },
      kpiRowsByRunId: { "run-1": [KPI_ROW] },
    })

    await repository.readKpiBlocksFromActiveImport(2026)
    await repository.readKpiBlocksFromActiveImport(2026)

    expect(client.kpiQueryCount["run-1"]).toBe(1)
  })

  it("does not leak DSH content across two different active import runs (active-source switch still refreshes)", async () => {
    const { repository, client } = await loadRepository({
      activeSourceByFiscalYear: {
        2025: { runId: "run-old", startedAt: "2025-07-01T00:00:00Z" },
        2026: { runId: "run-new", startedAt: "2026-07-01T00:00:00Z" },
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
      activeSourceByFiscalYear: { 2026: null },
    })

    const dsh = await repository.readDshFromActiveImport(2026)
    const kpi = await repository.readKpiBlocksFromActiveImport(2026)

    expect(dsh).toBeNull()
    expect(kpi).toBeNull()
    expect(client.dshQueryCount).toEqual({})
    expect(client.kpiQueryCount).toEqual({})
  })
})
