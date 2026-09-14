/**
 * CRM 홈 서버 프리페치(RSC)의 보안·회복 계약.
 *
 * 이 저장소에는 middleware가 없고 app/admin/layout.tsx의 가드는 보안 경계가 아니다.
 * 실제 차단은 각 API 라우트의 requireVerifiedAdminContext이므로, 첫 화면을 서버에서
 * 미리 만드는 이 경로도 **같은 검증·같은 역할 목록**을 통과해야만 데이터를 만들어야 한다.
 * 여기서 고정하는 것: 미검증·역할 부족이면 무거운 집계를 아예 부르지 않고 null(레인 없음).
 *
 * 2026-09-10 스트리밍 전환: prefetchCrmHomeInitialData()는 이제 성공 시 값이 아니라 소스마다
 * {promise, generatedAt}(DeferredPrefetch)을 돌려준다 — 이 파일의 단언은 먼저 각 `.promise`를
 * await한 뒤 그 settle된 값으로 검증한다(tests/admin/prefetch-budget.test.ts와 같은
 * vi.advanceTimersByTimeAsync(0) 패턴). 미검증·역할 부족 시의 반환값 자체는 `null`로
 * 바뀌었다(예전 EMPTY_INITIAL_DATA 상수 없이, CrmHomeClient가 이미 갖고 있던
 * `initialData?: CrmHomeInitialData | null` optional 계약을 그대로 쓴다).
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
  it("검증 컨텍스트가 없으면 집계를 부르지 않고 null(레인 없음)을 돌려준다", async () => {
    getVerifiedAdminContextForPage.mockResolvedValue(null)

    const prefetch = await loadPrefetch()
    expect(await prefetch()).toBeNull()

    expect(getLeadActionStats).not.toHaveBeenCalled()
    expect(getAdminCrmOverview).not.toHaveBeenCalled()
    expect(buildCompassPipelineBand).not.toHaveBeenCalled()
  })

  it("CRM 허용 역할이 아니면(PARTNER) 집계를 부르지 않는다", async () => {
    getVerifiedAdminContextForPage.mockResolvedValue({ role: "PARTNER", userId: "u1" })

    const prefetch = await loadPrefetch()
    expect(await prefetch()).toBeNull()

    expect(getAdminCrmOverview).not.toHaveBeenCalled()
  })

  it("검증 자체가 던져도 페이지를 500으로 만들지 않고 null로 떨어진다", async () => {
    getVerifiedAdminContextForPage.mockRejectedValue(new Error("supabase env missing"))
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {})

    const prefetch = await loadPrefetch()
    expect(await prefetch()).toBeNull()

    errorSpy.mockRestore()
  })
})

describe("prefetchCrmHomeInitialData 데이터 조립 — 스트리밍 계약(레인 반환)", () => {
  it("허용 역할이면 세 소스 모두 즉시 레인({promise, generatedAt})으로 온다 — settle을 기다리지 않는다", async () => {
    getVerifiedAdminContextForPage.mockResolvedValue({ role: "EDITOR", userId: "u1" })
    // run()이 영원히 끝나지 않아도 prefetch() 자체는 끝나야 한다(openPrefetchLane 핵심 속성).
    getAdminCrmOverview.mockImplementation(() => new Promise(() => {}))

    const prefetch = await loadPrefetch()
    const lanes = await prefetch()

    expect(lanes).not.toBeNull()
    expect(lanes?.leadActionKpis.promise).toBeInstanceOf(Promise)
    expect(lanes?.overview.promise).toBeInstanceOf(Promise)
    expect(lanes?.compassPipeline.promise).toBeInstanceOf(Promise)
    expect(typeof lanes?.leadActionKpis.generatedAt).toBe("number")
  })

  it("허용 역할이면 세 소스를 라우트와 같은 함수로 채운다(settle된 값 기준)", async () => {
    getVerifiedAdminContextForPage.mockResolvedValue({ role: "EDITOR", userId: "u1" })

    const prefetch = await loadPrefetch()
    const lanes = await prefetch()
    await vi.advanceTimersByTimeAsync(0)

    if (!lanes) throw new Error("허용 역할인데 레인이 null이다")
    await expect(lanes.leadActionKpis.promise).resolves.toEqual(LEAD_KPIS)
    await expect(lanes.overview.promise).resolves.toEqual(OVERVIEW)
    await expect(lanes.compassPipeline.promise).resolves.toEqual(COMPASS)
  })

  it("한 소스가 실패해도 나머지는 살아남는다(소스별 독립 레인)", async () => {
    getVerifiedAdminContextForPage.mockResolvedValue({ role: "SUPER_ADMIN", userId: "u1" })
    getAdminCrmOverview.mockRejectedValue(new Error("overview down"))
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {})

    const prefetch = await loadPrefetch()
    const lanes = await prefetch()
    await vi.advanceTimersByTimeAsync(0)

    if (!lanes) throw new Error("허용 역할인데 레인이 null이다")
    await expect(lanes.leadActionKpis.promise).resolves.toEqual(LEAD_KPIS)
    await expect(lanes.overview.promise).resolves.toBeNull()
    await expect(lanes.compassPipeline.promise).resolves.toEqual(COMPASS)
    errorSpy.mockRestore()
  })
})
