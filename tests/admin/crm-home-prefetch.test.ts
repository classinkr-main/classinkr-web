/**
 * CRM 홈 서버 프리페치(RSC)의 보안·회복 계약.
 *
 * 이 저장소에는 middleware가 없고 app/admin/layout.tsx의 가드는 보안 경계가 아니다.
 * 실제 차단은 각 API 라우트의 requireVerifiedAdminContext이므로, 첫 화면을 서버에서
 * 미리 만드는 이 경로도 **같은 검증·같은 역할 목록**을 통과해야만 데이터를 만들어야 한다.
 * 여기서 고정하는 것: 미검증·역할 부족이면 무거운 집계를 아예 부르지 않고 전부 null.
 *
 * generatedAt(T3 — 재사용된 RSC 프리페치의 신선도 판정용)도 여기서 함께 고정한다:
 * EMPTY_INITIAL_DATA 경로는 0, 정상 조립 경로는 settle 시각(Date.now()) — 그래서 시계를
 * 고정해 둔다.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const getVerifiedAdminContextForPage = vi.fn()
const getLeadActionStats = vi.fn()
const getAdminCrmOverview = vi.fn()
const buildCompassPipelineBand = vi.fn()

vi.mock("@/lib/admin/page-auth", () => ({ getVerifiedAdminContextForPage }))
vi.mock("@/lib/repositories/leads", () => ({ getLeadActionStats }))
vi.mock("@/lib/admin-crm-overview", () => ({ getAdminCrmOverview }))
vi.mock("@/lib/compass/home-band", () => ({ buildCompassPipelineBand }))

const LEAD_KPIS = { unrespondedCount: 3, unresponded24hCount: 1 }
const OVERVIEW = { generatedAt: "2026-08-28T00:00:00.000Z" }
const COMPASS = { down: false, todayDemoCount: 2, upcomingActionCount: 5, bdOpenCount: 7 }
const NOW = new Date("2026-08-28T00:00:00.000Z")

async function loadPrefetch() {
  const mod = await import("@/lib/admin/crm/home-prefetch")
  return mod.prefetchCrmHomeInitialData
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(NOW)
  vi.clearAllMocks()
  getLeadActionStats.mockResolvedValue(LEAD_KPIS)
  getAdminCrmOverview.mockResolvedValue(OVERVIEW)
  buildCompassPipelineBand.mockResolvedValue(COMPASS)
})

afterEach(() => {
  vi.useRealTimers()
})

describe("prefetchCrmHomeInitialData 보안 게이트", () => {
  it("검증 컨텍스트가 없으면 집계를 부르지 않고 전부 null을 돌려준다", async () => {
    getVerifiedAdminContextForPage.mockResolvedValue(null)

    const prefetch = await loadPrefetch()
    expect(await prefetch()).toEqual({
      leadActionKpis: null,
      overview: null,
      compassPipeline: null,
      generatedAt: 0,
    })

    expect(getLeadActionStats).not.toHaveBeenCalled()
    expect(getAdminCrmOverview).not.toHaveBeenCalled()
    expect(buildCompassPipelineBand).not.toHaveBeenCalled()
  })

  it("CRM 허용 역할이 아니면(PARTNER) 집계를 부르지 않는다", async () => {
    getVerifiedAdminContextForPage.mockResolvedValue({ role: "PARTNER", userId: "u1" })

    const prefetch = await loadPrefetch()
    expect(await prefetch()).toEqual({
      leadActionKpis: null,
      overview: null,
      compassPipeline: null,
      generatedAt: 0,
    })

    expect(getAdminCrmOverview).not.toHaveBeenCalled()
  })

  it("검증 자체가 던져도 페이지를 500으로 만들지 않고 프리페치 없음으로 떨어진다", async () => {
    getVerifiedAdminContextForPage.mockRejectedValue(new Error("supabase env missing"))
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {})

    const prefetch = await loadPrefetch()
    expect(await prefetch()).toEqual({
      leadActionKpis: null,
      overview: null,
      compassPipeline: null,
      generatedAt: 0,
    })

    errorSpy.mockRestore()
  })
})

describe("prefetchCrmHomeInitialData 데이터 조립", () => {
  it("허용 역할이면 세 소스를 라우트와 같은 함수로 채운다", async () => {
    getVerifiedAdminContextForPage.mockResolvedValue({ role: "EDITOR", userId: "u1" })

    const prefetch = await loadPrefetch()
    expect(await prefetch()).toEqual({
      leadActionKpis: LEAD_KPIS,
      overview: OVERVIEW,
      compassPipeline: COMPASS,
      generatedAt: NOW.getTime(),
    })
  })

  it("한 소스가 실패해도 나머지는 살아남는다(소스별 예산)", async () => {
    getVerifiedAdminContextForPage.mockResolvedValue({ role: "SUPER_ADMIN", userId: "u1" })
    getAdminCrmOverview.mockRejectedValue(new Error("overview down"))

    const prefetch = await loadPrefetch()
    expect(await prefetch()).toEqual({
      leadActionKpis: LEAD_KPIS,
      overview: null,
      compassPipeline: COMPASS,
      generatedAt: NOW.getTime(),
    })
  })
})
