// captureRevDbImport/activateRevImportRun 캐시 무효화 경로 회귀 가드.
// 품질 웨이브2에서 sales-ledger-imports.ts에 DSH/KPI 콘텐츠 캐시를 새로 얹으며
// SALES_LEDGER_IMPORTS_CACHE_TAG를 REV의 기존 캐시와 공유하기로 했다 — 그 판단의 전제가
// "REV 쪽 DB 재동기화(활성화)는 이미 이 태그를 무효화한다"였다. 이 테스트는 그 전제가
// 코드로 실제 보장됨을 고정한다: activateRevImportRun이 active_sources upsert 성공 직후
// revalidateTag(SALES_LEDGER_IMPORTS_CACHE_TAG)를 호출하지 않게 되면(리팩터 실수 등)
// "DB 재동기화 후에도 방금 반영한 수치가 최대 300초간 안 보이는" 회귀가 조용히 생긴다.
import { afterEach, describe, expect, it, vi } from "vitest"

const revalidateTag = vi.fn()

type ActiveRow = { import_run_id: string; parser_version?: string | null; started_at?: string }

// activateRevImportRun 은 upsert 전에 활성 run(의 parser_version)을 읽는다(2026-10-28 캡처 버전 단조성).
// 같은 체인 객체로 조회(select→eq→maybeSingle)와 upsert 를 모두 받는다.
function activeSourcesClient(options: { active?: ActiveRow | null; upsertError?: { message: string } | null } = {}) {
  const upsert = vi.fn(() => Promise.resolve({ error: options.upsertError ?? null }))
  const maybeSingle = vi.fn(async () => ({
    data: options.active
      ? {
          import_run_id: options.active.import_run_id,
          sales_ledger_import_runs: {
            status: "succeeded",
            started_at: options.active.started_at ?? "2026-10-20T08:00:00Z",
            parser_version: options.active.parser_version === undefined ? "sales-ledger-import-v1" : options.active.parser_version,
          },
        }
      : null,
    error: null,
  }))
  const chain: Record<string, unknown> = {}
  chain.select = vi.fn(() => chain)
  chain.eq = vi.fn(() => chain)
  chain.maybeSingle = maybeSingle
  chain.upsert = upsert
  const from = vi.fn(() => chain)
  return { from, upsert, maybeSingle }
}

async function loadRepository(
  error: { message: string } | null = null,
  active: ActiveRow | null = null,
) {
  vi.resetModules()
  revalidateTag.mockClear()
  const client = activeSourcesClient({ active, upsertError: error })

  // sales-ledger-rev-import.ts는 branch-deals.ts(listBranchRevDeals)를 임포트하고, 그 모듈이
  // 모듈 스코프에서 unstable_cache를 호출한다 — revalidateTag만 스텁하면 그쪽 임포트가 깨진다.
  vi.doMock("next/cache", () => ({
    revalidateTag,
    unstable_cache: (fn: unknown) => fn,
  }))
  vi.doMock("@/lib/supabase/admin", () => ({
    createSupabaseAdminClient: vi.fn(() => client),
  }))

  const repository = await import("@/lib/repositories/sales-ledger-rev-import")
  const { SALES_LEDGER_IMPORTS_CACHE_TAG } = await import("@/lib/repositories/sales-ledger-imports")
  return { repository, client, SALES_LEDGER_IMPORTS_CACHE_TAG }
}

describe("activateRevImportRun cache invalidation", () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.resetModules()
  })

  it("revalidates SALES_LEDGER_IMPORTS_CACHE_TAG after switching the active source", async () => {
    const { repository, client, SALES_LEDGER_IMPORTS_CACHE_TAG } = await loadRepository()

    await repository.activateRevImportRun("run-123", 2026, "tester")

    expect(client.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ tab_key: "rev", fiscal_year: 2026, import_run_id: "run-123" }),
      expect.objectContaining({ onConflict: "tab_key,fiscal_year" }),
    )
    expect(revalidateTag).toHaveBeenCalledWith(SALES_LEDGER_IMPORTS_CACHE_TAG, "max")
  })

  it("does not revalidate when the active-source upsert fails", async () => {
    const { repository } = await loadRepository({ message: "boom" })

    await expect(repository.activateRevImportRun("run-123", 2026, "tester")).rejects.toThrow(
      "active source 전환 실패",
    )
    expect(revalidateTag).not.toHaveBeenCalled()
  })
})

