// DSH 카드 표 → TSV 행(라운드 5 B2·D-1). 화면 표기는 ¥천 반올림이지만, 복사는 시트 원값(¥, 반올림 없음)이다 —
// 스프레드시트에 붙여 넣어 다시 계산하는 용도라 축약값을 넘기면 합계가 어긋난다. 달성률은 % 숫자(소수 1자리),
// 목표가 없어 판정이 안 되는 칸은 빈 칸(화면의 "–"). 첫 줄 설명(카드·보기·단위·원천)은 호출부가
// withCaptionRow(ledger-export.ts)로 붙인다. 이 파일은 JSX 없이 순수 함수만 둔다(vitest 직접 구동).

import type { DelimitedCell } from "@/lib/export/delimited"

import {
  dshMonthLabel,
  dshNumbersForView,
  dshRate,
  type DshMonthlyPaceData,
  type DshNumbers,
  type DshTeamGridData,
} from "./dsh-derive"

export type DshCopyView = "goal" | "status" | "gap" | "rate"

export const DSH_COPY_VIEW_LABEL: Record<DshCopyView, string> = {
  goal: "Goal(목표)",
  status: "Status(실적)",
  gap: "Gap(실적−목표)",
  rate: "Rate(달성률 %)",
}

const QUARTERS = ["Q1", "Q2", "Q3", "Q4"] as const

function won(value: number | null | undefined): number {
  const numeric = Math.round(Number(value ?? 0))
  return Number.isFinite(numeric) ? numeric || 0 : 0
}

function pctCell(pct: number | null): number | null {
  if (pct == null || !Number.isFinite(pct)) return null
  return Math.round(pct * 10) / 10
}

/** 회계월 열 머리 — FY가 해를 넘기므로 연도를 붙인다("2026.4월"). */
export function dshCopyMonthHeader(ym: string, unit: string): string {
  return `${ym.slice(0, 4)}.${dshMonthLabel(ym)}${unit}`
}

function amountSpan(numbers: DshNumbers | null, monthKeys: readonly string[]): DelimitedCell[] {
  if (!numbers) return [null, null, null, null, null, ...monthKeys.map(() => null)]
  return [won(numbers.annual), ...numbers.quarters.map((value) => won(value)), ...monthKeys.map((ym) => won(numbers.months[ym]))]
}

interface RateCellLike {
  pct: number | null
}

interface RateNumbersLike {
  annual: RateCellLike
  quarters: readonly RateCellLike[]
  months: Record<string, RateCellLike>
}

function rateSpan(numbers: RateNumbersLike, monthKeys: readonly string[]): DelimitedCell[] {
  return [
    pctCell(numbers.annual.pct),
    ...[0, 1, 2, 3].map((index) => pctCell(numbers.quarters[index]?.pct ?? null)),
    ...monthKeys.map((ym) => pctCell(numbers.months[ym]?.pct ?? null)),
  ]
}

function ratioCell(value: number, total: number): number | null {
  if (!(total > 0)) return null
  return Math.round((value / total) * 1000) / 10
}

interface NumericGridRowLike extends DshNumbers {
  category: string
  status_type: string
  channel: string
}

/**
 * 수치 그리드(목표·실적 상세) 현재 보기 → TSV 행. Goal/Status/Gap = 원값 ¥ + 비율(연간 구성비 %, Gap은 없음),
 * Rate = 달성률 %. 첫 행은 Team KR · Total(화면과 같은 순서).
 */
export function buildDshNumericTsvRows(
  input:
    | { view: "goal" | "status" | "gap"; monthKeys: readonly string[]; rows: readonly NumericGridRowLike[]; total: DshNumbers }
    | {
        view: "rate"
        monthKeys: readonly string[]
        rows: ReadonlyArray<RateNumbersLike & { category: string; status_type: string; channel: string }>
        total: RateNumbersLike
      },
): DelimitedCell[][] {
  const unit = input.view === "rate" ? "(%)" : "(¥)"
  const withRatio = input.view === "goal" || input.view === "status"
  const header: DelimitedCell[] = [
    "카테고리",
    "구분",
    `연간${unit}`,
    ...QUARTERS.map((label) => `${label}${unit}`),
    ...input.monthKeys.map((ym) => dshCopyMonthHeader(ym, unit)),
    ...(withRatio ? ["연간 구성비(%)"] : []),
  ]
  if (input.view === "rate") {
    return [
      header,
      ["Team KR", "Total", ...rateSpan(input.total, input.monthKeys)],
      ...input.rows.map((row): DelimitedCell[] => [row.category, `${row.status_type} · ${row.channel}`, ...rateSpan(row, input.monthKeys)]),
    ]
  }
  const totalAnnual = input.total.annual
  return [
    header,
    ["Team KR", "Total", ...amountSpan(input.total, input.monthKeys), ...(withRatio ? [ratioCell(totalAnnual, totalAnnual)] : [])],
    ...input.rows.map((row): DelimitedCell[] => [
      row.category,
      `${row.status_type} · ${row.channel}`,
      ...amountSpan(row, input.monthKeys),
      ...(withRatio ? [ratioCell(row.annual, totalAnnual)] : []),
    ]),
  ]
}

