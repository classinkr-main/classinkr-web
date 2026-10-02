import { NextRequest } from "next/server"
import { afterEach, describe, expect, it, vi } from "vitest"

// Compass 미러 전용 캘린더 피드(app/api/compass/calendar). 받는 쪽: crm lib/adminCal.ts fetchAdminCalendar.

const RESULT = {
  events: [
    { id: "s1", title: "쇼룸 방문", date: "2026-10-05", type: "meeting", source: "showroom", description: "내부 메모", assignees: ["홍길동"] },
    { id: "d1", title: "MKT 데모", date: "2026-10-06", type: "meeting", source: "compass_demo" },
    { id: "t1", title: "팀원 일정", date: "2026-10-07", type: "team", source: "team_event" },
    { id: "h1", title: "한글날", date: "2026-10-09", type: "holiday", source: "holiday", allDay: true },
    { id: "x1", title: "소스 없음", date: "2026-10-09", type: "other" },
  ],
  diagnostics: [
    { source: "showroom", count: 1, durationMs: 12, degraded: false, ageMs: 1000 },
    { source: "compass_demo", count: 1, durationMs: 3, degraded: false, ageMs: null },
    { source: "team_event", count: 1, durationMs: 50, degraded: false, ageMs: null },
    { source: "holiday", count: 1, durationMs: 1, degraded: true, ageMs: null },
  ],
}

async function loadRoute() {
  vi.resetModules()
  const getEventsByRangeWithDiagnostics = vi.fn().mockResolvedValue(RESULT)
  vi.doMock("@/lib/calendar-data", () => ({ getEventsByRangeWithDiagnostics }))
  const { GET } = await import("@/app/api/compass/calendar/route")
  return { GET, getEventsByRangeWithDiagnostics }
}

function request(query = "?from=2026-10-01&to=2026-10-31", token = "compass-token") {
  return new NextRequest(`https://classin.co.kr/api/compass/calendar${query}`, {
    headers: { authorization: `Bearer ${token}` },
  })
}

describe("Compass 캘린더 피드", () => {
  const prevToken = process.env.COMPASS_CALENDAR_TOKEN
  const prevCron = process.env.CRON_SECRET

  afterEach(() => {
    if (prevToken === undefined) delete process.env.COMPASS_CALENDAR_TOKEN
    else process.env.COMPASS_CALENDAR_TOKEN = prevToken
    if (prevCron === undefined) delete process.env.CRON_SECRET
    else process.env.CRON_SECRET = prevCron
    vi.restoreAllMocks()
    vi.resetModules()
  })

  it("COMPASS_CALENDAR_TOKEN 이 없으면 401 이고 조회하지 않는다", async () => {
    delete process.env.COMPASS_CALENDAR_TOKEN
    const { GET, getEventsByRangeWithDiagnostics } = await loadRoute()
    expect((await GET(request())).status).toBe(401)
    expect(getEventsByRangeWithDiagnostics).not.toHaveBeenCalled()
  })

  it("토큰이 틀리면 401", async () => {
    process.env.COMPASS_CALENDAR_TOKEN = "compass-token"
    const { GET, getEventsByRangeWithDiagnostics } = await loadRoute()
    expect((await GET(request(undefined, "wrong"))).status).toBe(401)
    expect(getEventsByRangeWithDiagnostics).not.toHaveBeenCalled()
  })

  it("CRON_SECRET 으로는 열리지 않는다 — 전용 토큰만 받는다", async () => {
    process.env.COMPASS_CALENDAR_TOKEN = "compass-token"
    process.env.CRON_SECRET = "cron-secret"
    const { GET } = await loadRoute()
    expect((await GET(request(undefined, "cron-secret"))).status).toBe(401)
  })

  it.each([
    ["형식이 틀림", "?from=2026-10-1&to=2026-10-31"],
    ["from 이 to 보다 뒤", "?from=2026-11-01&to=2026-10-01"],
    ["120일 초과", "?from=2026-01-01&to=2026-06-01"],
  ])("기간 이상(%s) → 400", async (_label, query) => {
    process.env.COMPASS_CALENDAR_TOKEN = "compass-token"
    const { GET, getEventsByRangeWithDiagnostics } = await loadRoute()
    expect((await GET(request(query))).status).toBe(400)
    expect(getEventsByRangeWithDiagnostics).not.toHaveBeenCalled()
  })

  it("compass_demo·team_event·소스 없는 일정은 빼고, 필요한 필드만 내린다", async () => {
    process.env.COMPASS_CALENDAR_TOKEN = "compass-token"
    const { GET, getEventsByRangeWithDiagnostics } = await loadRoute()
    const response = await GET(request())
    expect(response.status).toBe(200)
    expect(response.headers.get("cache-control")).toBe("no-store")
    expect(getEventsByRangeWithDiagnostics).toHaveBeenCalledWith("2026-10-01", "2026-10-31")

    const body = await response.json()
    expect(body.events.map((e: { id: string }) => e.id)).toEqual(["s1", "h1"])
    expect(body.events[0]).not.toHaveProperty("description")
    expect(body.events[0].assignees).toEqual(["홍길동"])
    expect(body.diagnostics).toEqual([
      { source: "showroom", count: 1, durationMs: 12, degraded: false, ageMs: 1000 },
      { source: "holiday", count: 1, durationMs: 1, degraded: true, ageMs: null },
    ])
  })
})