// P0(2026-09-11) — active_sources.activated_at 은 테이블 기본값(now())이 INSERT 때만 먹는다.
// upsert 가 이 컬럼을 싣지 않으면 run 을 몇 번 갈아 끼워도 최초 활성화 시각(7/3)이 남아
// "지금 보는 run 이 언제 활성화됐나"를 거짓으로 답한다(실측: 8/28 run 인데 7/3 표시).
describe("activateRevImportRun activated_at", () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.resetModules()
  })

  it("stamps activated_at on every switch, not just the first insert", async () => {
    const { repository, client } = await loadRepository()
    const before = Date.now()

    await repository.activateRevImportRun("run-456", 2026, "tester")

    const payload = (client.upsert.mock.calls[0] as unknown[])[0] as Record<string, unknown>
    expect(typeof payload.activated_at).toBe("string")
    expect(Date.parse(payload.activated_at as string)).toBeGreaterThanOrEqual(before - 1000)
  })
})

// P0 — 재캡처는 방금 동기화한 미러를 읽어야 한다. listBranchRevDeals 는 unstable_cache 이고
// replaceBranchRevDeals 의 revalidateTag(…, "max") 는 stale-while-revalidate 라, 같은 요청
// 안에서 곧바로 읽으면 동기화 이전 미러를 받아 "변경 없음"으로 dedupe 될 수 있다.
describe("captureRevDbImport reads the mirror fresh", () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.resetModules()
  })

  async function loadWithDealReaders(activeRow: Record<string, unknown> | null) {
    vi.resetModules()
    const listBranchRevDeals = vi.fn(async () => [])
    const listBranchRevDealsFresh = vi.fn(async () => [])
    const maybeSingle = vi.fn(async () => ({ data: activeRow, error: null }))
    const chain: Record<string, unknown> = {}
    chain.select = vi.fn(() => chain)
    chain.eq = vi.fn(() => chain)
    chain.maybeSingle = maybeSingle
    const client = { from: vi.fn(() => chain) }
    vi.doMock("next/cache", () => ({ revalidateTag, unstable_cache: (fn: unknown) => fn }))
    vi.doMock("@/lib/supabase/admin", () => ({ createSupabaseAdminClient: vi.fn(() => client) }))
    vi.doMock("@/lib/repositories/branch-deals", () => ({ listBranchRevDeals, listBranchRevDealsFresh }))
    const repository = await import("@/lib/repositories/sales-ledger-rev-import")
    return { repository, listBranchRevDeals, listBranchRevDealsFresh, client }
  }

  it("uses the uncached reader with raw rows", async () => {
    const { repository, listBranchRevDeals, listBranchRevDealsFresh } = await loadWithDealReaders(null)

    await expect(repository.captureRevDbImport("tester")).rejects.toThrow("임포트할 REV 행이 없습니다")
    expect(listBranchRevDealsFresh).toHaveBeenCalledWith({ withRaw: true })
    expect(listBranchRevDeals).not.toHaveBeenCalled()
  })

  it("recaptureActiveRevImport does nothing when no REV import is active (sheet mode stays sheet mode)", async () => {
    const { repository, listBranchRevDealsFresh } = await loadWithDealReaders(null)

    const result = await repository.recaptureActiveRevImport("sync:cron")

    expect(result).toEqual({ status: "inactive" })
    expect(listBranchRevDealsFresh).not.toHaveBeenCalled()
  })

  it("recaptureActiveRevImport captures when a REV import is active", async () => {
    const { repository, listBranchRevDealsFresh } = await loadWithDealReaders({
      import_run_id: "run-old",
      sales_ledger_import_runs: { status: "succeeded", started_at: "2026-08-28T10:42:38Z" },
    })

    // 빈 미러면 캡처가 던진다 — 활성 상태에서는 실제로 캡처를 시도한다는 증거.
    await expect(repository.recaptureActiveRevImport("sync:cron")).rejects.toThrow("임포트할 REV 행이 없습니다")
    expect(listBranchRevDealsFresh).toHaveBeenCalledTimes(1)
  })
})

