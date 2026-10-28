import { describe, expect, it } from "vitest"

import {
  DDAY_SOON_DAYS,
  PACE_TOLERANCE_PP,
  computeProjectPacing,
  type ProjectPacingInput,
} from "@/lib/marketing/project-pacing"

/*
 * 프로젝트 페이싱 순수함수 계약 — 갤러리형 1b 시안의 샘플 프로젝트(오늘 = 2026-10-21)를 그대로 쓴다.
 * 기간 경과 = (오늘 − 시작)/(종료 − 시작), 소진% − 경과% 가 ±15%p 를 넘으면 빠름/느림,
 * 100% 초과는 "배정 예산 초과"가 우선. 예산·기간이 없으면 판정을 지어내지 않는다.
 */

const TODAY = "2026-10-21"

function pacing(overrides: Partial<ProjectPacingInput>, today = TODAY) {
  return computeProjectPacing(
    { status: "active", startsAt: null, endsAt: null, spentPct: null, ...overrides },
    today,
  )
}

describe("computeProjectPacing — 시안 샘플", () => {
  it("flags spend running ahead of the calendar (+%p)", () => {
    // 2026-10-01 ~ 2027-02-28: 150일 중 20일 경과 → 13%. 소진 41% → +28%p.
    const p = pacing({ startsAt: "2026-10-01", endsAt: "2027-02-28", spentPct: 41 })
    expect(p.elapsedPct).toBe(13)
    expect(p.pace).toEqual({ label: "일정보다 빠른 소진 (+28%p)", tone: "warn" })
    expect(p.dday).toEqual({ label: "D-130", tone: "normal" })
    expect(p.todayInRange).toBe(true)
  })

  it("puts over-budget ahead of the pace comparison", () => {
    const p = pacing({ startsAt: "2026-09-15", endsAt: "2026-11-30", spentPct: 105 })
    expect(p.elapsedPct).toBe(47)
    expect(p.pace).toEqual({ label: "배정 예산 초과", tone: "warn" })
    expect(p.dday.label).toBe("D-40")
  })

  it("flags spend lagging the calendar with a signed %p", () => {
    // 2026-07-01 ~ 2026-12-31: 183일 중 112일 → 61%. 소진 31% → -30%p.
    const p = pacing({ startsAt: "2026-07-01", endsAt: "2026-12-31", spentPct: 31 })
    expect(p.elapsedPct).toBe(61)
    expect(p.pace).toEqual({ label: "일정보다 느린 소진 (-30%p)", tone: "slow" })
  })

  it("makes no pace verdict for an open-ended project", () => {
    const p = pacing({ startsAt: "2026-08-15", endsAt: null, spentPct: 36 })
    expect(p.elapsedPct).toBeNull()
    expect(p.todayInRange).toBe(false)
    expect(p.pace).toEqual({ label: "종료일 미정 · 페이싱 없음", tone: "muted" })
    expect(p.dday).toEqual({ label: "종료일 미정", tone: "muted" })
  })

  it("makes no pace verdict without an allocated budget (거짓 0% 금지)", () => {
    const p = pacing({
      status: "paused",
      startsAt: "2026-09-01",
      endsAt: "2026-12-15",
      spentPct: null,
    })
    expect(p.pace).toEqual({ label: "예산 미배정 · 페이싱 없음", tone: "muted" })
    expect(p.dday.label).toBe("D-55")
  })

  it("counts down to the start of a future project and calls it 시작 전", () => {
    const p = pacing({
      status: "planned",
      startsAt: "2027-01-05",
      endsAt: "2027-03-15",
      spentPct: 0,
    })
    expect(p.elapsedPct).toBe(0)
    expect(p.todayInRange).toBe(false)
    expect(p.pace).toEqual({ label: "시작 전", tone: "muted" })
    expect(p.dday).toEqual({ label: "시작 D-76", tone: "upcoming" })
  })

  it("closes out a done project regardless of its dates", () => {
    const ended = pacing({ status: "done", startsAt: "2026-06-01", endsAt: "2026-08-31", spentPct: 98 })
    expect(ended.elapsedPct).toBe(100)
    expect(ended.pace).toEqual({ label: "완료된 프로젝트", tone: "muted" })
    expect(ended.dday).toEqual({ label: "종료", tone: "muted" })

    // 조기 종료 — 종료일이 남아 있어도 카운트다운하지 않는다.
    const early = pacing({ status: "done", startsAt: "2026-10-01", endsAt: "2026-12-31", spentPct: 40 })
    expect(early.dday).toEqual({ label: "종료", tone: "muted" })
  })
})

describe("computeProjectPacing — 경계", () => {
  it(`treats a gap of exactly ${PACE_TOLERANCE_PP}%p as on schedule`, () => {
    // 2026-10-01 ~ 2026-10-31: 30일 중 20일 → 67%.
    const onTrack = pacing({ startsAt: "2026-10-01", endsAt: "2026-10-31", spentPct: 67 + PACE_TOLERANCE_PP })
    expect(onTrack.pace).toEqual({ label: "일정에 맞는 소진", tone: "ok" })

    const ahead = pacing({ startsAt: "2026-10-01", endsAt: "2026-10-31", spentPct: 67 + PACE_TOLERANCE_PP + 1 })
    expect(ahead.pace.tone).toBe("warn")
  })

  it(`raises the D-day tone within ${DDAY_SOON_DAYS} days and says D-Day on the last day`, () => {
    expect(pacing({ startsAt: "2026-10-01", endsAt: "2026-11-04" }).dday).toEqual({
      label: "D-14",
      tone: "soon",
    })
    expect(pacing({ startsAt: "2026-10-01", endsAt: "2026-11-05" }).dday.tone).toBe("normal")
    expect(pacing({ startsAt: "2026-10-01", endsAt: TODAY }).dday).toEqual({
      label: "D-Day",
      tone: "soon",
    })
  })

  it("marks a project whose end date has passed as 종료 and clamps elapsed to 100%", () => {
    const p = pacing({ startsAt: "2026-09-01", endsAt: "2026-10-20", spentPct: 90 })
    expect(p.elapsedPct).toBe(100)
    expect(p.todayInRange).toBe(false)
    expect(p.dday).toEqual({ label: "종료", tone: "muted" })
  })

  it("handles a one-day project without dividing by zero", () => {
    const p = pacing({ startsAt: TODAY, endsAt: TODAY, spentPct: 100 })
    expect(p.elapsedPct).toBe(100)
    expect(p.todayInRange).toBe(true)
    expect(p.pace).toEqual({ label: "일정에 맞는 소진", tone: "ok" })
  })

  it("names the missing side of an incomplete period", () => {
    expect(pacing({ endsAt: "2026-12-31", spentPct: 20 }).pace.label).toBe("시작일 미정 · 페이싱 없음")
    expect(pacing({ spentPct: 20 }).pace.label).toBe("기간 미정 · 페이싱 없음")
  })

  it("accepts ISO timestamps by their date part", () => {
    const p = pacing({ startsAt: "2026-10-01T00:00:00.000Z", endsAt: "2027-02-28T00:00:00.000Z", spentPct: 41 })
    expect(p.elapsedPct).toBe(13)
  })

  it("returns a neutral result instead of guessing when today is not a date", () => {
    const p = pacing({ startsAt: "2026-10-01", endsAt: "2026-10-31", spentPct: 50 }, "")
    expect(p.elapsedPct).toBeNull()
    expect(p.todayInRange).toBe(false)
    expect(p.dday).toEqual({ label: "—", tone: "muted" })
    expect(p.pace).toEqual({ label: "—", tone: "muted" })
  })
})
