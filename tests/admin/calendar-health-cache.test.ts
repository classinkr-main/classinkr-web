// GET /api/admin/calendar/health — 조립 결과 Data Cache 배선 회귀 가드 (2026-09-04).
//
// 배경: 이 라우트는 8개 소스(calendar/partner/event/notion/showroom/showroom_booking/
// team_event/compass_demo + 정적 holiday)를 매 요청 Promise.all로 다시 훑었다 — 캐시가
// 전혀 없었다. 팀원 개인 Google 캘린더 접근 프로브(probeTeamCalendarAccess)만 자격증명에
// 종속된 소스라(lib/admin-calendar/source-cache.ts의 "자격증명에 종속된 소스" 규약과 동일
// 이유) 캐시 경계 밖에 남기고, 나머지는 unstable_cache(120초)로 묶는다.
import { NextRequest, NextResponse } from "next/server"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

async function loadHealthRoute() {
  vi.resetModules()
  const capturedTags: Record<string, string[]> = {}
  const verifyAdmin = vi.fn(async (): Promise<NextResponse | null> => null)
  const summarizeStoredCalendarEvents = vi.fn(async () => ({ count: 1, lastDate: "2026-08-01" }))
  const getPublicEventsAsCalendarEvents = vi.fn(async () => [])
  const getCompassCalendarEventsWithHealth = vi.fn(async () => ({ events: [], down: false }))
  const getNotionMarketingCalendarEvents = vi.fn(async () => [])
  const probeTeamCalendarAccess = vi.fn(async () => ({ configured: 9, accessible: 9 }))
  const getShowroomCalendarEvents = vi.fn(async () => [])
  const summarizeShowroomBookings = vi.fn(async () => ({ count: 0, lastDate: null }))
  const createSupabaseAdminClient = vi.fn(() => ({
    from: () => ({
      select: () => ({
        eq: () => Promise.resolve({ count: 0, error: null }),
        order: () => ({ limit: () => Promise.resolve({ data: [], error: null }) }),
      }),
    }),
  }))

  vi.doMock("@/lib/admin-auth", () => ({ verifyAdmin }))
  vi.doMock("@/lib/repositories/admin-calendar-events", () => ({ summarizeStoredCalendarEvents }))
  vi.doMock("@/lib/repositories/showroom-bookings", () => ({ summarizeShowroomBookings }))
  vi.doMock("@/lib/calendar-data", () => ({ getPublicEventsAsCalendarEvents }))
  vi.doMock("@/lib/compass/calendar", () => ({ getCompassCalendarEventsWithHealth }))
  vi.doMock("@/lib/notion-marketing-calendar", () => ({ getNotionMarketingCalendarEvents }))
  vi.doMock("@/lib/showroom-ics-calendar", () => ({ getShowroomCalendarEvents }))
  vi.doMock("@/lib/team-member-calendars", () => ({ probeTeamCalendarAccess }))
  vi.doMock("@/lib/supabase/admin", () => ({ createSupabaseAdminClient }))
  vi.doMock("next/cache", () => {
    const stores = new Map<string, Map<string, unknown>>()
    return {
      unstable_cache: (
        fn: (...args: unknown[]) => Promise<unknown>,
        keyParts: string[],
        options?: { revalidate?: number; tags?: string[] },
      ) => {
        const cacheKey = keyParts.join("|")
        capturedTags[cacheKey] = options?.tags ?? []
        if (!stores.has(cacheKey)) stores.set(cacheKey, new Map())
        const s = stores.get(cacheKey)!
        return async (...args: unknown[]) => {
          const argsKey = JSON.stringify(args)
          if (s.has(argsKey)) return s.get(argsKey)
          const result = await fn(...args)
          s.set(argsKey, result)
          return result
        }
      },
    }
  })

  const route = await import("@/app/api/admin/calendar/health/route")
  return { route, verifyAdmin, summarizeStoredCalendarEvents, probeTeamCalendarAccess, capturedTags }
}

function req() {
  return new NextRequest("https://classin.kr/api/admin/calendar/health")
}

describe("GET /api/admin/calendar/health — unstable_cache 배선", () => {
  beforeEach(() => {
    vi.resetModules()
  })

  afterEach(() => {
    vi.doUnmock("@/lib/admin-auth")
    vi.doUnmock("@/lib/repositories/admin-calendar-events")
    vi.doUnmock("@/lib/repositories/showroom-bookings")
    vi.doUnmock("@/lib/calendar-data")
    vi.doUnmock("@/lib/compass/calendar")
    vi.doUnmock("@/lib/notion-marketing-calendar")
    vi.doUnmock("@/lib/showroom-ics-calendar")
    vi.doUnmock("@/lib/team-member-calendars")
    vi.doUnmock("@/lib/supabase/admin")
    vi.doUnmock("next/cache")
    vi.resetModules()
  })

  it("120초로 캐시한다", async () => {
    const { route, capturedTags } = await loadHealthRoute()
    const res = await route.GET(req())
    expect(res.status).toBe(200)

    const call = Object.values(capturedTags).find((tags) => tags.length > 0)
    expect(call).toBeDefined()
    const [, options] = Object.entries(capturedTags)[0]
    expect(options).toBeDefined()
  })

  it("두 번째 요청은 팀원 캘린더 접근 프로브를 제외한 소스를 다시 조회하지 않는다", async () => {
    const { route, summarizeStoredCalendarEvents } = await loadHealthRoute()

    await route.GET(req())
    await route.GET(req())

    expect(summarizeStoredCalendarEvents).toHaveBeenCalledTimes(1)
  })

  it("팀원 개인 캘린더 접근 프로브(자격증명 종속 소스)는 캐시 경계 밖에서 매번 새로 조회한다", async () => {
    const { route, probeTeamCalendarAccess } = await loadHealthRoute()

    await route.GET(req())
    await route.GET(req())

    expect(probeTeamCalendarAccess).toHaveBeenCalledTimes(2)
  })

  it("팀원 캘린더 접근 상태는 캐시된 값이 아니라 최신 프로브 결과를 반영한다", async () => {
    const { route, probeTeamCalendarAccess } = await loadHealthRoute()

    await route.GET(req())
    probeTeamCalendarAccess.mockResolvedValueOnce({ configured: 9, accessible: 0 })
    const res = await route.GET(req())
    const body = await res.json()

    const teamEvent = body.sources.find((s: { source: string }) => s.source === "team_event")
    expect(teamEvent.headline).toBe("9명 공유 필요")
  })

  it("응답에 8개 캐시 가능 소스 + team_event 총 9개가 담긴다", async () => {
    const { route } = await loadHealthRoute()
    const res = await route.GET(req())
    const body = await res.json()

    const sources = body.sources.map((s: { source: string }) => s.source).sort()
    expect(sources).toEqual(
      [
        "calendar", "partner", "event", "notion", "showroom",
        "showroom_booking", "team_event", "compass_demo", "holiday",
      ].sort(),
    )
  })

  it("인증 실패면 소스를 조회하지 않고 그대로 응답을 반환한다", async () => {
    const { route, verifyAdmin, summarizeStoredCalendarEvents } = await loadHealthRoute()
    verifyAdmin.mockResolvedValueOnce(NextResponse.json({ error: "unauthorized" }, { status: 401 }))

    const res = await route.GET(req())

    expect(res.status).toBe(401)
    expect(summarizeStoredCalendarEvents).not.toHaveBeenCalled()
  })
})
