import {
  confirmedMonthAmountWithColor,
  dealHasColorData,
  splitMonthConfidence,
  type MonthConfidenceSplit,
  type RevConfidenceSource,
  type RevMonthWeekMismatch,
  type RevPendingCells,
} from "./rev-confirmed"
import { branchManagerMatches } from "@/lib/branch/personal-scope"

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
// - 시트/DB 원천 행: 캐논 전체 규칙(확정맵 → red → 무색상이면 이번 KST 영업월 이전 달 전액 확정).
//   색 데이터가 전혀 없는 미러 행의 과거 수납분을 예정으로 흘리면 summary 월별 시리즈·
//   CRM·주간마감(전부 캐논 소비)과 숫자가 어긋난다.
// - 적용 초안 행(ledgerOrigin === "draft"): 확도 맵이 정본 — 색 데이터 부재는 운영자가
//   명시적으로 고른 '예정'이므로 폴백을 차단한다. 폴백을 태우면 예정 입력이 적용 즉시
//   확정으로 집계된다(확정·달성률 인플레 — SalesLedgerWorkbench 초안 확도 맵 규약).
//
// 읽는 시점 판정(F-08·F-09): 시트 행의 pendingCells(빨간 예정 칸)·monthWeekMismatch(월≠주 합)를 캐논에 넘긴다 —
// 서버(deal.raw)와 클라이언트(행 필드)가 같은 재료로 같은 함수를 부른다. today 는 KST 영업일('YYYY-MM-DD')을 권장한다.

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
  /** 시트 행의 빨간 예정 칸(deal.raw.pendingCells) — 시작일(KST)이 오면 확정으로 읽힌다. */
  pendingCells?: RevPendingCells | null
  /** 시트 행의 월 칸 ≠ 주차 합 표시(deal.raw.monthWeekMismatch) — 확정·고확도를 월 합계 안으로 자른다. */
  monthWeekMismatch?: Record<string, RevMonthWeekMismatch> | null
}

/** camelCase 클라이언트 행 → 캐논 snake_case 소스. 값 변형 없음(참조 그대로). 초안 행은 시트 재료를 싣지 않는다. */
export function toRevConfidenceSource(row: LedgerConfidenceSource): RevConfidenceSource {
  const source: RevConfidenceSource = {
    monthly_confirmed: row.monthlyConfirmed,
    monthly_high_conf: row.monthlyHighConfidence,
    monthly_red: row.monthlyRed,
  }
  if (row.ledgerOrigin !== "draft" && (row.pendingCells || row.monthWeekMismatch)) {
    source.raw = {
      ...(row.pendingCells ? { pendingCells: row.pendingCells } : {}),
      ...(row.monthWeekMismatch ? { monthWeekMismatch: row.monthWeekMismatch } : {}),
    }
  }
  return source
}

/**
 * 캐논 hasColor 인자 판정 — true면 무색상 폴백(지난달까지 전액 확정)이 꺼진다.
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
 * 순액 0에도 확정/고확도 상계가 있을 수 있으므로 금액만 보고 단락하지 않는다.
 * 음수 월(환불/차감)은 캐논에 위임한다 — 서버 파이프라인(pipeline.ts)이 음수를 캐논에 그대로
 * 넣으므로 여기서 0으로 자르면 모달·클라 합계가 서버 confirmed_revenue와 어긋난다(적대 리뷰 P2).
 * today: 읽는 시점(KST 'YYYY-MM-DD' 권장, 'YYYY-MM' 도 받는다). 없으면 지금의 KST 영업일.
 */
export function ledgerMonthConfirmed(
  row: LedgerConfidenceSource,
  month: string,
  total: number,
  today?: string,
): number {
  const source = toRevConfidenceSource(row)
  return confirmedMonthAmountWithColor(source, month, total, ledgerRowHasColor(row, source), today)
}

/** 해당 월 금액의 확도 3분해 — splitMonthConfidence 캐논과 동일 산식(클램프 규칙 포함). */
export function ledgerMonthSplit(
  row: LedgerConfidenceSource,
  month: string,
  total: number,
  today?: string,
): MonthConfidenceSplit {
  const source = toRevConfidenceSource(row)
  return splitMonthConfidence(source, month, total, ledgerRowHasColor(row, source), today)
}

// ── 장부 매출 한 정의(D1·D2) ─────────────────────────────────────────────────────────────
//
// 시트 '2. REV' 1행 =Sum() 과 같은 뜻: 월 칸 그대로(음수·명시 0 포함), 상태·첫 결제일 필터 없음, 부호 자르지 않음.
// 확도는 캐논(ledgerMonthSplit)이 나눈다. 장부 화면·서버 집계·DSH 실적이 이 함수로 같은 숫자를 낸다.
// 5단계 확도(W5a, 12/1 뒤)는 이 버킷만 넓힌다.

/** 한 행 × 한 달(또는 여러 행 합)의 장부 매출 — total = confirmed + high + open 이 늘 정확히 성립한다. */
export interface LedgerRevenueBucket {
  total: number
  confirmed: number
  high: number
  open: number
}

