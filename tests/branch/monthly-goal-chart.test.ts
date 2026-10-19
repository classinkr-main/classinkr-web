import { describe, expect, it } from "vitest"
import { buildMonthlyGoalChart, type MonthlyGoalChartSource } from "@/lib/branch/monthly-goal-chart"

const TODAY = "2026-10"
const row = (overrides: Partial<MonthlyGoalChartSource> = {}): MonthlyGoalChartSource => ({
  revenue: 0, ledgerOrigin: "sheet", monthlyPayments: {}, ...overrides,
})

describe("3b 월별 목표 그릇 차트 — REV 캐논 소비", () => {
  it("과거 확정·당월 커버·미래 예상 달성률을 구분하고 체크는 확정액만으로 판정한다", () => {
    const source = row({
      monthlyPayments: { "2026-09": 100, "2026-10": 100, "2026-11": 100 },
      monthlyConfirmed: { "2026-09": 40, "2026-10": 40, "2026-11": 40 },
      monthlyHighConfidence: { "2026-09": 30, "2026-10": 30, "2026-11": 30 },
    })
    const points = buildMonthlyGoalChart([source], ["2026-09", "2026-10", "2026-11"].map((month) => ({ month, goal: 80 })), TODAY)
    expect(points.map((point) => point.rate)).toEqual([50, 87.5, 125])
    expect(points.map((point) => point.rateBasis)).toEqual(["확정", "확정+고확도", "예상 포함"])
    expect(points.every((point) => !point.achieved)).toBe(true)
    expect(points[2]).toMatchObject({ future: true, confirmed: 40, highConfidence: 30, expected: 30 })
  })

  it("확정 목표 초과는 잘라내지 않고 100% 초과와 체크를 보존한다", () => {
    const [point] = buildMonthlyGoalChart([row({ monthlyPayments: { [TODAY]: 125 }, monthlyConfirmed: { [TODAY]: 125 } })], [{ month: TODAY, goal: 100 }], TODAY)
    expect(point).toMatchObject({ achieved: true, rate: 125, positive: 125, total: 125 })
  })

  it("무색상 과거 월 폴백과 명시적 0을 캐논대로 유지하며 미래를 확정으로 올리지 않는다", () => {
    const months = ["2026-09", "2026-10", "2026-11"]
    const plain = row({ monthlyPayments: Object.fromEntries(months.map((month) => [month, 100])) })
    expect(buildMonthlyGoalChart([plain], months.map((month) => ({ month, goal: 200 })), TODAY).map((point) => point.confirmed)).toEqual([100, 100, 0])
    const [zero] = buildMonthlyGoalChart([row({ monthlyPayments: { [TODAY]: 100 }, monthlyConfirmed: { [TODAY]: 0 } })], [{ month: TODAY, goal: 200 }], TODAY)
    expect(zero).toMatchObject({ confirmed: 0, expected: 100, rate: 0 })
  })

  it("환불과 순액 0 상계를 숨기지 않고 부호별 스택과 순액을 모두 보존한다", () => {
    const [refund] = buildMonthlyGoalChart([row({ monthlyPayments: { [TODAY]: -30 }, monthlyConfirmed: { [TODAY]: -30 } })], [{ month: TODAY, goal: 100 }], TODAY)
    expect(refund).toMatchObject({ confirmed: -30, total: -30, negative: -30, rate: -30 })
    const [offset] = buildMonthlyGoalChart([row({ monthlyPayments: { [TODAY]: 0 }, monthlyConfirmed: { [TODAY]: 100 }, monthlyHighConfidence: { [TODAY]: -100 } })], [{ month: TODAY, goal: 200 }], TODAY)
    expect(offset).toMatchObject({ confirmed: 100, highConfidence: -100, total: 0, positive: 100, negative: -100 })
  })

  it("적용 초안의 예정 상태와 명시적 월 0을 지키며 미적용 초안을 새로 읽지 않는다", () => {
    const draft = row({ ledgerOrigin: "draft", draftMonth: TODAY, revenue: 100 })
    const [point] = buildMonthlyGoalChart([draft], [{ month: TODAY, goal: 200 }], TODAY)
    expect(point).toMatchObject({ confirmed: 0, expected: 100 })
    expect(buildMonthlyGoalChart([{ ...draft, monthlyPayments: { [TODAY]: 0 } }], [{ month: TODAY, goal: 200 }], TODAY)[0].total).toBe(0)
  })

  it("누락·0·필터로 생략한 목표에는 달성률과 체크를 만들지 않는다", () => {
    for (const goal of [null, 0, -1, Number.NaN]) {
      const [point] = buildMonthlyGoalChart([row({ monthlyPayments: { [TODAY]: 100 } })], [{ month: TODAY, goal }], TODAY)
      expect(point).toMatchObject({ goal: null, rate: null, achieved: false, confirmed: 100 })
    }
  })
})
