import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const bridge = vi.hoisted(() => ({ getCompassCalEvents: vi.fn() }))
const showroom = vi.hoisted(() => ({ getShowroomCalendarEvents: vi.fn() }))
const store = vi.hoisted(() => ({
  listStoredCalendarEvents: vi.fn(async () => []),
  getStoredCalendarEvent: vi.fn(),
  insertStoredCalendarEvent: vi.fn(),
  updateStoredCalendarEvent: vi.fn(),
  deleteStoredCalendarEvent: vi.fn(),
  summarizeStoredCalendarEvents: vi.fn(),
}))

vi.mock("@/lib/compass/bridge", () => bridge)
vi.mock("@/lib/showroom-ics-calendar", () => showroom)
vi.mock("@/lib/repositories/admin-calendar-events", () => store)
vi.mock("@/lib/notion-marketing-calendar", () => ({ getNotionMarketingCalendarEvents: vi.fn(async () => []) }))
vi.mock("@/lib/team-member-calendars", () => ({ getTeamEventsCalendarEvents: vi.fn(async () => []) }))
vi.mock("@/lib/korea-holidays", () => ({ getKoreaHolidayEvents: vi.fn(async () => []) }))
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

import { SOURCE_OPTIONS, getSourceColor } from "@/components/admin/calendar/event-style"
import type { CalendarEvent } from "@/lib/calendar-data"
import { getEventsByMonth } from "@/lib/calendar-data"
import { mapCompassCalEvent } from "@/lib/compass/calendar"

type CompassRow = Parameters<typeof mapCompassCalEvent>[0]

function calRow(overrides: Partial<CompassRow> = {}): CompassRow {
  return {
    key: "abc123-2026-08-19T16:00:00+09:00",
    day: "2026-08-19",
    time: "16:00",
    title: "(화성 동탄)에듀포에버영어-김보원",
    owners: ["진소망"],
    lead_id: 252,
    link: "https://www.google.com/calendar/event?eid=zzz",
    synced_at: "2026-08-27T08:46:17.694893+00:00",
    ...overrides,
  }
}

function showroomEvent(overrides: Partial<CalendarEvent> & { id: string; date: string }): CalendarEvent {
  return {
    title: "쇼룸 방문",
    type: "meeting",
    source: "showroom",
    sourceLabel: "쇼룸 예약",
    readonly: true,
    createdAt: "2026-08-01T00:00:00.000Z",
    updatedAt: "2026-08-01T00:00:00.000Z",
    ...overrides,
  }
}

const SUPABASE_ENV = {
  NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "publishable-test",
  SUPABASE_SECRET_KEY: "secret-test",
}
const savedEnv: Record<string, string | undefined> = {}

beforeEach(() => {
  for (const [key, value] of Object.entries(SUPABASE_ENV)) {
    savedEnv[key] = process.env[key]
    process.env[key] = value
  }
  bridge.getCompassCalEvents.mockReset()
  showroom.getShowroomCalendarEvents.mockReset()
  showroom.getShowroomCalendarEvents.mockResolvedValue([])
})

afterEach(() => {
  for (const key of Object.keys(SUPABASE_ENV)) {
    if (savedEnv[key] === undefined) delete process.env[key]
    else process.env[key] = savedEnv[key]
  }
})

describe("mapCompassCalEvent", () => {
  it("읽기 전용 compass_demo 이벤트로 눕히고 리드가 있으면 Compass 딥링크를 건다", () => {
    expect(mapCompassCalEvent(calRow())).toMatchObject({
      title: "(화성 동탄)에듀포에버영어-김보원",
      date: "2026-08-19",
      time: "16:00",
      type: "meeting",
      source: "compass_demo",
      sourceLabel: "MKT 데모일정",
      readonly: true,
      allDay: false,
      href: "https://mkt.classin.co.kr/leads?open=252",
      assignees: ["진소망"],
      description: "Compass 리드 #252",
    })
  })

  it("리드가 없으면 구글 캘린더 원본 링크로 떨어진다", () => {
    const event = mapCompassCalEvent(calRow({ lead_id: null }))
    expect(event?.href).toBe("https://www.google.com/calendar/event?eid=zzz")
    expect(event?.description).toBeUndefined()
  })

  it("시각이 없으면 종일, 날짜가 없으면 캘린더에 찍을 자리가 없어 버린다", () => {
    expect(mapCompassCalEvent(calRow({ time: null }))?.allDay).toBe(true)
    expect(mapCompassCalEvent(calRow({ day: null }))).toBeNull()
  })
})

describe("캘린더 색축·범례", () => {
  it("compass_demo 가 SOURCE_OPTIONS 에 등록돼 소스 토글·범례에 자연히 나온다", () => {
    const option = SOURCE_OPTIONS.find((item) => item.value === "compass_demo")
    expect(option).toBeDefined()
    expect(option?.label).toBe("MKT 데모일정")
    expect(getSourceColor("compass_demo")).toBe(option?.dot)
  })

  it("소스 고정색은 서로 겹치지 않는다 — 점만 찍히는 뷰에서 구분되어야 한다", () => {
    const colors = SOURCE_OPTIONS.map((item) => item.dot)
    expect(new Set(colors).size).toBe(colors.length)
  })
})

// lib/compass/calendar.ts 는 월 키로 5분 캐시를 잡는다 — 테스트마다 다른 달을 써서
// 앞선 케이스의 캐시가 다음 케이스를 가리지 않게 한다.
describe("getEventsByMonth — 8번째 소스 병합", () => {
  it("compass_demo 이벤트가 다른 소스와 함께 합쳐진다", async () => {
    bridge.getCompassCalEvents.mockResolvedValue({ rows: [calRow()], down: false })

    const events = await getEventsByMonth(2026, 8)
    const compass = events.filter((event) => event.source === "compass_demo")

    expect(compass).toHaveLength(1)
    expect(compass[0].date).toBe("2026-08-19")
  })

  it("쇼룸 예약과 제목·일시가 겹쳐도 둘 다 남는다 — 근거 없는 dedup 금지, 소스 라벨로 구분", async () => {
    bridge.getCompassCalEvents.mockResolvedValue({
      rows: [calRow({ key: "dup-key", day: "2026-09-03", title: "(화성 동탄)에듀포에버영어-김보원" })],
      down: false,
    })
    showroom.getShowroomCalendarEvents.mockResolvedValue([
      showroomEvent({
        id: "showroom_dup",
        date: "2026-09-03",
        time: "16:00",
        title: "(화성 동탄)에듀포에버영어-김보원",
      }),
    ])

    const events = await getEventsByMonth(2026, 9)
    const sameSlot = events.filter((event) => event.date === "2026-09-03" && event.time === "16:00")

    expect(sameSlot).toHaveLength(2)
    expect(sameSlot.map((event) => event.source).sort()).toEqual(["compass_demo", "showroom"])
    expect(sameSlot.map((event) => event.sourceLabel).sort()).toEqual(["MKT 데모일정", "쇼룸 예약"])
  })

  it("브리지가 끊기면 이 소스만 비고 다른 소스는 그대로 뜬다", async () => {
    bridge.getCompassCalEvents.mockResolvedValue({ rows: [], down: true, error: "view missing" })
    showroom.getShowroomCalendarEvents.mockResolvedValue([
      showroomEvent({ id: "showroom_alive", date: "2026-10-03" }),
    ])

    const events = await getEventsByMonth(2026, 10)

    expect(events.some((event) => event.source === "compass_demo")).toBe(false)
    expect(events.some((event) => event.id === "showroom_alive")).toBe(true)
  })
})
