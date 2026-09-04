// lib/calendar-data.ts — 월/범위/전체 이벤트 조립 Data Cache 배선 회귀 가드 (2026-09-04).
//
// 배경: getEventsByMonthWithDiagnostics(및 getEventsByMonth/getEventsByRange/getAllEvents가
// 공유하는 그 핵심)는 8개 소스(admin_calendar_events·partner_schedule_items·public_events
// + 노션·쇼룸·쇼룸예약·공휴일·Compass)를 매 호출 다시 훑었다 — 캐시가 전혀 없었다.
// 팀원 개인 Google 캘린더(getTeamEventsCalendarEvents)만 자격증명에 종속된 소스라
// (lib/admin-calendar/source-cache.ts의 "자격증명에 종속된 소스" 규약과 동일 이유) 캐시
// 경계 밖에 남기고, 나머지 8개 소스만 unstable_cache로 묶는다.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const store = vi.hoisted(() => ({
  listStoredCalendarEvents: vi.fn(async () => []),
  getStoredCalendarEvent: vi.fn(),
  insertStoredCalendarEvent: vi.fn(),
  updateStoredCalendarEvent: vi.fn(),
  deleteStoredCalendarEvent: vi.fn(),
}))
const bridge = vi.hoisted(() => ({ getCompassCalEvents: vi.fn(async () => ({ rows: [], down: false })) }))
const showroom = vi.hoisted(() => ({ getShowroomCalendarEvents: vi.fn(async () => []) }))
const notion = vi.hoisted(() => ({ getNotionMarketingCalendarEvents: vi.fn(async () => []) }))
const teamCalendars = vi.hoisted(() => ({ getTeamEventsCalendarEvents: vi.fn(async () => []) }))
const holidays = vi.hoisted(() => ({ getKoreaHolidayEvents: vi.fn(async () => []) }))

vi.mock("@/lib/compass/bridge", () => bridge)
vi.mock("@/lib/showroom-ics-calendar", () => showroom)
vi.mock("@/lib/repositories/admin-calendar-events", () => store)
vi.mock("@/lib/notion-marketing-calendar", () => notion)
vi.mock("@/lib/team-member-calendars", () => teamCalendars)
vi.mock("@/lib/korea-holidays", () => holidays)
vi.mock("@/lib/partners-data", () => ({ listPartnerWorkspacesData: vi.fn(async () => ({ workspaces: [] })) }))
vi.mock("@/lib/google-calendar-sync", () => ({
  deleteGoogleCalendarEvent: vi.fn(),
  isGoogleCalendarSyncConfigured: vi.fn(() => false),
  upsertGoogleCalendarEvent: vi.fn(),
}))
vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: vi.fn(() => {
    throw new Error("no supabase in tests")
  }),
}))

const SUPABASE_ENV = {
  NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "publishable-test",
  SUPABASE_SECRET_KEY: "secret-test",
}
const savedEnv: Record<string, string | undefined> = {}

const capturedTags: Record<string, string[]> = {}
// stores는 모듈 스코프(팩토리는 파일당 1회만 실행)라 테스트마다 비워야 한다 — 안 비우면
// 앞선 테스트가 채운 (year,month) 엔트리가 다음 테스트의 "재조회 안 함" 결과를 오염시킨다.
let stores = new Map<string, Map<string, unknown>>()
vi.mock("next/cache", () => {
  return {
    unstable_cache: (
      fn: (...args: unknown[]) => Promise<unknown>,
      keyParts: string[],
      options?: { revalidate?: number; tags?: string[] },
    ) => {
      const cacheKey = keyParts.join("|")
      capturedTags[cacheKey] = options?.tags ?? []
      return async (...args: unknown[]) => {
        if (!stores.has(cacheKey)) stores.set(cacheKey, new Map())
        const s = stores.get(cacheKey)!
        const argsKey = JSON.stringify(args)
        if (s.has(argsKey)) return s.get(argsKey)
        const result = await fn(...args)
        s.set(argsKey, result)
        return result
      }
    },
    revalidateTag: vi.fn(),
  }
})

beforeEach(() => {
  for (const [key, value] of Object.entries(SUPABASE_ENV)) {
    savedEnv[key] = process.env[key]
    process.env[key] = value
  }
  vi.clearAllMocks()
  stores = new Map()
  // capturedTags는 지우지 않는다 — unstable_cache(...) 호출 자체는 모듈이 처음 로드될 때
  // 딱 한 번만 실행되므로(이후 재-import는 캐시된 모듈을 재사용), 여기서 지우면 첫 테스트
  // 이후에는 그 기록이 영영 사라진다.
})

