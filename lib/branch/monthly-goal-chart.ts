import { ledgerMonthBucket, type LedgerRevenueSource } from "./computations/revenue-core"

// 시트 행·파이프라인 행·장부 오버레이 행이 그대로 맞는다(revenue-core.LedgerRevenueSource).
export interface MonthlyGoalChartSource extends LedgerRevenueSource {
  revenue: number
}

export interface MonthlyGoalPlan { month: string; goal: number | null }

/**
 * 월별 목표 차트 점. 금액은 장부 매출 한 정의(revenue-core.ledgerMonthBucket — 월 맵 그대로, 환불·명시 0 유지,
 * 확도는 캐논)다. today 는 KST 영업일 'YYYY-MM-DD'(권장) 또는 'YYYY-MM' — 달은 앞 7자리, 빨간 예정 칸의
 * 확정 전환은 그날로 판정한다.
 */
export function buildMonthlyGoalChart(
  rows: MonthlyGoalChartSource[], plans: MonthlyGoalPlan[], today: string,
) {
  const todayMonth = today.slice(0, 7)
  return plans.map(({ month, goal }) => {
    const totals = { confirmed: 0, highConfidence: 0, expected: 0 }
    for (const row of rows) {
      const bucket = ledgerMonthBucket(row, month, today)
      totals.confirmed += bucket.confirmed
      totals.highConfidence += bucket.high
      totals.expected += bucket.open
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

/**
 * 차트 막대 한 조각. 확도 색 조각(confirmed·highConfidence·expected)은 순액이 양수인 달의 양수 금액만이다(D2).
 * 음수(환불·차감)는 확도와 무관하게 0선 아래 무채색 'deduction' 한 조각, 순액이 0 이하인 달의 양수 부분은
 * 0선 위 무채색 'offset' 한 조각이다.
 */
export interface MonthlyGoalSegment {
  key: "confirmed" | "highConfidence" | "expected" | "offset" | "deduction"
  /** 0선 기준 시작 금액 */
  start: number
  /** 조각 크기(0선 위 조각은 +, 차감 조각은 −) */
  value: number
}

const STACK_KEYS = ["confirmed", "highConfidence", "expected"] as const

/**
 * 막대 조각 — 음수 예정 조각은 그리지 않는다(F-15). 음수 부분은 전부 합쳐 0선 아래 무채색 '차감' 한 조각이고,
 * 확도 색은 순액이 양수인 달의 양수 금액에만 쓴다. 조각 크기의 합은 positive·negative 와 같다.
 */
export function monthlyGoalSegments(
  point: Pick<MonthlyGoalChartPoint, "confirmed" | "highConfidence" | "expected" | "total" | "positive" | "negative">,
): MonthlyGoalSegment[] {
  const segments: MonthlyGoalSegment[] = []
  if (point.total > 0) {
    let positive = 0
    for (const key of STACK_KEYS) {
      const value = point[key]
      if (!(value > 0)) continue
      segments.push({ key, start: positive, value })
      positive += value
    }
  } else if (point.positive > 0) {
    segments.push({ key: "offset", start: 0, value: point.positive })
  }
  if (point.negative < 0) segments.push({ key: "deduction", start: 0, value: point.negative })
  return segments
}