// 2026-10-28 — 활성 포인터 전환의 캡처 버전 단조성. 10/15~10/19 에 옛 캡처 코드(운영 크론)와 새 캡처 코드
// (운영 밖 수동 런)가 같은 sales_ledger_active_sources 를 UPSERT 로 번갈아 덮어 rev_period_entries 가 런마다
// ~650 ↔ ~5,500 으로 진동했다. 이제 run 은 parser_version 에 캡처 버전(rev-native:v2)을 남기고, 활성 run 의
// 버전이 후보보다 높으면 포인터를 덮지 않는다. 라벨 이전 run 은 전부 기본값 'sales-ledger-import-v1'(= 1)이라
// 그 위로는 언제나 덮을 수 있다(하위 호환).
describe("캡처 버전 순위", () => {
  it.each([
    ["rev-native:v2", 2],
    ["rev-native:v10", 10],
    ["sales-ledger-import-v1", 1],
    ["  rev-native:v3 ", 3],
    [null, 0],
    [undefined, 0],
    ["", 0],
    ["garbage", 0],
    ["v2-not-at-end:x", 0],
  ])("captureVersionRank(%j) = %d", async (version, rank) => {
    const { captureVersionRank } = await import("@/lib/repositories/sales-ledger-rev-import")
    expect(captureVersionRank(version)).toBe(rank)
  })

  it("현재 캡처 버전은 rev-native:v2 — checksum 프리픽스와 같은 값이다", async () => {
    const { REV_IMPORT_CAPTURE_VERSION, captureVersionRank } = await import("@/lib/repositories/sales-ledger-rev-import")
    expect(REV_IMPORT_CAPTURE_VERSION).toBe("rev-native:v2")
    expect(captureVersionRank(REV_IMPORT_CAPTURE_VERSION)).toBe(2)
  })

  it("활성 run 이 엄격히 높을 때만 유지한다 — 같거나 낮으면 최신 캡처가 이긴다", async () => {
    const { shouldKeepActiveRevImport } = await import("@/lib/repositories/sales-ledger-rev-import")
    expect(shouldKeepActiveRevImport("rev-native:v3", "rev-native:v2")).toBe(true)
    expect(shouldKeepActiveRevImport("rev-native:v2", "rev-native:v2")).toBe(false)
    expect(shouldKeepActiveRevImport("sales-ledger-import-v1", "rev-native:v2")).toBe(false)
    expect(shouldKeepActiveRevImport(null, "rev-native:v2")).toBe(false)
    expect(shouldKeepActiveRevImport("unknown-label", "rev-native:v2")).toBe(false)
  })
})

