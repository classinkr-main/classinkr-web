// 장부 화면 머리 타일(목표 · 확정 매출 · 장부 가감 · Gap)과 전기 대비 칩, 표 위 오버레이 경고 줄, 첫 불러오기 상태 —
// 순수 함수(D1 · D3 · F-13 · F-16 · F-23 · F-40 · F-41).
//
// 숫자는 모두 서버 요약(GET /api/admin/branch/summary 의 revenue)에서 온다. 서버가 시트 행 + 적용 장부 항목을 한 정의(D1)로
// 이미 더했고, 같은 기간 · 같은 범위(팀 ∩ 담당 1명 — 목표와 같은 축, 검색 · 속성 필터는 타지 않는다)의 시트만 확정과
// 전기 확정을 함께 준다. 그래서 화면은 더하지 않는다:
//  - 확정 매출 = revenue.confirmed(시트 + 장부).
//  - 장부 가감 = revenue.confirmed − revenue.sheet_only_confirmed(같은 기간 · 범위). 예전 "장부 합계"는 신규 입력을 한 번 더
//    더해 이중 계상이 됐다(F-23) — 지웠다.
//  - 전기 대비 = 같은 정의 · 같은 범위의 revenue.prev_confirmed 와 비교(F-40). 전기 값이 없거나 0 이하면 칩을 그리지 않는다.
// 음수(환불이 더 큰 기간)는 빼기 부호에 중립 글자색이다(D2 — 빨강은 Gap 의 부족분에만).

import { formatMoney, formatPercent } from "@/lib/branch/ledger-format"
import { fiscalQuarter } from "@/lib/branch/fiscal"
import type { BranchSummaryRevenue, Period } from "../types"

/** 전기 대비 칩 — workbench-shared 의 PeriodComparisonChip 과 같은 모양. */
export interface LedgerPrevPeriodChip {
  label: string
  deltaPct: number
}

export interface LedgerRevenueTile {
  value: string
  hint: string
  /** 값 글자색 클래스. */
  tone: string
}

export interface LedgerRevenueTiles {
  goal: LedgerRevenueTile
  confirmed: LedgerRevenueTile
  ledgerDelta: LedgerRevenueTile
  gap: LedgerRevenueTile & { reached: boolean }
  prev: LedgerPrevPeriodChip | null
}

export interface LedgerRevenueTileInput {
  revenue: BranchSummaryRevenue | null | undefined
  /** 요약을 아직 못 받았다 — 모든 값이 "–", 힌트는 "불러오는 중". */
  pending: boolean
  period: Period
  /** "2026.11" · "현재 분기" · "FY26-27". */
  periodLabel: string
  /** 화면 회계연도 열두 달(4월 → 3월). 전월 라벨을 찾는다. */
  matrixMonths: readonly string[]
  /** 지금 기간의 달들(M = [선택 달], Q = 이번 분기 석 달). */
  periodMonths: readonly string[]
  /** 같은 기간 · 범위의 적용 장부 신규 · 정정 건수. */
  added: number
  corrected: number
}

const TONE_CONFIRMED = "text-[#084734]"
const TONE_NEUTRAL = "text-[#31302E]"
const TONE_DEFAULT = "text-[#111110]"
const TONE_LEDGER_DOWN = "text-[#A8741A]"
const TONE_SHORT = "text-[#B43E3E]"
const PENDING_VALUE = "–"
const PENDING_HINT = "불러오는 중"

function finite(value: number | null | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null
}

/**
 * 전기 대비 칩 — 서버가 준 같은 정의 · 같은 범위의 전기 확정(prev_confirmed)과 비교한다.
 * 연(Y) · 회계연도 밖 전기(4월의 전월 · 1분기의 전분기, 서버가 null) · 전기 0 이하이면 null(거짓 0% · 무한대 % 금지).
 */
export function ledgerPrevPeriodChip(input: {
  period: Period
  confirmed: number | null | undefined
  prevConfirmed: number | null | undefined
  matrixMonths: readonly string[]
  periodMonths: readonly string[]
}): LedgerPrevPeriodChip | null {
  const { period, matrixMonths, periodMonths } = input
  if (period === "Y") return null
  const confirmed = finite(input.confirmed)
  const prev = finite(input.prevConfirmed)
  if (confirmed == null || prev == null || prev <= 0) return null
  let label: string
  if (period === "M") {
    const index = matrixMonths.indexOf(periodMonths[0] ?? "")
    if (index <= 0) return null
    const [year, month] = matrixMonths[index - 1].split("-")
    label = `${year}.${Number(month)} 대비`
  } else {
    const first = periodMonths[0]
    if (!first) return null
    const quarter = fiscalQuarter(Number(first.slice(5, 7)))
    if (quarter <= 1) return null
    label = `Q${quarter - 1} 대비`
  }
  return { label, deltaPct: ((confirmed - prev) / prev) * 100 }
}

/** 건별 시트 · 결과 줄 · 카드의 불러오기 상태(F-13). */
export interface LedgerSheetLoadState {
  /** 첫 불러오기가 안 끝났다 — 시트 행(파이프라인)이 아직 안 왔거나(실패도 아님) 초안 · 장부 항목 목록을 아직 한 번도 못 받았다. */
  pending: boolean
  /** 시트 행을 못 불러왔다(파이프라인 실패) — 장부 입력분만 있다. */
  partial: boolean
}

/**
 * 첫 불러오기 상태 — 장부 입력분(초안 목록)만 먼저 오거나 시트 행만 먼저 와도 "다 불러옴"이 아니다. 초안 목록은 처음 한 번만
 * 기다린다(draftsSettledOnce) — 적용 · 되돌리기 뒤 다시 읽을 때마다 표를 비우지 않게.
 */