afterEach(() => {
  for (const key of Object.keys(SUPABASE_ENV)) {
    if (savedEnv[key] === undefined) delete process.env[key]
    else process.env[key] = savedEnv[key]
  }
})

describe("getEventsByMonth — unstable_cache 배선", () => {
  it("ADMIN_CALENDAR_EVENTS_CACHE_TAG로 60초 캐시한다", async () => {
    const { getEventsByMonth, ADMIN_CALENDAR_EVENTS_CACHE_TAG } = await import("@/lib/calendar-data")
    await getEventsByMonth(2026, 8)

    const call = Object.entries(capturedTags).find(([, tags]) => tags.includes(ADMIN_CALENDAR_EVENTS_CACHE_TAG))
    expect(call).toBeDefined()
  })

  it("팀원 개인 캘린더(자격증명 종속 소스)는 캐시 경계 밖에서 매 호출 새로 조회한다", async () => {
    const { getEventsByMonth } = await import("@/lib/calendar-data")

    await getEventsByMonth(2026, 8)
    await getEventsByMonth(2026, 8)

    // 캐시 가능한 8소스는 같은 (year, month)면 두 번째 호출에서 재조회하지 않지만,
    // team_event만은 그렇지 않다 — 항상 최신 접근 상태를 반영해야 한다.
    expect(teamCalendars.getTeamEventsCalendarEvents).toHaveBeenCalledTimes(2)
  })

  it("같은 (year, month)로 두 번 부르면 캐시 가능한 소스는 재조회하지 않는다", async () => {
    const { getEventsByMonth } = await import("@/lib/calendar-data")

    await getEventsByMonth(2026, 8)
    await getEventsByMonth(2026, 8)

    expect(notion.getNotionMarketingCalendarEvents).toHaveBeenCalledTimes(1)
    expect(showroom.getShowroomCalendarEvents).toHaveBeenCalledTimes(1)
    expect(holidays.getKoreaHolidayEvents).toHaveBeenCalledTimes(1)
    expect(store.listStoredCalendarEvents).toHaveBeenCalledTimes(1)
  })

  it("month가 다르면 별도 엔트리로 재조회한다", async () => {
    const { getEventsByMonth } = await import("@/lib/calendar-data")

    await getEventsByMonth(2026, 8)
    await getEventsByMonth(2026, 9)

    expect(notion.getNotionMarketingCalendarEvents).toHaveBeenCalledTimes(2)
  })

  it("diagnostics는 캐시 도입 전과 동일하게 9개 소스를 모두 담는다", async () => {
    const { getEventsByMonthWithDiagnostics } = await import("@/lib/calendar-data")
    const result = await getEventsByMonthWithDiagnostics(2026, 8)

    const sources = result.diagnostics.map((d) => d.source).sort()
    expect(sources).toEqual(
      [
        "calendar", "partner", "event", "notion", "showroom",
        "showroom_booking", "team_event", "holiday", "compass_demo",
      ].sort(),
    )
  })
})

describe("getEventsByRange — 캐시된 월별 조립을 재사용한다", () => {
  it("같은 달을 걸치는 두 range 조회는 그 달의 캐시 가능 소스를 한 번만 조회한다", async () => {
    const { getEventsByRange } = await import("@/lib/calendar-data")

    await getEventsByRange("2026-08-01", "2026-08-15")
    await getEventsByRange("2026-08-10", "2026-08-20")

    expect(notion.getNotionMarketingCalendarEvents).toHaveBeenCalledTimes(1)
  })
})

describe("getAllEvents — unstable_cache 배선", () => {
  it("ADMIN_CALENDAR_EVENTS_CACHE_TAG로 캐시하고 team_event는 매번 새로 조회한다", async () => {
    const { getAllEvents, ADMIN_CALENDAR_EVENTS_CACHE_TAG } = await import("@/lib/calendar-data")

    await getAllEvents()
    await getAllEvents()

    expect(notion.getNotionMarketingCalendarEvents).toHaveBeenCalledTimes(1)
    expect(teamCalendars.getTeamEventsCalendarEvents).toHaveBeenCalledTimes(2)
    const call = Object.entries(capturedTags).find(([, tags]) => tags.includes(ADMIN_CALENDAR_EVENTS_CACHE_TAG))
    expect(call).toBeDefined()
  })
})