describe("activateRevImportRun 캡처 버전 단조성", () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.resetModules()
  })

  it("활성 run 이 더 높은 버전(v3)이면 포인터를 덮지 않고 사유를 돌려준다 — 캐시도 건드리지 않는다", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
    const { repository, client } = await loadRepository(null, { import_run_id: "run-v3", parser_version: "rev-native:v3" })

    const result = await repository.activateRevImportRun("run-v2", 2026, "tester")

    expect(result.activated).toBe(false)
    expect(result.keptReason).toContain("rev-native:v3")
    expect(result.keptReason).toContain("rev-native:v2")
    expect(client.upsert).not.toHaveBeenCalled()
    expect(revalidateTag).not.toHaveBeenCalled()
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("active=run-v3 candidate=run-v2"))
  })

  it("활성 run 이 라벨 이전 기본값(sales-ledger-import-v1)이면 덮는다 — 하위 호환", async () => {
    const { repository, client } = await loadRepository(null, { import_run_id: "run-old", parser_version: "sales-ledger-import-v1" })

    const result = await repository.activateRevImportRun("run-new", 2026, "tester")

    expect(result).toEqual({ activated: true })
    expect(client.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ import_run_id: "run-new" }),
      expect.objectContaining({ onConflict: "tab_key,fiscal_year" }),
    )
  })

  it("같은 버전이면 덮는다 — 같은 코드의 최신 캡처가 이긴다", async () => {
    const { repository, client } = await loadRepository(null, { import_run_id: "run-a", parser_version: "rev-native:v2" })

    const result = await repository.activateRevImportRun("run-b", 2026, "tester")

    expect(result.activated).toBe(true)
    expect(client.upsert).toHaveBeenCalledTimes(1)
  })

  it("같은 run 을 다시 활성화하는 것은 버전과 무관하게 허용한다(activated_at 갱신)", async () => {
    const { repository, client } = await loadRepository(null, { import_run_id: "run-same", parser_version: "rev-native:v9" })

    const result = await repository.activateRevImportRun("run-same", 2026, "tester")

    expect(result.activated).toBe(true)
    expect(client.upsert).toHaveBeenCalledTimes(1)
  })

  it("후보 버전을 명시하면 그 값으로 비교한다(dedupe 된 옛 run 도 현재 버전으로 후보가 된다)", async () => {
    const { repository, client } = await loadRepository(null, { import_run_id: "run-v2", parser_version: "rev-native:v2" })

    const kept = await repository.activateRevImportRun("run-legacy", 2026, "tester", "sales-ledger-import-v1")
    expect(kept.activated).toBe(false)
    expect(client.upsert).not.toHaveBeenCalled()

    const activated = await repository.activateRevImportRun("run-legacy", 2026, "tester", "rev-native:v2")
    expect(activated.activated).toBe(true)
  })

  it("활성 run 조회가 미적용 DB(테이블 없음)로 실패하면 비활성으로 보고 전환을 시도한다", async () => {
    vi.resetModules()
    const upsert = vi.fn(async () => ({ error: null }))
    const chain: Record<string, unknown> = {}
    chain.select = vi.fn(() => chain)
    chain.eq = vi.fn(() => chain)
    chain.maybeSingle = vi.fn(async () => ({ data: null, error: { code: "42P01", message: 'relation "sales_ledger_active_sources" does not exist' } }))
    chain.upsert = upsert
    vi.doMock("next/cache", () => ({ revalidateTag, unstable_cache: (fn: unknown) => fn }))
    vi.doMock("@/lib/supabase/admin", () => ({ createSupabaseAdminClient: vi.fn(() => ({ from: vi.fn(() => chain) })) }))
    const repository = await import("@/lib/repositories/sales-ledger-rev-import")

    const result = await repository.activateRevImportRun("run-1", 2026, "tester")

    expect(result.activated).toBe(true)
    expect(upsert).toHaveBeenCalledTimes(1)
  })
})

