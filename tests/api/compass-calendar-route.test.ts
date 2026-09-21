import { NextRequest } from "next/server"
import { afterEach, describe, expect, it, vi } from "vitest"

/**
 * Compass 전용 캘린더 피드. 어드민 세션이 아니라 전용 Bearer 토큰으로 연다.
 *
 * 지키는 것: ①토큰이 정확히 맞을 때만 연다 ②기간을 검증한다 ③compass_demo 를 안 내보낸다
 * (그 소스의 원본이 Compass 자신이라 되돌려주면 같은 일정이 두 줄이 된다) ④소스별 진단을
 * 같이 준다(Compass 의 보존 규칙이 degraded 를 본다).
 */

const TOKEN = "compass-feed-token"

const EVENTS = [
  { id: "1", title: "쇼룸 투어", date: "2026-09-21", source: "showroom", sourceLabel: "쇼룸" },
  { id: "2", title: "추석", date: "2026-09-25", source: "holiday", sourceLabel: "공휴일" },
  { id: "3", title: "메카수학원", date: "2026-09-22", source: "compass_demo", sourceLabel: "MKT 데모일정" },
]
const DIAGS = [
  { source: "showroom", count: 1, durationMs: 12, degraded: false, ageMs: 0 },
  { source: "holiday", count: 1, durationMs: 5, degraded: true, ageMs: 900 },
  { source: "compass_demo", count: 1, durationMs: 3, degraded: false, ageMs: 0 },
]

async function loadRoute() {
  vi.resetModules()
  const getEventsByRangeWithDiagnostics = vi
    .fn()
    .mockResolvedValue({ events: EVENTS, diagnostics: DIAGS })
  vi.doMock("@/lib/calendar-data", () => ({ getEventsByRangeWithDiagnostics }))
  const { GET } = await import("@/app/api/compass/calendar/route")
  return { GET, getEventsByRangeWithDiagnostics }
}

function request(query = "?from=2026-09-01&to=2026-09-30", auth: string | null = `Bearer ${TOKEN}`) {
  return new NextRequest(`https://www.classin.co.kr/api/compass/calendar${query}`, {
    headers: auth ? { authorization: auth } : {},
  })
}

describe("Compass 캘린더 피드 — 인증", () => {
  const saved = process.env.COMPASS_CALENDAR_TOKEN

  afterEach(() => {
    if (saved === undefined) delete process.env.COMPASS_CALENDAR_TOKEN
    else process.env.COMPASS_CALENDAR_TOKEN = saved
    vi.restoreAllMocks()
    vi.resetModules()
  })

  it("토큰이 설정돼 있지 않으면 401 — 조회를 돌리지 않는다(fail-closed)", async () => {
    delete process.env.COMPASS_CALENDAR_TOKEN
    const { GET, getEventsByRangeWithDiagnostics } = await loadRoute()
    const res = await GET(request())
    expect(res.status).toBe(401)
    expect(getEventsByRangeWithDiagnostics).not.toHaveBeenCalled()
  })

  it("헤더가 없으면 401", async () => {
    process.env.COMPASS_CALENDAR_TOKEN = TOKEN
    const { GET } = await loadRoute()
    expect((await GET(request("?from=2026-09-01&to=2026-09-30", null))).status).toBe(401)
  })

  it("값·접두·길이가 하나라도 다르면 401", async () => {
    process.env.COMPASS_CALENDAR_TOKEN = TOKEN
    const { GET } = await loadRoute()
    for (const bad of [`Bearer ${TOKEN}x`, `Bearer ${TOKEN.slice(0, -1)}X`, `bearer ${TOKEN}`, TOKEN]) {
      expect((await GET(request("?from=2026-09-01&to=2026-09-30", bad))).status).toBe(401)
    }
  })

  it("CRON_SECRET 으로는 열리지 않는다 — 크론 전체를 여는 열쇠와 분리돼 있어야 한다", async () => {
    process.env.COMPASS_CALENDAR_TOKEN = TOKEN
    process.env.CRON_SECRET = "cron-secret"
    const { GET } = await loadRoute()
    expect((await GET(request("?from=2026-09-01&to=2026-09-30", "Bearer cron-secret"))).status).toBe(401)
    delete process.env.CRON_SECRET
  })
})

