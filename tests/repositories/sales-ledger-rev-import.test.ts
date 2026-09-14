// captureRevDbImport/activateRevImportRun 캐시 무효화 경로 회귀 가드.
// 품질 웨이브2에서 sales-ledger-imports.ts에 DSH/KPI 콘텐츠 캐시를 새로 얹으며
// SALES_LEDGER_IMPORTS_CACHE_TAG를 REV의 기존 캐시와 공유하기로 했다 — 그 판단의 전제가
// "REV 쪽 DB 재동기화(활성화)는 이미 이 태그를 무효화한다"였다. 이 테스트는 그 전제가
// 코드로 실제 보장됨을 고정한다: activateRevImportRun이 active_sources upsert 성공 직후
// revalidateTag(SALES_LEDGER_IMPORTS_CACHE_TAG)를 호출하지 않게 되면(리팩터 실수 등)
// "DB 재동기화 후에도 방금 반영한 수치가 최대 300초간 안 보이는" 회귀가 조용히 생긴다.
import { afterEach, describe, expect, it, vi } from "vitest"

const revalidateTag = vi.fn()

function upsertClient(error: { message: string } | null = null) {
  const upsert = vi.fn(() => Promise.resolve({ error }))
  const from = vi.fn(() => ({ upsert }))
  return { from, upsert }
}

async function loadRepository(error: { message: string } | null = null) {
  vi.resetModules()
  revalidateTag.mockClear()
  const client = upsertClient(error)

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
