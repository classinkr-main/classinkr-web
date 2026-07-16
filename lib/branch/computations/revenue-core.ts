import {
  confirmedMonthAmountWithColor,
  dealHasColorData,
  splitMonthConfidence,
  type MonthConfidenceSplit,
  type RevConfidenceSource,
} from "./rev-confirmed"

// revenue-core — 클라이언트 표면(장부 매트릭스·딜 상세 모달 등)이 확정/확도 금액을
// 계산할 때 쓰는 캐논(rev-confirmed.ts) 소비 진입점 (마스터플랜 C2).
//
// 캐논은 REV 원천의 snake_case 맵(monthly_confirmed 등)을 받지만, 클라이언트 행 타입
// (BranchPipelineRow·LedgerRevenueRow·DealModalDeal)은 camelCase 맵을 쓴다. 이 모듈이
// 그 변환과 "무색상 폴백을 적용할 행인가" 판정을 한곳에 봉인해, 각 표면이 확정 정의를
// 재구현(직접 맵 합산 = red-불리언·무색상 폴백 누락으로 과소집계, 또는 red-미표시를
// 전부 확정 취급 = 미래 월까지 과대집계)하는 드리프트를 막는다.
//
// 무색상 폴백 적용 규칙:
// - 시트/DB 원천 행: 캐논 전체 규칙(확정맵 → red → 무색상이면 과거~당월 전액 확정).
//   색 데이터가 전혀 없는 미러 행의 과거 수납분을 예정으로 흘리면 summary 월별 시리즈·
//   CRM·주간마감(전부 캐논 소비)과 숫자가 어긋난다.
// - 적용 초안 행(ledgerOrigin === "draft"): 확도 맵이 정본 — 색 데이터 부재는 운영자가
//   명시적으로 고른 '예정'이므로 폴백을 차단한다. 폴백을 태우면 예정 입력이 적용 즉시
//   확정으로 집계된다(확정·달성률 인플레 — SalesLedgerWorkbench 초안 확도 맵 규약).

export interface LedgerConfidenceSource {
  /** 장부 오버레이 원천 — "draft"면 확도 맵이 정본이라 무색상 폴백을 차단한다. */
  ledgerOrigin?: "sheet" | "draft"
  monthlyConfirmed?: Record<string, number> | null
  monthlyHighConfidence?: Record<string, number> | null
  monthlyRed?: Record<string, boolean> | null
  /**
   * 원본 행의 색 데이터 보유 여부 힌트. 수정초안 오버라이드처럼 색 맵을 로컬에서
   * 지운 파생 행은 이 힌트로 "원천 시트에 색이 있었는가"를 보존해야 한다 — 지운 뒤의
   * 맵으로 재판정하면 남은 과거 월이 무색상 폴백으로 확정 오집계될 수 있다.
   */
  confidenceColorHint?: boolean
}

/** camelCase 클라이언트 행 → 캐논 snake_case 소스. 값 변형 없음(참조 그대로). */
export function toRevConfidenceSource(row: LedgerConfidenceSource): RevConfidenceSource {
  return {
    monthly_confirmed: row.monthlyConfirmed,
    monthly_high_conf: row.monthlyHighConfidence,
    monthly_red: row.monthlyRed,
  }
}

/**
 * 캐논 hasColor 인자 판정 — true면 무색상 폴백(과거월 전액 확정)이 꺼진다.
 * 초안 행은 항상 true(확도 맵 정본), 파생 행은 confidenceColorHint 우선,
 * 그 외에는 캐논 dealHasColorData 위임.
 */
export function ledgerRowHasColor(
  row: LedgerConfidenceSource,
  source: RevConfidenceSource = toRevConfidenceSource(row),
): boolean {
  if (row.ledgerOrigin === "draft") return true
  if (typeof row.confidenceColorHint === "boolean") return row.confidenceColorHint
  return dealHasColorData(source)
}

/**
 * 해당 월 금액(total) 중 확정 매출 — confirmedMonthAmount 캐논과 동일 산식.
 * total===0만 단락(빈 셀 다수인 12개월 매트릭스 순회 비용 절감 — 캐논도 0에는 0을 돌려준다).
 * 음수 월(환불/차감)은 캐논에 위임한다 — 서버 파이프라인(pipeline.ts)이 음수를 캐논에 그대로
 * 넣으므로 여기서 0으로 자르면 모달·클라 합계가 서버 confirmed_revenue와 어긋난다(적대 리뷰 P2).
 * todayYm은 테스트 주입용(기본 = 오늘 YYYY-MM, UTC — 캐논 기본값 그대로).
 */
export function ledgerMonthConfirmed(
  row: LedgerConfidenceSource,
  month: string,
  total: number,
  todayYm?: string,
): number {
  if (total === 0) return 0
  const source = toRevConfidenceSource(row)
  return confirmedMonthAmountWithColor(source, month, total, ledgerRowHasColor(row, source), todayYm)
}

/** 해당 월 금액의 확도 3분해 — splitMonthConfidence 캐논과 동일 산식(클램프 규칙 포함). */
export function ledgerMonthSplit(
  row: LedgerConfidenceSource,
  month: string,
  total: number,
  todayYm?: string,
): MonthConfidenceSplit {
  // total===0만 단락 — 음수 월은 캐논 위임(ledgerMonthConfirmed 주석 참조).
  if (total === 0) return { confirmed: 0, highConfidence: 0, expected: 0 }
  const source = toRevConfidenceSource(row)
  return splitMonthConfidence(source, month, total, ledgerRowHasColor(row, source), todayYm)
}
