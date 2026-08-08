// /events/[slug]/calendar.ics — 회차 행사는 VEVENT를 회차마다 따로 내보내야 한다.
// 봉투(starts_at~ends_at)만 보고 통짜 VEVENT 하나를 내보내면 8/3~8/17 내내 열리는
// 행사로 캘린더에 박혀 실제 일정과 어긋난다.
import { describe, expect, it, vi, afterEach } from "vitest"

const getCachedPublicEventBySlug = vi.fn()

vi.mock("@/lib/repositories/public-events", () => ({
  getCachedPublicEventBySlug,
}))

const BASE_EVENT = {
  id: "ev-1",
  slug: "seminar",
  title: "회차 세미나",
  description: "설명",
  location: "온라인 (Zoom)",
  startsAt: "2026-08-03T05:00:00.000Z", // 8/3 14:00 KST
  endsAt: "2026-08-17T07:00:00.000Z", // 8/17 16:00 KST
  sessionDates: null as string[] | null,
}

async function fetchIcs() {
  const { GET } = await import("@/app/events/[slug]/calendar.ics/route")
  const res = await GET(new Request("https://classin.kr/events/seminar/calendar.ics"), {
    params: Promise.resolve({ slug: "seminar" }),
  })
  return { status: res.status, body: await res.text() }
}

function countVevents(body: string): number {
  return body.split("BEGIN:VEVENT").length - 1
}

function valuesOf(body: string, field: string): string[] {
  return body
    .split("\r\n")
    .filter((line) => line.startsWith(`${field}:`))
    .map((line) => line.slice(field.length + 1))
}

describe("GET /events/[slug]/calendar.ics", () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  it("단일 기간 행사는 지금까지처럼 VEVENT 하나", async () => {
    getCachedPublicEventBySlug.mockResolvedValue({ ...BASE_EVENT })

    const { status, body } = await fetchIcs()

    expect(status).toBe(200)
    expect(countVevents(body)).toBe(1)
    expect(valuesOf(body, "DTSTART")).toEqual(["20260803T050000Z"])
    expect(valuesOf(body, "DTEND")).toEqual(["20260817T070000Z"])
    expect(valuesOf(body, "UID")).toEqual(["classin-event-ev-1@classin.ai.kr"])
    expect(valuesOf(body, "SUMMARY")).toEqual(["회차 세미나"])
  })

  it("회차 행사는 회차마다 VEVENT를 따로 낸다", async () => {
    getCachedPublicEventBySlug.mockResolvedValue({
      ...BASE_EVENT,
      sessionDates: ["2026-08-03", "2026-08-10", "2026-08-17"],
    })

    const { body } = await fetchIcs()

    expect(countVevents(body)).toBe(3)
    // 회차마다 봉투의 KST 시각(14:00~16:00)이 그대로 적용된다
    expect(valuesOf(body, "DTSTART")).toEqual([
      "20260803T050000Z",
      "20260810T050000Z",
      "20260817T050000Z",
    ])
    expect(valuesOf(body, "DTEND")).toEqual([
      "20260803T070000Z",
      "20260810T070000Z",
      "20260817T070000Z",
    ])
  })

  it("회차 UID가 서로 달라야 캘린더 앱이 하나로 덮어쓰지 않는다", async () => {
    getCachedPublicEventBySlug.mockResolvedValue({
      ...BASE_EVENT,
      sessionDates: ["2026-08-03", "2026-08-10"],
    })

    const uids = valuesOf((await fetchIcs()).body, "UID")

    expect(new Set(uids).size).toBe(uids.length)
    expect(uids).toEqual([
      "classin-event-ev-1-2026-08-03@classin.ai.kr",
      "classin-event-ev-1-2026-08-10@classin.ai.kr",
    ])
  })

  it("회차 제목에 몇 번째인지 표시한다", async () => {
    getCachedPublicEventBySlug.mockResolvedValue({
      ...BASE_EVENT,
      sessionDates: ["2026-08-03", "2026-08-10"],
    })

    expect(valuesOf((await fetchIcs()).body, "SUMMARY")).toEqual([
      "회차 세미나 (1/2회차)",
      "회차 세미나 (2/2회차)",
    ])
  })

  it("VCALENDAR 봉투는 하나만 감싼다", async () => {
    getCachedPublicEventBySlug.mockResolvedValue({
      ...BASE_EVENT,
      sessionDates: ["2026-08-03", "2026-08-10", "2026-08-17"],
    })

    const { body } = await fetchIcs()

    expect(body.split("BEGIN:VCALENDAR").length - 1).toBe(1)
    expect(body.split("END:VCALENDAR").length - 1).toBe(1)
    expect(body.split("END:VEVENT").length - 1).toBe(3)
  })

  it("행사가 없으면 404", async () => {
    getCachedPublicEventBySlug.mockResolvedValue(null)
    expect((await fetchIcs()).status).toBe(404)
  })
})
