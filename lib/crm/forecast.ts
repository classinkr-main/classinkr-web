// 매출 월말 추정 — 단순 런레이트. 현재 실적을 월 진행률로 나눠 월말까지 선형 외삽한다.
// LLM 아님 · 가중 파이프라인 아님(순수 규칙). 목표가 없으면 달성률은 null.

export interface MonthEndProjection {
  /** 현재 실적을 월 진행률로 나눈 월말 추정 실적 */
  projected: number
  /** 현재 실적 / 목표 (%) — 목표 없으면 null */
  attainmentPct: number | null
  /** 추정 월말 / 목표 (%) — 목표 없으면 null */
  projectedPct: number | null
}

/**
 * @param currentActual    이번 달 현재까지 실적(목표와 동일 통화)
 * @param target           월 목표(없으면 null)
 * @param monthProgressRatio 0~1, (경과일 / 그 달 총일수). 0 근처면 외삽이 과대해지므로 하한 클램프.
 */
export function projectMonthEnd(
  currentActual: number,
  target: number | null,
  monthProgressRatio: number
): MonthEndProjection {
  const ratio = Math.min(1, Math.max(0.05, monthProgressRatio))
  const projected = Math.round(currentActual / ratio)
  const attainmentPct = target && target > 0 ? Math.round((currentActual / target) * 100) : null
  const projectedPct = target && target > 0 ? Math.round((projected / target) * 100) : null
  return { projected, attainmentPct, projectedPct }
}

/** KST 기준 (경과일 / 그 달 총일수) 비율. */
export function kstMonthProgressRatio(now: Date): number {
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000)
  const year = kst.getUTCFullYear()
  const month = kst.getUTCMonth()
  const day = kst.getUTCDate()
  const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate()
  return day / daysInMonth
}
