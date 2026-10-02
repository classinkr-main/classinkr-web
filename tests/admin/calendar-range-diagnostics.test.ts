import { describe, expect, it } from "vitest"

import {
  mergeMonthResults,
  type CalendarEvent,
  type CalendarMonthResult,
  type CalendarSourceDiagnostic,
} from "@/lib/calendar-data"

// 기간 조회(getEventsByRangeWithDiagnostics)가 걸치는 달들을 합치는 규칙.
// Compass 미러(/api/compass/calendar)가 degraded 를 보고 기존 미러를 지킬지 정하므로, 한 달이라도
// 확정본이 아니면 기간 전체가 확정본이 아니어야 한다.

function ev(id: string, date: string, endDate?: string): CalendarEvent {
  return { id, title: id, date, endDate, type: "other", source: "showroom", createdAt: "", updatedAt: "" }
}

function diag(partial: Partial<CalendarSourceDiagnostic>): CalendarSourceDiagnostic {
  return { source: "showroom", count: 0, durationMs: 0, degraded: false, ageMs: null, ...partial }
}

describe("mergeMonthResults", () => {
  const jan: CalendarMonthResult = {
    events: [ev("a", "2026-01-31"), ev("span", "2026-01-30", "2026-02-02"), ev("early", "2026-01-02")],
    diagnostics: [
      diag({ count: 3, durationMs: 10, ageMs: 500 }),
      diag({ source: "holiday", count: 0, durationMs: 1 }),
    ],
  }
  const feb: CalendarMonthResult = {
    events: [ev("b", "2026-02-01"), ev("span", "2026-01-30", "2026-02-02")],
    diagnostics: [
      diag({ count: 2, durationMs: 40, degraded: true, ageMs: 900 }),
      diag({ source: "holiday", count: 1, durationMs: 2 }),
    ],
  }

  const out = mergeMonthResults([jan, feb], { from: "2026-01-31", to: "2026-02-01" })

  it("걸치는 일정은 id 로 한 번만, 기간 밖은 뺀다", () => {
    expect(out.events.map((e) => e.id).sort()).toEqual(["a", "b", "span"])
  })

  it("count 는 합 · durationMs 는 최대 · degraded 는 하나라도 참이면 참 · ageMs 는 최대", () => {
    expect(out.diagnostics.find((d) => d.source === "showroom")).toEqual({
      source: "showroom",
      count: 5,
      durationMs: 40,
      degraded: true,
      ageMs: 900,
    })
  })

  it("캐시를 안 두는 소스의 ageMs 는 null 로 남는다", () => {
    expect(out.diagnostics.find((d) => d.source === "holiday")).toEqual({
      source: "holiday",
      count: 1,
      durationMs: 2,
      degraded: false,
      ageMs: null,
    })
  })
})