function teamCopyLabel(team: string): string {
  return team === "ALL" ? "Team KR" : team
}

/**
 * 팀·멤버 그리드 → TSV 행. 화면에서 접힌 멤버도 전부 싣는다(펼침은 표시 상태일 뿐). 열 = 팀 · 멤버 ·
 * 연간 달성률(%, 뷰와 무관하게 상시 — 화면과 같음) · 연간 · Q1–Q4 · 월별.
 */
export function buildDshTeamTsvRows(grid: DshTeamGridData, view: DshCopyView): DelimitedCell[][] {
  const unit = view === "rate" ? "(%)" : "(¥)"
  const header: DelimitedCell[] = [
    "팀",
    "멤버",
    "연간 달성률(%)",
    `연간${unit}`,
    ...QUARTERS.map((label) => `${label}${unit}`),
    ...grid.monthKeys.map((ym) => dshCopyMonthHeader(ym, unit)),
  ]
  const cellsFor = (entry: { goal: DshNumbers | null; status: DshNumbers | null }): DelimitedCell[] => {
    const annualRate = pctCell(dshRate(entry.status?.annual ?? 0, entry.goal?.annual ?? 0))
    if (view === "rate") {
      const cell = (status: number, goal: number) => pctCell(dshRate(status, goal))
      return [
        annualRate,
        cell(entry.status?.annual ?? 0, entry.goal?.annual ?? 0),
        ...[0, 1, 2, 3].map((index) => cell(entry.status?.quarters[index] ?? 0, entry.goal?.quarters[index] ?? 0)),
        ...grid.monthKeys.map((ym) => cell(entry.status?.months[ym] ?? 0, entry.goal?.months[ym] ?? 0)),
      ]
    }
    return [annualRate, ...amountSpan(dshNumbersForView(view, entry, grid.monthKeys), grid.monthKeys)]
  }
  const body: DelimitedCell[][] = []
  for (const team of grid.teams) {
    body.push([teamCopyLabel(team.team), null, ...cellsFor(team)])
    for (const member of team.members) body.push([teamCopyLabel(team.team), member.member, ...cellsFor(member)])
  }
  return [header, ...body]
}

/**
 * 월별 페이스 → TSV 행. 열 = 구분 · 단위 · 회계월(당월 표시). 금액 행은 원값 ¥, 달성률 행은 %.
 * 아직 안 온 달의 실적 0 달성률은 화면처럼 빈 칸(미달 판정이 아니다).
 */
export function buildDshPaceTsvRows(pace: DshMonthlyPaceData): DelimitedCell[][] {
  const header: DelimitedCell[] = [
    "구분",
    "단위",
    ...pace.months.map((month) => dshCopyMonthHeader(month.ym, month.isCurrent ? "(당월)" : "")),
  ]
  const futureRate = (pct: number | null, status: number, future: boolean) => (future && status === 0 ? null : pctCell(pct))
  return [
    header,
    ["목표", "¥", ...pace.months.map((month) => won(month.goal))],
    ["실적", "¥", ...pace.months.map((month) => won(month.status))],
    ["Gap", "¥", ...pace.months.map((month) => won(month.gap))],
    ["달성률", "%", ...pace.months.map((month) => futureRate(month.pct, month.status, month.isFuture))],
    ["누적 목표", "¥", ...pace.months.map((month) => won(month.cumGoal))],
    ["누적 실적", "¥", ...pace.months.map((month) => won(month.cumStatus))],
    ["누적 달성률", "%", ...pace.months.map((month) => futureRate(month.cumPct, month.cumStatus, month.isFuture))],
  ]
}

/** 복사 첫 줄 — "카드 · 보기 · 단위 · 원천" (빈 항목은 뺀다). */
export function dshCopyCaption(parts: ReadonlyArray<string | null | undefined | false>): string {
  return parts.filter((part): part is string => typeof part === "string" && part.trim().length > 0).join(" · ")
}
