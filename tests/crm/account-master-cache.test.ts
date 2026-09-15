/**
 * lib/repositories/account-master.ts 의 getAccountMaster 캐시 배선 계약 (2026-09-10 3라운드 §3.3).
 *
 * 이전엔 캐시가 아예 없어 매 조회가 4개 원천(customers·partner_accounts·branch_rev_deals·
 * crm_source_links)을 keyset 페이지네이션으로 전량 재수집했다. unstable_cache(60초,
 * admin-crm-account-master 태그)로 승격했다.
 *
 * 무효화는 부분적이다 — crm_source_links 확정/해제 쓰기(lib/repositories/crm-source-links.ts·
 * crm-naver-map.ts)만 이 태그를 revalidateTag(tag, "max")로 건다. customers·partner_accounts·
 * branch_rev_deals 원본 행 자체의 변경(고객 DB·지사 소유 파일)은 무효화 경로가 없다 —
 * 그래서 TTL을 60초로 보수적으로 유지했다(Phase 4 규칙). 이 파일의 마지막 describe가
 * 그 쓰기 경로들이 실제로 이 태그를 무효화하는지 텍스트 계약으로 고정한다(전부를 behavior
 * 테스트로 구동하려면 crm-source-links.ts의 무거운 의존성 트리를 전부 모킹해야 해서, 이미
 * 존재하는 tests/admin/crm-readiness-cache.test.ts·tests/crm/admin-crm-duplicate-preflight-
 * order.test.ts와 같은 텍스트 계약 방식을 쓴다).
 */
import { readFileSync } from "fs"
import { resolve } from "path"
import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  unstableCache: vi.fn(),
  revalidateTag: vi.fn(),
}))

vi.mock("next/cache", () => ({
  unstable_cache: mocks.unstableCache,
  revalidateTag: mocks.revalidateTag,
}))

// account-master.ts는 abortSignal()로 끝나는 체인을 쓴다 — tests/helpers/recording-supabase-client
// 는 이 메서드를 지원하지 않아, 이 파일 전용의 최소 스텁을 둔다. 4개 원천 모두 빈 첫 페이지를
// 돌려줘 keyset 루프가 한 번만 돈다(fetchAllAccountMasterRowsById: page.length < pageSize면 종료).
function emptyPageBuilder() {
  const builder = {
    select: () => builder,
    order: () => builder,
    limit: () => builder,
    gt: () => builder,
    neq: () => builder,
    abortSignal: async () => ({ data: [], error: null }),
  }
  return builder
}

async function loadModule() {
  vi.resetModules()
  vi.doMock("@/lib/supabase/admin", () => ({
    createSupabaseAdminClient: () => ({ from: () => emptyPageBuilder() }),
  }))
  return import("@/lib/repositories/account-master")
}

describe("account-master getAccountMaster 캐시 배선", () => {
  beforeEach(() => {
    mocks.unstableCache.mockReset()
    mocks.unstableCache.mockImplementation((fn: unknown) => fn)
    mocks.revalidateTag.mockClear()
  })

  it("unstable_cache(60초, admin-crm-account-master 태그)로 감싼다", async () => {
    await loadModule()

    expect(mocks.unstableCache).toHaveBeenCalledTimes(1)
    const [fn, keyParts, options] = mocks.unstableCache.mock.calls[0]
    expect(typeof fn).toBe("function")
    expect(keyParts).toEqual(["admin-crm-account-master-v1"])
    expect(options).toEqual({ revalidate: 60, tags: ["admin-crm-account-master"] })
  })

  it("4개 원천이 전부 빈 상태에서도 정상적인 빈 결과 모양을 낸다(JSON 안전성 가드 통과)", async () => {
    const { getAccountMaster } = await loadModule()

    const result = await getAccountMaster()

    expect(result).toEqual({
      accounts: [],
      unmatched: [],
      summary: { accountsWithRevenue: 0, linkedRevenueCNY: 0, unmatchedRevenueCNY: 0 },
    })
  })
})

describe("account-master 무효화 배선 (crm_source_links 쓰기 경로)", () => {
  const sourceLinks = readFileSync(resolve(process.cwd(), "lib/repositories/crm-source-links.ts"), "utf8")
  const naverMap = readFileSync(resolve(process.cwd(), "lib/repositories/crm-naver-map.ts"), "utf8")

  it("crm-source-links.ts가 태그를 import하고 확정/해제/수동생성/재부착 경로에서 무효화한다", () => {
    expect(sourceLinks).toContain(
      'import { ADMIN_CRM_ACCOUNT_MASTER_CACHE_TAG } from "@/lib/admin/crm/cache-tags"'
    )
    // updateCrmSourceLinkStatus(confirm 성공 + reject/stale 성공), createManualBranchRevLinkCandidate,
    // upsertConfirmedLeadCustomerLink, reattachBranchRevConfirmedLinks — 총 5개 호출부.
    const occurrences = sourceLinks.split("revalidateTag(ADMIN_CRM_ACCOUNT_MASTER_CACHE_TAG").length - 1
    expect(occurrences).toBeGreaterThanOrEqual(5)
  })

  it("crm-naver-map.ts의 confirmCrmNaverMapLink도 같은 태그를 무효화한다", () => {
    expect(naverMap).toContain('import {\n  ADMIN_CRM_ACCOUNT_MASTER_CACHE_TAG,')
    expect(naverMap).toContain("revalidateTag(ADMIN_CRM_ACCOUNT_MASTER_CACHE_TAG")
  })
})
