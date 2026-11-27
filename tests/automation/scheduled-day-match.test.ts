// 예약 규칙의 "오늘 도는 날인가" 판정(2026-11-27 크론 정리 정-1).
// 예전에는 "매일 09시"와 글자가 다른 식은 무조건 실행해 "매주 월요일"·"매월 1일" 규칙이 매일 발송됐다.
import { describe, expect, it } from "vitest"

import { matchScheduledDay, scheduledCronProblem } from "@/lib/automation-schedule"
import { PRESET_CRON_OPTIONS } from "@/lib/automation-types"

const at = (iso: string) => new Date(iso)
const MON = at("2026-11-30T09:00:00Z")
const TUE = at("2026-12-01T09:00:00Z") // 1일
const FRI = at("2026-12-04T09:00:00Z")
const SUN = at("2026-12-06T09:00:00Z")

describe("matchScheduledDay", () => {
  it("매일 식은 어느 날이든 due", () => {
    for (const day of [MON, TUE, FRI, SUN]) expect(matchScheduledDay("0 9 * * *", day)).toBe("due")
  })

  it("매주 월요일 식은 월요일에만 due", () => {
    expect(matchScheduledDay("0 9 * * 1", MON)).toBe("due")
    expect(matchScheduledDay("0 9 * * 1", TUE)).toBe("not_due")
    expect(matchScheduledDay("0 9 * * 1", SUN)).toBe("not_due")
  })

  it("시·분 칸은 보지 않는다 — 금요일 10시 식도 금요일의 하루 한 번 실행에서 돈다", () => {
    expect(matchScheduledDay("0 10 * * 5", FRI)).toBe("due")
    expect(matchScheduledDay("0 10 * * 5", MON)).toBe("not_due")
  })

  it("매월 1일 식은 1일에만 due", () => {
    expect(matchScheduledDay("0 9 1 * *", TUE)).toBe("due")
    expect(matchScheduledDay("0 9 1 * *", MON)).toBe("not_due")
  })

  it("요일 0 과 7 은 둘 다 일요일, 목록·구간도 읽는다", () => {
    expect(matchScheduledDay("0 9 * * 0", SUN)).toBe("due")
    expect(matchScheduledDay("0 9 * * 7", SUN)).toBe("due")
    expect(matchScheduledDay("0 9 * * 1-5", FRI)).toBe("due")
    expect(matchScheduledDay("0 9 * * 1-5", SUN)).toBe("not_due")
    expect(matchScheduledDay("0 9 1,15 * *", TUE)).toBe("due")
  })

  it("일과 요일을 둘 다 좁히면 한쪽만 맞아도 due(표준 cron)", () => {
    expect(matchScheduledDay("0 9 1 * 5", TUE)).toBe("due")
    expect(matchScheduledDay("0 9 1 * 5", FRI)).toBe("due")
    expect(matchScheduledDay("0 9 1 * 5", MON)).toBe("not_due")
  })

  it("월 칸이 맞지 않으면 not_due", () => {
    expect(matchScheduledDay("0 9 1 1 *", TUE)).toBe("not_due")
    expect(matchScheduledDay("0 9 1 12 *", TUE)).toBe("due")
  })

  it("읽지 못하는 식은 unsupported — 호출부가 보내지 않는다", () => {
    for (const cron of ["", "0 9 * *", "0 9 */2 * *", "0 9 * * MON", "0 9 32 * *", "0 9 * * 8", "0 9 5-1 * *"]) {
      expect(matchScheduledDay(cron, MON)).toBe("unsupported")
    }
  })

  it("화면의 프리셋 식은 전부 읽을 수 있다", () => {
    for (const preset of PRESET_CRON_OPTIONS) expect(matchScheduledDay(preset.cron, MON)).not.toBe("unsupported")
  })
})

describe("scheduledCronProblem — 저장 때 검사", () => {
  it("예약 규칙이 아니면 검사하지 않는다", () => {
    expect(scheduledCronProblem("on_submit", { type: "on_submit" })).toBeNull()
    expect(scheduledCronProblem("delay", { type: "delay", delayHours: 3 })).toBeNull()
  })

  it("읽을 수 있는 예약 식은 통과한다(프리셋 전부)", () => {
    for (const preset of PRESET_CRON_OPTIONS) {
      expect(scheduledCronProblem("scheduled", { type: "scheduled", cron: preset.cron })).toBeNull()
    }
  })

  it("비었거나 읽을 수 없는 예약 식은 사유를 돌려준다", () => {
    for (const cron of ["", "   ", "0 9 * * MON", "0 9 */2 * *", "@daily", "0 0 9 * * 1"]) {
      expect(scheduledCronProblem("scheduled", { type: "scheduled", cron })).toEqual(expect.any(String))
    }
    expect(scheduledCronProblem("scheduled", { type: "scheduled" })).toEqual(expect.any(String))
    // 수정 요청은 triggerType 없이 triggerConfig 만 올 수 있다.
    expect(scheduledCronProblem(undefined, { type: "scheduled", cron: "nope" })).toEqual(expect.any(String))
  })
})

