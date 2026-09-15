/**
 * os-summary 콜드 미스 완화(2026-09-10) — renewal·matching 두 소스만 outer(60초)와 별개인
 * 5분(300초) 캐시로 한 번 더 감싸는지 고정한다.
 *
 * 배경: getCachedOsSummary(60초)가 renewal(getNeoCrmCustomers)·matching
 * (getCrmSourceLinkCoverage) 두 무거운 소스를 매번 재계산해 콜드 미스가 8초대까지
 * 늘어났다(docs 없이 이 세션에서 실측). 두 값은 분 단위로 요동치지 않는 운영 지표라
 * 5분 캐시로 원가를 내는 빈도를 줄인다 — hw·content·events 세 소스는 그대로 60초다.
 * "admin-os-summary" 태그는 CRM 코어의 app/api/admin/crm/coverage/route.ts와 공유해서,
 * 그 라우트의 뮤테이션발 revalidateTag가 이 새 캐시도 함께 무효화하게 한다.
 */
import { describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  getNeoCrmCustomers: vi.fn(),
  getCrmSourceLinkCoverage: vi.fn(),
  listHwOutbound: vi.fn(),
  countPublishedPosts: vi.fn(),
  countPublicEvents: vi.fn(),
  unstableCacheCalls: [] as Array<{ key: unknown[]; options: Record<string, unknown> }>,
}))

vi.mock("next/cache", () => ({
  unstable_cache: (
    fn: (...args: unknown[]) => unknown,
    key: unknown[],
    options: Record<string, unknown>
  ) => {
    mocks.unstableCacheCalls.push({ key, options })
    return fn
  },
}))
vi.mock("@/lib/admin-crm-customers-neo", () => ({ getNeoCrmCustomers: mocks.getNeoCrmCustomers }))
vi.mock("@/lib/repositories/crm-source-links", () => ({
  getCrmSourceLinkCoverage: mocks.getCrmSourceLinkCoverage,
}))
vi.mock("@/lib/repositories/branch-hw", () => ({ listHwOutbound: mocks.listHwOutbound }))
vi.mock("@/lib/repositories/blog", () => ({ countPublishedPosts: mocks.countPublishedPosts }))
vi.mock("@/lib/repositories/public-events", () => ({ countPublicEvents: mocks.countPublicEvents }))

describe("lib/admin/overview/os-summary.ts — 캐시 티어 분리", () => {
  it("renewal·matching은 300초, outer는 60초로 각각 unstable_cache에 걸린다", async () => {
    await import("@/lib/admin/overview/os-summary")

    const renewalEntry = mocks.unstableCacheCalls.find(
      (call) => call.key[0] === "admin-os-summary-renewal-v1"
    )
    const matchingEntry = mocks.unstableCacheCalls.find(
      (call) => call.key[0] === "admin-os-summary-matching-v1"
    )
    const outerEntry = mocks.unstableCacheCalls.find((call) => call.key[0] === "admin-os-summary-v3")

    expect(renewalEntry).toBeDefined()
    expect(matchingEntry).toBeDefined()
    expect(outerEntry).toBeDefined()

    expect(renewalEntry?.options.revalidate).toBe(300)
    expect(matchingEntry?.options.revalidate).toBe(300)
    expect(outerEntry?.options.revalidate).toBe(60)
  })

  it("renewal·matching 태그는 outer와 같은 admin-os-summary 태그를 공유한다(crm/coverage 라우트와 교차 무효화)", async () => {
    await import("@/lib/admin/overview/os-summary")

    const renewalEntry = mocks.unstableCacheCalls.find(
      (call) => call.key[0] === "admin-os-summary-renewal-v1"
    )
    const matchingEntry = mocks.unstableCacheCalls.find(
      (call) => call.key[0] === "admin-os-summary-matching-v1"
    )

    expect(renewalEntry?.options.tags).toContain("admin-os-summary")
    expect(matchingEntry?.options.tags).toContain("admin-os-summary")
  })
})