export function ledgerSheetLoadState(input: {
  pipelineLoaded: boolean
  pipelineFailed: boolean
  draftsSettledOnce: boolean
}): LedgerSheetLoadState {
  const pipelineSettled = input.pipelineLoaded || input.pipelineFailed
  return {
    pending: !pipelineSettled || !input.draftsSettledOnce,
    partial: input.pipelineFailed && !input.pipelineLoaded,
  }
}

/** 장부 오버레이 경고(표 위 노란 띠) 입력 — buildLedgerOverlay 결과의 건수. */
export interface LedgerOverlayNoticeInput {
  /** 원래 시트 행을 못 찾은 정정. */
  unresolved: number
  /** 같은 (시트 행, 달)에 겹친 정정 중 가장 늦은 것에 밀린 정정(F-04). */
  superseded: number
  /** 정정한 뒤 시트 값이 바뀐 정정(F-16). */
  drift: number
  /** 같은 고객 · 같은 달 시트 금액과 겹치는 장부 신규(F-16). */
  duplicates: number
  /**
   * 시트 행을 다 불러왔는가. 아니면(불러오는 중 · 실패) 네 경고를 모두 숨긴다 — 시트 행이 없으면 모든 정정이 "원래 행을
   * 못 찾음"으로 세져 거짓 경고가 뜬다(F-13).
   */
  sheetRowsReady: boolean
}

/** 오버레이 경고 줄 — 건수가 0 이 아닌 것만, 한 줄씩. */
export function ledgerOverlayNotices(input: LedgerOverlayNoticeInput): string[] {
  if (!input.sheetRowsReady) return []
  const count = (value: number) => value.toLocaleString("ko-KR")
  const notices: string[] = []
  if (input.unresolved > 0) {
    notices.push(
      `장부에서 반영한 수정 ${count(input.unresolved)}건의 원래 시트 행을 찾지 못했습니다 — 시트에서 행이 지워졌거나 고객명·상품이 바뀌었을 수 있어, 이 수정은 원래 금액과 따로 더해져 보입니다. 체크 큐에서 확인하세요.`,
    )
  }
  if (input.superseded > 0) notices.push(`같은 칸 장부 정정 ${count(input.superseded)}건 — 가장 최근 것만 셉니다.`)
  if (input.drift > 0) notices.push(`장부 정정 ${count(input.drift)}건 — 정정한 뒤 시트 값이 바뀌었습니다. 정정이 아직 맞는지 확인하세요.`)
  if (input.duplicates > 0) notices.push(`장부 신규 ${count(input.duplicates)}건이 같은 달 시트 행과 겹칩니다 — 이중 입력인지 확인하세요.`)
  return notices
}

/** 타일 네 칸의 값 · 힌트 · 글자색. */
export function buildLedgerRevenueTiles(input: LedgerRevenueTileInput): LedgerRevenueTiles {
  const { revenue, pending, periodLabel } = input
  if (pending || !revenue) {
    const empty = { value: PENDING_VALUE, hint: PENDING_HINT }
    return {
      goal: { ...empty, tone: TONE_DEFAULT },
      confirmed: { ...empty, tone: TONE_CONFIRMED },
      ledgerDelta: { ...empty, tone: TONE_CONFIRMED },
      gap: { ...empty, tone: TONE_CONFIRMED, reached: true },
      prev: null,
    }
  }
  const goal = finite(revenue.goal) ?? 0
  const confirmed = finite(revenue.confirmed) ?? 0
  const sheetOnly = finite(revenue.sheet_only_confirmed)
  const pace = `${periodLabel} 달성률 ${formatPercent(revenue.pacing_pct)}`
  const ledgerUnread = revenue.ledger_included === false
  // 장부를 못 읽었으면 서버 확정이 곧 시트만이라 가감은 셀 수 없다("–") — ¥0 으로 보이면 "장부 영향 없음"으로 읽힌다.
  const delta = sheetOnly == null || ledgerUnread ? null : confirmed - sheetOnly
  const gap = confirmed - goal
  return {
    goal: { value: formatMoney(goal), hint: `${periodLabel} 목표 매출`, tone: TONE_DEFAULT },
    confirmed: {
      value: formatMoney(confirmed),
      hint: ledgerUnread ? `시트만(장부 반영값 못 읽음) · ${pace}` : `시트 + 장부 반영 · ${pace}`,
      tone: confirmed < 0 ? TONE_NEUTRAL : TONE_CONFIRMED,
    },
    ledgerDelta: {
      value: delta == null ? PENDING_VALUE : `${delta > 0 ? "+" : ""}${formatMoney(delta)}`,
      hint: ledgerUnread
        ? `${periodLabel} 확정 · 장부 반영값을 못 읽어 시트 대비를 셀 수 없습니다`
        : `${periodLabel} 확정 · 시트 대비 · 신규 ${input.added.toLocaleString("ko-KR")}건 · 수정 ${input.corrected.toLocaleString("ko-KR")}건`,
      tone: delta != null && delta < 0 ? TONE_LEDGER_DOWN : TONE_CONFIRMED,
    },
    gap: {
      value: formatMoney(gap),
      hint: gap >= 0 ? "목표 초과" : "목표 대비 부족",
      tone: gap >= 0 ? TONE_CONFIRMED : TONE_SHORT,
      reached: gap >= 0,
    },
    prev: ledgerPrevPeriodChip({
      period: input.period,
      confirmed,
      prevConfirmed: revenue.prev_confirmed,
      matrixMonths: input.matrixMonths,
      periodMonths: input.periodMonths,
    }),
  }
}
