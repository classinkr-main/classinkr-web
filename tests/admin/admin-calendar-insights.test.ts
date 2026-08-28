import { describe, expect, it } from "vitest"

import type { CalendarEvent } from "@/lib/calendar-data"
import {
  buildAssigneeLoad,
  buildSourceStats,
  buildWeekStripDays,
} from "@/lib/admin-calendar/insights"

function event(
  id: string,
  overrides: Partial<CalendarEvent> = {}
): CalendarEvent {
  return {
    id,
    title: id,
    date: "2026-08-03",
    type: "team",
    createdAt: "2026-08-01T00:00:00.000Z",
    updatedAt: "2026-08-01T00:00:00.000Z",
    ...overrides,
  }
}

describe("캘린더 인사이트 집계", () => {
  it("소스별 건수를 내림차순과 소스명 순으로 정렬하고 0건 소스를 제외한다", () => {
    const stats = buildSourceStats([
      event("implicit-calendar"),
      event("explicit-calendar", { source: "calendar" }),
      event("holiday-1", { source: "holiday" }),
      event("holiday-2", { source: "holiday" }),
      event("notion", { source: "notion" }),
      event("event", { source: "event" }),
    ])

    expect(stats).toEqual([
      { source: "calendar", count: 2 },
      { source: "holiday", count: 2 },
      { source: "event", count: 1 },
      { source: "notion", count: 1 },
    ])
    expect(stats.some(({ source }) => source === "partner")).toBe(false)
  })

  it("동행 일정은 각 담당자에게 1건씩 더한다", () => {
    expect(
      buildAssigneeLoad([
        event("together", { assignees: ["박한", "김민재"] }),
        event("solo", { assignees: ["박한"] }),
      ])
    ).toEqual([
      { name: "박한", count: 2 },
      { name: "김민재", count: 1 },
    ])
  })

  it("미지정은 건수가 많아도 마지막이며 holiday/event는 부하에서 제외한다", () => {
    const load = buildAssigneeLoad([
      event("owned", { assignees: ["김민재"] }),
      event("unassigned-1", { assignees: [] }),
      event("unassigned-2"),
      event("holiday", { source: "holiday", assignees: ["김민재"] }),
      event("public-event", { source: "event" }),
    ])

    expect(load).toEqual([
      { name: "김민재", count: 1 },
      { name: "미지정", count: 2 },
    ])
  })

  it("멀티데이 일정을 걸치는 모든 날짜에 반복하고 시간 일정 뒤에 종일 일정을 둔다", () => {
    const multiDay = event("multi", {
      date: "2026-08-03",
      endDate: "2026-08-05",
      time: "11:00",
    })
    const days = buildWeekStripDays(
      [
        event("all-day"),
        event("late", { time: "14:00" }),
        multiDay,
        event("early", { time: "09:00" }),
        event("outside", { date: "2026-08-06", time: "08:00" }),
      ],
      { from: "2026-08-03", to: "2026-08-05" }
    )

    expect(days.map(({ date, count }) => ({ date, count }))).toEqual([
      { date: "2026-08-03", count: 4 },
      { date: "2026-08-04", count: 1 },
      { date: "2026-08-05", count: 1 },
    ])
    expect(days[0].events.map(({ id }) => id)).toEqual(["early", "multi", "late", "all-day"])
    expect(days.slice(1).every(({ events }) => events[0] === multiDay)).toBe(true)
  })

  it("빈 입력을 안전하게 집계한다", () => {
    expect(buildSourceStats([])).toEqual([])
    expect(buildAssigneeLoad([])).toEqual([])
    expect(buildWeekStripDays([], { from: "2026-08-03", to: "2026-08-05" })).toEqual([
      { date: "2026-08-03", events: [], count: 0 },
      { date: "2026-08-04", events: [], count: 0 },
      { date: "2026-08-05", events: [], count: 0 },
    ])
  })
})
