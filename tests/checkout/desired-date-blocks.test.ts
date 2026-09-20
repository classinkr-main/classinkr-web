import { describe, expect, it } from "vitest"

import { buildWeekendIsoDates } from "@/components/checkout/desired-date-blocks"
import { monthsBetween } from "@/lib/korea-holiday-dates"

/**
 * 희망일 달력이 막는 날짜.
 *
 * 주말은 순수 계산이라 화면이 직접 만들고, 공휴일만 서버가 읽어 내려준다. 두 갈래가
 * 갈린 이유가 코드에서 잘 안 보이므로 각각의 계약을 여기서 고정한다.
 */

describe("buildWeekendIsoDates", () => {
  it("범위 안의 토·일만 담는다", () => {
    // 2026-09-21(월) ~ 2026-09-27(일)
    expect(buildWeekendIsoDates("2026-09-21", "2026-09-27")).toEqual([
      "2026-09-26",
      "2026-09-27",
    ])
  })

  it("경계 날짜가 주말이면 포함한다", () => {
    expect(buildWeekendIsoDates("2026-09-26", "2026-09-26")).toEqual(["2026-09-26"])
  })

  it("경계 날짜가 평일이면 빈 목록이다", () => {
    expect(buildWeekendIsoDates("2026-09-25", "2026-09-25")).toEqual([])
  })

  it("월·연을 넘어가도 요일 계산이 어긋나지 않는다", () => {
    const weekends = buildWeekendIsoDates("2026-12-28", "2027-01-03")
    expect(weekends).toEqual(["2027-01-02", "2027-01-03"])
  })

  it("시작이 끝보다 늦으면 빈 목록이다 — 루프가 돌지 않아야 한다", () => {
    expect(buildWeekendIsoDates("2026-09-27", "2026-09-21")).toEqual([])
  })

  it("빈 입력에도 던지지 않는다", () => {
    expect(buildWeekendIsoDates("", "2026-09-27")).toEqual([])
    expect(buildWeekendIsoDates("2026-09-21", "")).toEqual([])
  })

  it("희망일 최대 범위(+180일)를 상한에 걸리지 않고 훑는다", () => {
    // 2026-09-21 + 180일 = 2027-03-20. 26주 남짓이라 주말이 50개를 넘는다.
    const weekends = buildWeekendIsoDates("2026-09-21", "2027-03-20")
    expect(weekends.length).toBeGreaterThan(50)
    expect(weekends.at(-1)).toBe("2027-03-20")
  })
})

describe("monthsBetween", () => {
  it("같은 달이면 한 개다", () => {
    expect(monthsBetween("2026-09-21", "2026-09-30")).toEqual([{ year: 2026, month: 9 }])
  })

  it("연을 넘어가도 순서대로 이어진다", () => {
    expect(monthsBetween("2026-11-15", "2027-02-03")).toEqual([
      { year: 2026, month: 11 },
      { year: 2026, month: 12 },
      { year: 2027, month: 1 },
      { year: 2027, month: 2 },
    ])
  })

  it("희망일 최대 범위는 7개월 안에 들어온다", () => {
    expect(monthsBetween("2026-09-22", "2027-03-21")).toHaveLength(7)
  })

  it("끝이 시작보다 앞서면 빈 목록이다", () => {
    expect(monthsBetween("2027-01-01", "2026-01-01")).toEqual([])
  })

  it("파싱할 수 없는 값은 빈 목록이다", () => {
    expect(monthsBetween("", "2026-09-30")).toEqual([])
    expect(monthsBetween("not-a-date", "2026-09-30")).toEqual([])
  })
})
