import { ledgerMonthSplit, type LedgerConfidenceSource } from "./computations/revenue-core"

export interface MonthlyGoalChartSource extends LedgerConfidenceSource {
  monthlyPayments?: Record<string, number> | null
  draftMonth?: string
  revenue: number
}

export interface MonthlyGoalPlan { month: string; goal: number | null }

export function buildMonthlyGoalChart(
  rows: MonthlyGoalChartSource[], plans: MonthlyGoalPlan[], todayMonth: string,
) {
  return plans.map(({ month, goal }) => {
    const totals = { confirmed: 0, highConfidence: 0, expected: 0 }
    for (const row of rows) {
      // 월 맵의 명시적 0·환불을 보존한다. 적용 초안만 자기 월의 revenue로 폴백한다.
      const raw = row.monthlyPayments?.[month]
      const amount = raw != null && Number.isFinite(Number(raw))
        ? Number(raw)
        : row.ledgerOrigin === "draft" && row.draftMonth === month ? row.revenue : 0
      const split = ledgerMonthSplit(row, month, amount, todayMonth)
      totals.confirmed += split.confirmed
      totals.highConfidence += split.highConfidence
      totals.expected += split.expected
    }
    const future = month > todayMonth
    const current = month === todayMonth
    const total = totals.confirmed + totals.highConfidence + totals.expected
    const numerator = future ? total : current ? totals.confirmed + totals.highConfidence : totals.confirmed
    const comparableGoal = goal != null && Number.isFinite(goal) && goal > 0 ? goal : null
    return {
      month, goal: comparableGoal, ...totals, total, future, current,
      rate: comparableGoal != null ? numerator / comparableGoal * 100 : null,
      rateBasis: future ? "예상 포함" : current ? "확정+고확도" : "확정",
      achieved: comparableGoal != null && totals.confirmed >= comparableGoal,
      positive: Object.values(totals).reduce((sum, amount) => sum + Math.max(0, amount), 0),
      negative: Object.values(totals).reduce((sum, amount) => sum + Math.min(0, amount), 0),
    }
  })
}

export type MonthlyGoalChartPoint = ReturnType<typeof buildMonthlyGoalChart>[number]