describe("Compass 캘린더 피드 — 기간", () => {
  const saved = process.env.COMPASS_CALENDAR_TOKEN

  afterEach(() => {
    if (saved === undefined) delete process.env.COMPASS_CALENDAR_TOKEN
    else process.env.COMPASS_CALENDAR_TOKEN = saved
    vi.resetModules()
  })

  it("from/to 가 없거나 모양이 틀리면 400", async () => {
    process.env.COMPASS_CALENDAR_TOKEN = TOKEN
    const { GET } = await loadRoute()
    expect((await GET(request("?from=2026-09-01"))).status).toBe(400)
    expect((await GET(request("?from=2026-9-1&to=2026-09-30"))).status).toBe(400)
  })

  it("from 이 to 보다 뒤면 400", async () => {
    process.env.COMPASS_CALENDAR_TOKEN = TOKEN
    const { GET } = await loadRoute()
    expect((await GET(request("?from=2026-09-30&to=2026-09-01"))).status).toBe(400)
  })

  it("120일을 넘으면 400 — 어드민 어댑터가 달 단위라 창이 넓을수록 콜드 비용이 커진다", async () => {
    process.env.COMPASS_CALENDAR_TOKEN = TOKEN
    const { GET } = await loadRoute()
    expect((await GET(request("?from=2026-01-01&to=2026-12-31"))).status).toBe(400)
    expect((await GET(request("?from=2026-09-01&to=2026-12-29"))).status).toBe(200)
  })
})

describe("Compass 캘린더 피드 — 응답", () => {
  const saved = process.env.COMPASS_CALENDAR_TOKEN

  afterEach(() => {
    if (saved === undefined) delete process.env.COMPASS_CALENDAR_TOKEN
    else process.env.COMPASS_CALENDAR_TOKEN = saved
    vi.resetModules()
  })

  it("compass_demo 를 내보내지 않는다 — Compass 가 원본이라 되받으면 두 줄이 된다", async () => {
    process.env.COMPASS_CALENDAR_TOKEN = TOKEN
    const { GET } = await loadRoute()
    const body = await (await GET(request())).json()
    expect(body.events.map((e: { id: string }) => e.id)).toEqual(["1", "2"])
    expect(body.diagnostics.map((d: { source: string }) => d.source)).toEqual(["showroom", "holiday"])
  })

  it("allowlist 다 — 어드민에 새 소스가 생겨도 조용히 흘러들지 않는다", async () => {
    process.env.COMPASS_CALENDAR_TOKEN = TOKEN
    vi.resetModules()
    vi.doMock("@/lib/calendar-data", () => ({
      getEventsByRangeWithDiagnostics: vi.fn().mockResolvedValue({
        events: [{ id: "9", title: "새 소스", date: "2026-09-21", source: "brand_new" }],
        diagnostics: [{ source: "brand_new", count: 1, durationMs: 1, degraded: false, ageMs: 0 }],
      }),
    }))
    const { GET } = await import("@/app/api/compass/calendar/route")
    const body = await (await GET(request())).json()
    expect(body.events).toEqual([])
    expect(body.diagnostics).toEqual([])
  })

  it("degraded 를 그대로 실어 보낸다 — Compass 의 보존 규칙이 이걸 본다", async () => {
    process.env.COMPASS_CALENDAR_TOKEN = TOKEN
    const { GET } = await loadRoute()
    const body = await (await GET(request())).json()
    expect(body.diagnostics.find((d: { source: string }) => d.source === "holiday").degraded).toBe(true)
  })

  it("캐시하지 않는다 — 미러는 브라우저가 아니다", async () => {
    process.env.COMPASS_CALENDAR_TOKEN = TOKEN
    const { GET } = await loadRoute()
    expect((await GET(request())).headers.get("cache-control")).toBe("no-store")
  })

  it("조회가 실패하면 500 을 내고 빈 배열로 눕히지 않는다 — Compass 가 '0건'으로 오해하면 미러를 지운다", async () => {
    process.env.COMPASS_CALENDAR_TOKEN = TOKEN
    vi.resetModules()
    vi.doMock("@/lib/calendar-data", () => ({
      getEventsByRangeWithDiagnostics: vi.fn().mockRejectedValue(new Error("supabase down")),
    }))
    const { GET } = await import("@/app/api/compass/calendar/route")
    const res = await GET(request())
    expect(res.status).toBe(500)
    expect(await res.json()).toEqual({ error: "supabase down" })
  })
})
