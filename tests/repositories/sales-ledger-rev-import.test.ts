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