// 캡처 run 에 남는 출처·버전 라벨, 그리고 재캡처가 포인터를 유지한 경우의 결과 계약.
describe("captureRevDbImport 기록과 recapture 유지(kept)", () => {
  type Row = Record<string, unknown>

  afterEach(() => {
    vi.restoreAllMocks()
    vi.resetModules()
    vi.unstubAllEnvs()
  })

  // 인메모리 PostgREST 경계 — sales-ledger-rev-roundtrip.test.ts 의 importClient 와 같은 꼴에 활성 행 조회를 더했다.
  function captureClient(activeRow: Row | null) {
    const inserts: Record<string, Row[]> = {}
    const upsert = vi.fn(async () => ({ error: null }))
    const from = (table: string) => {
      let inserted: Row[] | null = null
      const builder = {
        select: () => builder,
        eq: () => builder,
        order: () => builder,
        insert: (values: Row | Row[]) => {
          inserted = JSON.parse(JSON.stringify(Array.isArray(values) ? values : [values])) as Row[]
          inserted.forEach((row, index) => { row.id = `${table}-${index}` })
          inserts[table] = [...(inserts[table] ?? []), ...inserted]
          return builder
        },
        update: () => builder,
        upsert,
        single: async () => ({ data: { id: "run-new", started_at: "2026-10-28T00:00:00Z" }, error: null }),
        maybeSingle: async () => ({ data: table === "sales_ledger_active_sources" ? activeRow : null, error: null }),
        then: (resolve: (value: { data: Row[] | null; error: null }) => unknown) => resolve({ data: inserted, error: null }),
      }
      return builder
    }
    return { from, inserts, upsert }
  }

  const deal = {
    id: "mirror-row", sheet_row: 7, customer_name: "Synthetic account", branch_contact: null,
    team: "BD", manager: null, deal_type: null, status: null, first_payment: null,
    product_version: null, region: null, importance: null, note: null, contract_target: 100,
    monthly_payments: {}, monthly_confirmed: {}, monthly_high_conf: {}, monthly_red: {},
    raw: { row: ["Synthetic account", "원본"] },
    synced_at: "2026-10-28T00:00:00Z",
  }

  async function loadCapture(activeRow: Row | null) {
    vi.resetModules()
    const client = captureClient(activeRow)
    vi.doMock("next/cache", () => ({ unstable_cache: (fn: unknown) => fn, revalidateTag }))
    vi.doMock("@/lib/supabase/admin", () => ({ createSupabaseAdminClient: () => client }))
    vi.doMock("@/lib/repositories/branch-deals", () => ({ listBranchRevDealsFresh: async () => [deal] }))
    const repository = await import("@/lib/repositories/sales-ledger-rev-import")
    return { repository, client }
  }

  it("run 행에 parser_version(캡처 버전)과 metadata.runtime(환경·배포·커밋)을 남긴다", async () => {
    vi.stubEnv("VERCEL_ENV", "preview")
    vi.stubEnv("VERCEL_DEPLOYMENT_ID", "dpl_pr42")
    vi.stubEnv("VERCEL_GIT_COMMIT_SHA", "927e177")
    const { repository, client } = await loadCapture(null)

    const result = await repository.captureRevDbImport("tester")

    const run = client.inserts["sales_ledger_import_runs"]?.[0]
    expect(run?.parser_version).toBe("rev-native:v2")
    expect(run?.metadata).toMatchObject({
      purpose: "rev-native",
      captureVersion: "rev-native:v2",
      runtime: { env: "preview", deploymentId: "dpl_pr42", sha: "927e177" },
    })
    expect(result).toMatchObject({ runId: "run-new", activated: true, deduped: false, captureVersion: "rev-native:v2" })
    expect(result.keptReason).toBeUndefined()
    expect(client.upsert).toHaveBeenCalledTimes(1)
  })

  it("활성 run 이 더 높은 버전이면 캡처는 하되 활성화하지 않고 keptReason 을 싣는다", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {})
    const { repository, client } = await loadCapture({
      import_run_id: "run-v3",
      sales_ledger_import_runs: { status: "succeeded", started_at: "2026-10-27T09:00:00Z", parser_version: "rev-native:v3" },
    })

    const result = await repository.captureRevDbImport("tester")

    expect(client.inserts["sales_ledger_import_runs"]).toHaveLength(1)
    expect(result.activated).toBe(false)
    expect(result.keptReason).toContain("rev-native:v3")
    expect(client.upsert).not.toHaveBeenCalled()
  })

  it("recaptureActiveRevImport 는 그 경우 kept 로 돌려준다 — runId 는 화면이 계속 읽는 활성 run", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {})
    const { repository } = await loadCapture({
      import_run_id: "run-v3",
      sales_ledger_import_runs: { status: "succeeded", started_at: "2026-10-27T09:00:00Z", parser_version: "rev-native:v3" },
    })

    const result = await repository.recaptureActiveRevImport("sync:cron")

    expect(result).toEqual({
      status: "kept",
      runId: "run-v3",
      capturedAt: "2026-10-27T09:00:00Z",
      lineCount: 1,
      reason: expect.stringContaining("rev-native:v3"),
      capturedRunId: "run-new",
    })
  })

  it("활성 run 이 라벨 이전(v1 기본값)이면 재캡처가 그대로 전환한다 — captured", async () => {
    const { repository, client } = await loadCapture({
      import_run_id: "run-old",
      sales_ledger_import_runs: { status: "succeeded", started_at: "2026-10-20T09:00:00Z", parser_version: "sales-ledger-import-v1" },
    })

    const result = await repository.recaptureActiveRevImport("sync:cron")

    expect(result).toMatchObject({ status: "captured", runId: "run-new" })
    expect(client.upsert).toHaveBeenCalledTimes(1)
  })
})
