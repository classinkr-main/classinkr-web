// 월별 목표 그릇 차트 — 음수 예정 조각을 그리지 않는다(F-15). 환불·차감은 확도 색 없이 0선 아래 무채색 한 조각(D2).
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"
import { MonthlyGoalBowlChart } from "@/components/admin/branch/MonthlyGoalBowlChart"
import type { MonthlyGoalChartSource } from "@/lib/branch/monthly-goal-chart"

const OCT = "2026-10"
const row = (overrides: Partial<MonthlyGoalChartSource>): MonthlyGoalChartSource => ({ ledgerOrigin: "sheet", revenue: 0, monthlyPayments: {}, ...overrides })
const render = (rows: MonthlyGoalChartSource[]) =>
  renderToStaticMarkup(<MonthlyGoalBowlChart rows={rows} plans={[{ month: OCT, goal: 1000 }]} selectedMonth={OCT} todayMonth="2026-11" today="2026-11-25" />)
const segmentKeys = (html: string) => [...html.matchAll(/data-confidence="([^"]+)"/g)].map((match) => match[1])

describe("MonthlyGoalBowlChart 막대 조각", () => {
  it("검은 환불이 섞인 순액 0 상계 달: 예정 조각 없이 상계(위)·차감(아래)", () => {
    // 캐논: 확정 100 · 예정 −100(순액 0)
    const html = render([row({ monthlyPayments: { [OCT]: 0 }, monthlyConfirmed: { [OCT]: 100 } })])
    expect(segmentKeys(html)).toEqual(["offset", "deduction"])
  })

  it("환불 달은 차감 한 조각만", () => {
    const html = render([row({ monthlyPayments: { [OCT]: -300 }, monthlyConfirmed: { [OCT]: -100 }, monthlyHighConfidence: { [OCT]: -50 } })])
    expect(segmentKeys(html)).toEqual(["deduction"])
  })

  it("월 칸 0 · 주차 빨강 500(F-15 표시)은 확정이 부풀지 않아 조각이 없다", () => {
    const html = render([row({
      monthlyPayments: { [OCT]: 0 },
      monthlyConfirmed: { [OCT]: 500 },
      monthlyRed: { [OCT]: true },
      monthWeekMismatch: { [OCT]: { month: 0, weeks: 500 } },
    })])
    expect(segmentKeys(html)).toEqual([])
    expect(html).not.toContain("확정 목표 달성")
  })

  it("평범한 달은 확정·고확도·예정 색 조각", () => {
    const html = render([row({ monthlyPayments: { [OCT]: 100 }, monthlyConfirmed: { [OCT]: 40 }, monthlyHighConfidence: { [OCT]: 30 } })])
    expect(segmentKeys(html)).toEqual(["confirmed", "highConfidence", "expected"])
  })
})
