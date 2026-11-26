// KR Team 개요 '확정 매출' 카드의 로드맵 막대 — 확정 뒤에 남은 기간 고확도를 이어 그리는 계산.
// 새 원천을 만들지 않는다: 월별 목표 차트와 같은 buildMonthlyGoalChart(REV 캐논) 결과에서
// 기간 안의 "이번 달 이후" 고확도만 모은다(확정과 더하지 않고 막대에 이어 그릴 뿐 — 들어오면 몇 %인지의 참고값).
import { fiscalQuarter } from "./fiscal"
import { buildMonthlyGoalChart, type MonthlyGoalChartSource, type MonthlyGoalPlan } from "./monthly-goal-chart"

export type OverviewPeriodScope = "M" | "Q" | "Y"

/** 기간(M/Q/Y)에 속하는 회계월인지 — 월=선택월, 분기=선택월과 같은 회계 분기, 연=전체. */
export function monthInOverviewPeriod(month: string, scope: OverviewPeriodScope, selectedMonth: string): boolean {
  if (scope === "Y") return true
  if (scope === "M") return month === selectedMonth
  return fiscalQuarter(Number(month.slice(5))) === fiscalQuarter(Number(selectedMonth.slice(5)))
}

/** 기간 안에서 이번 달(todayMonth) 이후에 남은 고확도 합계. 지난 달의 미전환 고확도는 '남은 기간'이 아니라 제외한다. */
export function remainingHighConfidence(
  rows: MonthlyGoalChartSource[],
  plans: MonthlyGoalPlan[],
  opts: { scope: OverviewPeriodScope; selectedMonth: string; todayMonth: string },
): number {
  const points = buildMonthlyGoalChart(rows, plans, opts.todayMonth)
  return points
    .filter((point) => point.month >= opts.todayMonth && monthInOverviewPeriod(point.month, opts.scope, opts.selectedMonth))
    .reduce((sum, point) => sum + Math.max(0, point.highConfidence), 0)
}

export interface HeroRoadmapSegments {
  /** 확정 막대 폭(%, 0..100) */
  confirmedPct: number
  /** 확정 뒤에 이어 그리는 고확도 막대 폭(%, 0..100 - confirmedPct) */
  highPct: number
  /** 고확도가 전부 들어오면 목표의 몇 %인지(100 초과 가능). 목표가 없으면 null */
  projectedPct: number | null
}

export function heroRoadmapSegments(actual: number, goal: number, remainingHigh: number): HeroRoadmapSegments {
  if (!(goal > 0)) return { confirmedPct: 0, highPct: 0, projectedPct: null }
  const confirmedPct = Math.max(0, Math.min(100, (actual / goal) * 100))
  const highPct = Math.max(0, Math.min(100 - confirmedPct, (Math.max(0, remainingHigh) / goal) * 100))
  return { confirmedPct, highPct, projectedPct: ((actual + Math.max(0, remainingHigh)) / goal) * 100 }
}
