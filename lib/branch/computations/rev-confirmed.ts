import type { BranchRevDeal } from "@/lib/repositories/branch-deals"

// REV 시트 색 규칙: 주차 칸 빨간 글자 = 확정 매출, 파란 글자 = 클로징 임박(90%+).
// 파서가 monthly_confirmed / monthly_high_conf 에 월별 "금액"으로 분해해 둔다.
// monthly_red(boolean)는 금액 컬럼 도입 전 동기화분 호환용으로만 본다.

export function dealHasColorData(d: BranchRevDeal): boolean {
  return (
    Object.keys(d.monthly_red ?? {}).length > 0 ||
    Object.keys(d.monthly_confirmed ?? {}).length > 0 ||
    Object.keys(d.monthly_high_conf ?? {}).length > 0
  )
}

// 해당 월(ym) 납부액(total) 중 확정 매출로 집계할 금액.
// 1순위: monthly_confirmed 금액(월 합계로 클램프) → 한 달 안의 확정/예상 혼재를 분리
// 2순위: monthly_red=true 면 그 달 전액 확정 (금액 컬럼 도입 전 동기화분 호환)
// 3순위: 색 데이터가 전혀 없는 행은 기존 집계와 동일하게 전액 확정 fallback
export function confirmedMonthAmount(d: BranchRevDeal, ym: string, total: number): number {
  const fromMap = Math.min(total, Number(d.monthly_confirmed?.[ym]) || 0)
  if (fromMap > 0) return fromMap
  if (d.monthly_red?.[ym]) return total
  if (!dealHasColorData(d)) return total
  return 0
}
