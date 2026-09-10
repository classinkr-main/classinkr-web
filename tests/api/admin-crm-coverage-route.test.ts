import { beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest, NextResponse } from "next/server"

// GET /api/admin/crm/coverage — getCrmSourceLinkCoverage(fetchSupabasePages ×3)와
// getRevAccountCoverage(REV 시트 풀스캔 + fetchSupabasePages ×2)를 조합하는 무거운 합성이라
// 60초 unstable_cache로 감쌌다(2026-09-02). 이 테스트는 (1) 캐시 keyParts/tags/revalidate 배선,
// (2) coverage+health+revAccounts 조합이 기존 그대로 유지되는지, (3) revAccounts 실패 시
// 부분 격리(coverage는 살리고 revAccounts만 null)가 캐시 도입 후에도 유지되는지를 고정한다.
const mocks = vi.hoisted(() => ({
  requireVerifiedAdminContext: vi.fn(),
  getCrmSourceLinkCoverage: vi.fn(),
  getRevAccountCoverage: vi.fn(),
}))

const unstableCacheCalls: Array<{
  keyParts: string[]
  options?: { revalidate?: number; tags?: string[] }
}> = []

vi.mock("next/cache", () => ({
  unstable_cache: (
    fn: (...args: unknown[]) => unknown,
    keyParts: string[],
    options?: { revalidate?: number; tags?: string[] }
  ) => {
    unstableCacheCalls.push({ keyParts, options })
    return fn
  },
}))
vi.mock("@/lib/admin-auth", () => ({
  CRM_STAFF_ADMIN_API_ROLES: ["admin"],
  requireVerifiedAdminContext: mocks.requireVerifiedAdminContext,
}))
vi.mock("@/lib/repositories/crm-source-links", () => ({
  getCrmSourceLinkCoverage: mocks.getCrmSourceLinkCoverage,
}))
vi.mock("@/lib/repositories/rev-account-coverage", () => ({
  getRevAccountCoverage: mocks.getRevAccountCoverage,
}))

async function loadRoute() {
  // 모듈 최상단에서 unstable_cache(...)를 한 번 호출하므로, keyParts/tags 배선을 매 테스트
  // 새로 관찰하려면 모듈을 다시 로드해야 한다(ESM 캐시라 재-import만으로는 재실행되지 않는다).
  vi.resetModules()
  return import("@/app/api/admin/crm/coverage/route")
}

describe("GET /api/admin/crm/coverage", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    unstableCacheCalls.length = 0
    mocks.requireVerifiedAdminContext.mockResolvedValue({ userId: "admin-1" })
    mocks.getCrmSourceLinkCoverage.mockResolvedValue({
      total: 10,
      linked: 8,
      needsReview: 1,
      coveragePct: 80,
      diagnostics: {
        stored: { total: 10, confirmed: 8, candidate: 1, stale: 1 },
        excluded: { reviewHistory: 0, confirmedHistory: 0, outOfScope: 0 },
        validation: { aliasCatalog: "verified", branchSource: "verified", externalSource: "fail_open", warnings: [] },
      },
    })
    mocks.getRevAccountCoverage.mockResolvedValue({ scannedRows: 5 })
  })

  it("60초 캐시로 감싸고 admin-os-summary(getCrmSourceLinkCoverage 공용 태그)를 함께 건다", async () => {
    await loadRoute()

    expect(unstableCacheCalls).toHaveLength(1)
    expect(unstableCacheCalls[0].keyParts).toEqual(["admin-crm-coverage"])
    expect(unstableCacheCalls[0].options).toEqual({
      revalidate: 60,
      tags: ["admin-crm-coverage", "admin-os-summary"],
    })
  })

  it("coverage·revAccounts를 조합해 health와 함께 adminCachedJson으로 내려준다", async () => {
    const { GET } = await loadRoute()
    const response = await GET(new NextRequest("https://classin.kr/api/admin/crm/coverage"))
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body).toMatchObject({
      total: 10,
      linked: 8,
      needsReview: 1,
      coveragePct: 80,
      health: { state: "partial" },
      revAccounts: { scannedRows: 5 },
    })
    expect(response.headers.get("Cache-Control")).toContain("private")
  })

  it("getRevAccountCoverage가 실패해도 coverage는 살리고 revAccounts만 null로 격리한다", async () => {
    mocks.getRevAccountCoverage.mockRejectedValue(new Error("boom"))
    const { GET } = await loadRoute()
    const response = await GET(new NextRequest("https://classin.kr/api/admin/crm/coverage"))
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.revAccounts).toBeNull()
    expect(body.total).toBe(10)
  })

  it("인증 실패면 조회 없이 그대로 응답을 반환한다", async () => {
    mocks.requireVerifiedAdminContext.mockResolvedValue(
      NextResponse.json({ error: "unauthorized" }, { status: 401 })
    )

    const { GET } = await loadRoute()
    const response = await GET(new NextRequest("https://classin.kr/api/admin/crm/coverage"))

    expect(response.status).toBe(401)
    expect(mocks.getCrmSourceLinkCoverage).not.toHaveBeenCalled()
  })
})
