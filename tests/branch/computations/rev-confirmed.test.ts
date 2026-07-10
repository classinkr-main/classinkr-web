import { describe, it, expect } from "vitest"
import {
  confirmedMonthAmount,
  confirmedMonthAmountWithColor,
  dealHasColorData,
  splitMonthConfidence,
  type RevConfidenceSource,
} from "@/lib/branch/computations/rev-confirmed"

// '확정 매출' 운영 캐논(2026-07-10)의 회귀 고정 — 이 규칙이 바뀌면 장부·CRM·주간마감
// 수치가 한꺼번에 움직이므로, 케이스별 기대값을 명시해 무단 변경을 막는다.

const TODAY = "2026-07"

function deal(partial: Partial<RevConfidenceSource>): RevConfidenceSource {
  return { monthly_red: {}, monthly_confirmed: {}, monthly_high_conf: {}, ...partial }
}

describe("confirmedMonthAmount 캐논", () => {
  it("1순위: monthly_confirmed 금액을 월 합계로 클램프해 쓴다", () => {
    const d = deal({ monthly_confirmed: { "2026-05": 300 } })
    expect(confirmedMonthAmountWithColor(d, "2026-05", 1000, true, TODAY)).toBe(300)
    // 맵 금액이 월 합계보다 커도 월 합계를 넘지 않는다
    expect(confirmedMonthAmountWithColor(d, "2026-05", 200, true, TODAY)).toBe(200)
  })

  it("2순위: monthly_red=true면 그 달 전액 확정 (금액 컬럼 도입 전 호환)", () => {
    const d = deal({ monthly_red: { "2026-05": true } })
    expect(confirmedMonthAmountWithColor(d, "2026-05", 1000, true, TODAY)).toBe(1000)
  })

  it("색 데이터가 있는 딜의 무표시 월은 확정 0", () => {
    const d = deal({ monthly_confirmed: { "2026-05": 300 } })
    expect(confirmedMonthAmountWithColor(d, "2026-06", 1000, true, TODAY)).toBe(0)
  })

  it("무색상 폴백: 과거~당월은 전액 확정, 미래 월은 0 (월 가드)", () => {
    const d = deal({})
    expect(confirmedMonthAmountWithColor(d, "2026-06", 1000, false, TODAY)).toBe(1000)
    expect(confirmedMonthAmountWithColor(d, TODAY, 1000, false, TODAY)).toBe(1000)
    // 미래 월을 확정으로 올리면 매출이 부풀려진다 — 2026-07-10 실측 ¥492.9만 케이스
    expect(confirmedMonthAmountWithColor(d, "2026-08", 1000, false, TODAY)).toBe(0)
    expect(confirmedMonthAmountWithColor(d, "2027-01", 1000, false, TODAY)).toBe(0)
  })

  it("confirmedMonthAmount는 dealHasColorData를 내부 계산한 WithColor와 동일", () => {
    const colored = deal({ monthly_confirmed: { "2026-05": 300 } })
    expect(confirmedMonthAmount(colored, "2026-05", 1000)).toBe(
      confirmedMonthAmountWithColor(colored, "2026-05", 1000, dealHasColorData(colored)),
    )
  })
})

describe("splitMonthConfidence 3분해", () => {
  it("confirmed + highConfidence(잔여 클램프) + expected = 월 합계", () => {
    const d = deal({
      monthly_confirmed: { "2026-05": 300 },
      monthly_high_conf: { "2026-05": 500 },
    })
    const split = splitMonthConfidence(d, "2026-05", 1000, true, TODAY)
    expect(split).toEqual({ confirmed: 300, highConfidence: 500, expected: 200 })
    expect(split.confirmed + split.highConfidence + split.expected).toBe(1000)
  })

  it("highConfidence는 확정을 뺀 잔여를 넘지 않는다", () => {
    const d = deal({
      monthly_confirmed: { "2026-05": 800 },
      monthly_high_conf: { "2026-05": 500 },
    })
    expect(splitMonthConfidence(d, "2026-05", 1000, true, TODAY)).toEqual({
      confirmed: 800,
      highConfidence: 200,
      expected: 0,
    })
  })

  it("무색상 미래 월은 전액 expected로 분류된다", () => {
    const d = deal({})
    expect(splitMonthConfidence(d, "2026-09", 1000, false, TODAY)).toEqual({
      confirmed: 0,
      highConfidence: 0,
      expected: 1000,
    })
  })

  it("red 월은 전액 확정, expected 0", () => {
    const d = deal({ monthly_red: { "2026-05": true }, monthly_high_conf: { "2026-05": 400 } })
    expect(splitMonthConfidence(d, "2026-05", 1000, true, TODAY)).toEqual({
      confirmed: 1000,
      highConfidence: 0,
      expected: 0,
    })
  })

  it("null 맵(구 동기화 행)도 구조적 타입으로 안전하다", () => {
    const d: RevConfidenceSource = { monthly_red: null, monthly_confirmed: null, monthly_high_conf: null }
    expect(dealHasColorData(d)).toBe(false)
    expect(splitMonthConfidence(d, "2026-05", 1000, dealHasColorData(d), TODAY)).toEqual({
      confirmed: 1000,
      highConfidence: 0,
      expected: 0,
    })
  })
})
