import { describe, expect, it } from "vitest"

import {
  computeProjectPacing,
  formatDotDate,
  parseLocalDate,
} from "@/lib/marketing/project-pacing"

// 기준일은 고정 주입 — 실제 오늘에 따라 결과가 바뀌면 안 된다.
const TODAY = new Date(2026, 9, 21) // 2026-10-21 로컬 자정

function pace(
  project: { status?: "planned" | "active" | "paused" | "done"; startsAt: string | null; endsAt: string | null },
  spentPct: number | null,
) {
  return computeProjectPacing({ status: "active", ...project }, { spentPct }, TODAY)
}

describe("parseLocalDate / formatDotDate", () => {
  it("parses YYYY-MM-DD as local midnight (KST 오전에 하루 밀리지 않는다)", () => {
    const d = parseLocalDate("2026-10-21")!
    expect(d.getFullYear()).toBe(2026)
    expect(d.getMonth()).toBe(9)
    expect(d.getDate()).toBe(21)
    expect(d.getHours()).toBe(0)
    expect(formatDotDate(d)).toBe("2026.10.21")
  })

  it("returns null for empty or malformed values", () => {
    expect(parseLocalDate(null)).toBeNull()
    expect(parseLocalDate("not-a-date")).toBeNull()
  })
})

describe("computeProjectPacing", () => {
  it("computes elapsed% between start and end, clamped to 0~100", () => {
    expect(pace({ startsAt: "2026-10-01", endsAt: "2026-10-31" }, 50).elapsedPct).toBe(67)
    expect(pace({ startsAt: "2026-06-01", endsAt: "2026-08-31" }, 50).elapsedPct).toBe(100)
    expect(pace({ startsAt: "2027-01-05", endsAt: "2027-03-15" }, 0).elapsedPct).toBe(0)
  })

  it("leaves elapsed null when either date is missing (거짓 0% 금지)", () => {
    const p = pace({ startsAt: "2026-08-15", endsAt: null }, 36)
    expect(p.elapsedPct).toBeNull()
    expect(p.ddayLabel).toBe("종료일 미정")
    expect(p.paceLabel).toBe("종료일 미정 · 페이싱 없음")
    expect(p.paceTone).toBe("muted")
  })

  it("judges on-track spend within ±15%p", () => {
    const p = pace({ startsAt: "2026-10-01", endsAt: "2026-10-31" }, 60)
    expect(p.paceLabel).toBe("일정에 맞는 소진")
    expect(p.paceTone).toBe("good")
  })

  it("flags fast spend over the tolerance with the gap in %p", () => {
    const p = pace({ startsAt: "2026-10-01", endsAt: "2026-10-31" }, 90)
    expect(p.paceLabel).toBe("일정보다 빠른 소진 (+23%p)")
    expect(p.paceTone).toBe("warn")
  })

  it("marks slow spend neutrally, not as a warning", () => {
    const p = pace({ startsAt: "2026-07-01", endsAt: "2026-12-31" }, 31)
    expect(p.paceLabel).toBe("일정보다 느린 소진 (-30%p)")
    expect(p.paceTone).toBe("neutral")
  })

  it("prioritises over-budget over the elapsed comparison", () => {
    const p = pace({ startsAt: "2026-09-15", endsAt: "2026-11-30" }, 105)
    expect(p.paceLabel).toBe("배정 예산 초과")
    expect(p.paceTone).toBe("warn")
  })

  it("gives no verdict without an allocated budget", () => {
    const p = pace({ startsAt: "2026-09-01", endsAt: "2026-12-15" }, null)
    expect(p.paceLabel).toBe("예산 미배정 · 페이싱 없음")
    expect(p.paceTone).toBe("muted")
  })

  it("shows the days until start for planned projects", () => {
    const p = pace({ status: "planned", startsAt: "2027-01-05", endsAt: "2027-03-15" }, 0)
    expect(p.ddayLabel).toBe("시작 D-76")
    expect(p.paceLabel).toBe("시작 전")
    expect(p.inProgress).toBe(false)
  })

  it("warns on D-day within two weeks and marks in-progress", () => {
    const soon = pace({ startsAt: "2026-10-01", endsAt: "2026-10-31" }, 60)
    expect(soon.ddayLabel).toBe("D-10")
    expect(soon.ddayTone).toBe("warn")
    expect(soon.inProgress).toBe(true)
    const far = pace({ startsAt: "2026-10-01", endsAt: "2027-02-28" }, 40)
    expect(far.ddayLabel).toBe("D-130")
    expect(far.ddayTone).toBe("strong")
  })

  it("labels finished projects as done regardless of spend", () => {
    const p = pace({ status: "done", startsAt: "2026-06-01", endsAt: "2026-08-31" }, 98)
    expect(p.ddayLabel).toBe("종료")
    expect(p.paceLabel).toBe("완료된 프로젝트")
  })
})
