import { describe, expect, it } from "vitest"

import { KOREA_HOLIDAY_CALENDAR_ID, toHolidayEvent } from "@/lib/korea-holidays"

describe("korea holidays", () => {
  it("points at Google's Korean holiday calendar", () => {
    expect(KOREA_HOLIDAY_CALENDAR_ID).toBe("ko.south_korea#holiday@group.v.calendar.google.com")
  })

  it("maps a Google all-day holiday into a read-only calendar event", () => {
    const event = toHolidayEvent({
      id: "abc",
      summary: "광복절",
      start: { date: "2026-08-15" },
      end: { date: "2026-08-16" },
    })

    expect(event).not.toBeNull()
    expect(event!.type).toBe("holiday")
    expect(event!.title).toBe("광복절")
    expect(event!.date).toBe("2026-08-15")
    expect(event!.source).toBe("holiday")
    expect(event!.allDay).toBe(true)
    expect(event!.readonly).toBe(true)
    expect(event!.createdAt).toBeTruthy()
    expect(event!.updatedAt).toBeTruthy()
  })

  it("returns null for entries without a title or an all-day start", () => {
    expect(toHolidayEvent({ id: "x", start: { date: "2026-08-15" } })).toBeNull()
    expect(toHolidayEvent({ id: "y", summary: "무언가" })).toBeNull()
  })
})
