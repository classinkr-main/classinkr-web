import { ymKey } from "@/lib/branch/fiscal"

// REV 시트 색 규칙: 주차 칸 빨간 글자 = 확정 매출, 파란 글자 = 클로징 임박(90%+).
// 파서가 monthly_confirmed / monthly_high_conf 에 월별 "금액"으로 분해해 둔다.
// monthly_red(boolean)는 금액 컬럼 도입 전 동기화분 호환용으로만 본다.
//
// ⚠️ 이 모듈이 '확정 매출' 정의의 유일한 SSOT다(2026-07-10 운영 캐논 확정 — 마스터플랜 §7).
// 장부(summary/pipeline/heatmap)·CRM(revenue/performance/rev-sheet 워크스페이스)·주간마감이
// 전부 이 함수를 소비해야 표면 간 수치가 일치한다. 새 표면에서 monthly_confirmed 맵을
// 직접 합산하지 말 것 — red-불리언·무색상 폴백이 빠져 과소집계된다.

// BranchRevDeal 전체가 아니라 확도 판정에 필요한 최소 구조만 요구한다.
// CRM 쪽 시트 행 타입(SheetRevDealRow 등)도 그대로 넘길 수 있다.
export interface RevConfidenceSource {
  monthly_red?: Record<string, boolean> | null
  monthly_confirmed?: Record<string, number> | null
  monthly_high_conf?: Record<string, number> | null
}

export function dealHasColorData(d: RevConfidenceSource): boolean {
  return (
    Object.keys(d.monthly_red ?? {}).length > 0 ||
    Object.keys(d.monthly_confirmed ?? {}).length > 0 ||
    Object.keys(d.monthly_high_conf ?? {}).length > 0
  )
}

// 해당 월(ym) 납부액(total) 중 확정 매출로 집계할 금액.
// 1순위: 명시 monthly_confirmed 금액(0·환불 포함). 양수 전용 자료만 월 합계로 클램프한다.
// 음수·순액 0 상계에서는 색별 금액이 순액을 넘을 수 있어 원본 부호를 보존한다.
// 2순위: monthly_red=true 면 그 달 전액 확정 (금액 컬럼 도입 전 동기화분 호환)
// 3순위: 색 데이터가 전혀 없는 행은 과거~당월분만 전액 확정 fallback.
//   미래 월까지 확정으로 올리면 매출이 부풀려진다 — 2026-07-10 실측: 미러 398행 중
//   무색상 310행, 그중 201행에 미래 월 금액 ¥492.9만이 걸려 있었다.
export function confirmedMonthAmount(d: RevConfidenceSource, ym: string, total: number): number {
  return confirmedMonthAmountWithColor(d, ym, total, dealHasColorData(d))
}

// confirmedMonthAmount와 동일하되, dealHasColorData(d) 결과를 호출자가 미리 계산해
// 넘긴다. 한 딜의 여러 월을 순회할 때(예: pipeline.ts) 딜당 한 번만 색 데이터 스캔을
// 하도록 hoisting 하기 위한 진입점 — 결과는 confirmedMonthAmount와 바이트 동일하다.
// todayYm은 테스트 주입용(기본값 = 오늘의 YYYY-MM, UTC 기준 — fiscal.ts 규약과 동일).
export function confirmedMonthAmountWithColor(
  d: RevConfidenceSource,
  ym: string,
  total: number,
  hasColor: boolean,
  todayYm: string = ymKey(new Date()),
): number {
  const fromMap = monthAmount(d.monthly_confirmed, ym)
  if (fromMap != null) return hasSignedAmounts(d, ym, total) ? fromMap : Math.min(total, fromMap)
  if (d.monthly_red?.[ym]) return total
  if (!hasColor && ym <= todayYm) return total
  return 0
}

function monthAmount(values: Record<string, number> | null | undefined, ym: string): number | null {
  const value = values?.[ym]
  if (value == null) return null
  const amount = Number(value)
  return Number.isFinite(amount) ? amount : null
}

function hasSignedAmounts(d: RevConfidenceSource, ym: string, total: number): boolean {
  const confirmed = monthAmount(d.monthly_confirmed, ym) ?? 0
  const highConfidence = monthAmount(d.monthly_high_conf, ym) ?? 0
  return total < 0 || confirmed < 0 || highConfidence < 0 || (total === 0 && (confirmed !== 0 || highConfidence !== 0))
}

export interface MonthConfidenceSplit {
  confirmed: number
  highConfidence: number
  expected: number
}

// 한 달 납부액(total)의 확도 3분해 — confirmed는 위 캐논, highConfidence는 확정을 뺀
// 잔여를 넘지 않게 클램프, 나머지가 expected. 음수·순액 0 상계는 원본 부호와 합계를 보존한다.
// 주간마감 스냅샷·CRM 매출 병기·rev-sheet
// 워크스페이스가 공용으로 쓴다(각자 재구현하면 클램프 규칙이 갈라진다).
export function splitMonthConfidence(
  d: RevConfidenceSource,
  ym: string,
  total: number,
  hasColor: boolean = dealHasColorData(d),
  todayYm?: string,
): MonthConfidenceSplit {
  const confirmed = confirmedMonthAmountWithColor(d, ym, total, hasColor, todayYm)
  if (hasSignedAmounts(d, ym, total)) {
    const highConfidence = monthAmount(d.monthly_high_conf, ym) ?? 0
    return { confirmed, highConfidence, expected: total - confirmed - highConfidence }
  }
  const highConfidence = Math.min(
    Math.max(0, total - confirmed),
    Number(d.monthly_high_conf?.[ym]) || 0,
  )
  const expected = Math.max(0, total - confirmed - highConfidence)
  return { confirmed, highConfidence, expected }
}