export type LedgerRevenueConfidence = "confirmed" | "high-confidence" | "expected"

/** 장부 매출 행 — 파이프라인 시트 행(BranchPipelineRow·RevRevenueRow)과 장부 오버레이 행이 그대로 맞는다. */
export interface LedgerRevenueSource extends LedgerConfidenceSource {
  monthlyPayments?: Record<string, number> | null
  /** 적용 초안 행의 자기 달 — 월 맵에 그 달 키가 없을 때만 revenue 로 폴백한다. */
  draftMonth?: string
  revenue?: number | null
  manager?: string | null
  team?: string | null
}

export const EMPTY_LEDGER_BUCKET: Readonly<LedgerRevenueBucket> = Object.freeze({ total: 0, confirmed: 0, high: 0, open: 0 })

/**
 * 한 달 순액 — 월 맵 값이 있으면 그대로(음수·명시 0 유지). 없으면 적용 초안 행의 자기 달만 revenue, 그 밖은 0.
 * (monthly-goal-chart 의 예전 인라인 규칙과 바이트 동일.)
 */
export function ledgerMonthNet(row: LedgerRevenueSource, month: string): number {
  const raw = row.monthlyPayments?.[month]
  if (raw != null) {
    const amount = Number(raw)
    if (Number.isFinite(amount)) return amount
  }
  if (row.ledgerOrigin === "draft" && row.draftMonth === month) return Number(row.revenue) || 0
  return 0
}

/**
 * 한 행 × 한 달 장부 매출 버킷. 부호 그대로(환불 달 포함), 확도는 캐논.
 * 순액이 양수인 달에는 음수 예정을 두지 않는다 — 캐논이 부호 보존으로 낸 음수 예정은 고확도(양수일 때)에서 먼저,
 * 남으면 확정에서 덜어 0 으로 맞춘다(합계는 그대로). 순액 0·음수 달은 캐논 분해를 그대로 둔다.
 */
export function ledgerMonthBucket(row: LedgerRevenueSource, month: string, today?: string): LedgerRevenueBucket {
  const total = ledgerMonthNet(row, month)
  const split = ledgerMonthSplit(row, month, total, today)
  let confirmed = split.confirmed
  let high = split.highConfidence
  let open = split.expected
  if (total > 0 && open < 0) {
    let deficit = -open
    open = 0
    if (high > 0) {
      const take = Math.min(high, deficit)
      high -= take
      deficit -= take
    }
    confirmed -= deficit
  }
  return { total, confirmed, high, open }
}

/** 네 값이 모두 0 — '값 없음'(순액 0 상계 달도 여기에 든다). */
export function isZeroLedgerBucket(bucket: LedgerRevenueBucket): boolean {
  return bucket.total === 0 && bucket.confirmed === 0 && bucket.high === 0 && bucket.open === 0
}

export interface LedgerRevenueQuery {
  months: readonly string[]
  /** null·'ALL' = 전체. 그 밖에는 row.team 이 같은 행만. */
  team?: string | null
  /** null·빈 배열 = 전체. 그 밖에는 branchManagerMatches 로 하나라도 맞는 행만. */
  managers?: readonly string[] | null
  /** null = 세 확도 전부. 그 밖에는 집합 밖 확도를 0 으로 보고 total 도 포함한 확도 합으로 둔다. */
  confidences?: ReadonlySet<LedgerRevenueConfidence> | null
  /** 읽는 시점(KST 'YYYY-MM-DD' 권장). 없으면 지금의 KST 영업일. */
  today?: string
}

/**
 * 여러 행 × 여러 달 장부 매출 합. rows = 포함 확도에 0 이 아닌 값이 하나라도 있는 행 수.
 * 상태·첫 결제일 필터 없음, 부호 자르지 않음(시트 1행 =Sum() 과 같은 뜻).
 */
export function sumLedgerRevenue(
  rows: readonly LedgerRevenueSource[],
  query: LedgerRevenueQuery,
): LedgerRevenueBucket & { rows: number } {
  const team = query.team && query.team !== "ALL" ? query.team : null
  const managers = query.managers && query.managers.length > 0 ? query.managers : null
  const include = (confidence: LedgerRevenueConfidence) => !query.confidences || query.confidences.has(confidence)
  const out = { total: 0, confirmed: 0, high: 0, open: 0, rows: 0 }
  for (const row of rows) {
    if (team && row.team !== team) continue
    if (managers && !managers.some((manager) => branchManagerMatches(row.manager, manager))) continue
    let counted = false
    for (const month of query.months) {
      const bucket = ledgerMonthBucket(row, month, query.today)
      const confirmed = include("confirmed") ? bucket.confirmed : 0
      const high = include("high-confidence") ? bucket.high : 0
      const open = include("expected") ? bucket.open : 0
      const total = query.confidences ? confirmed + high + open : bucket.total
      out.confirmed += confirmed
      out.high += high
      out.open += open
      out.total += total
      if (confirmed !== 0 || high !== 0 || open !== 0 || total !== 0) counted = true
    }
    if (counted) out.rows += 1
  }
  return out
}
