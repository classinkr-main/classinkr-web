// 장부 DSH 렌즈 공용 순수 파생 모듈 — 지표 밴드(DshMetricsBand)·월별 페이스(DshMonthlyPace)·
// 팀·멤버 그리드(DshTeamGrid)·수치 그리드(DshNumericGrid의 집계/Rate 뷰)가 공유한다.
// JSX·컴포넌트 의존 없이 순수 함수와 표기 규약 상수만 둔다 — vitest가 직접 단위 테스트한다
// (tests/branch/dsh-derive.test.ts · dsh-team-grid.test.ts · dsh-numeric-grid-aggregate.test.ts).
//
// 절대 규칙(3중 계상 방지): breakdown에는 같은 (kind, category, status_type, channel) 콤보가
// 스코프별로 반복된다(전사 + 팀/멤버 섹션 — 파서가 시트의 모든 섹션을 훑고, 액티브 임포트
// 소스는 순서까지 뒤섞임). 전사 행은 부분 행들의 합이라 annual이 항상 최대이므로, 합산 대신
// 최대 annual 행 하나를 채택한다. 이 모듈의 모든 breakdown 파생은 dedupeDshByKind를 유일한
// 진입점으로 쓴다 — 새 파생을 추가할 때도 raw breakdown을 직접 합산하지 말 것.

import { dedupeDshByKind } from "@/lib/branch/dsh-dedupe"
import { fiscalQuarter, fyOf, ymKey } from "@/lib/branch/fiscal"
import { cnyExact } from "@/lib/branch/money-format"
import type { BranchDealMix, BranchDshBreakdownRow, BranchDshRow } from "../types"

// ── 수치 묶음(연간/분기/월) 공통 형태 ────────────────────────────────────────

export interface DshNumbers {
  annual: number
  quarters: [number, number, number, number]
  months: Record<string, number>
}

// 합산 소스는 구조만 맞으면 된다(GridRow·BranchDshBreakdownRow·BranchDshRow 전부 수용).
export interface DshNumbersLike {
  annual: number
  quarters: readonly number[]
  months: Record<string, number>
}

export function emptyDshNumbers(): DshNumbers {
  return { annual: 0, quarters: [0, 0, 0, 0], months: {} }
}

export function addDshNumbers(target: DshNumbers, source: DshNumbersLike) {
  target.annual += source.annual
  for (let i = 0; i < 4; i++) target.quarters[i] += source.quarters[i] ?? 0
  for (const [ym, value] of Object.entries(source.months)) {
    target.months[ym] = (target.months[ym] ?? 0) + value
  }
}

// Gap = Status − Goal. 한쪽에만 있는 월 키도 0으로 간주해 누락 없이 전개한다.
export function subtractDshNumbers(status: DshNumbersLike, goal: DshNumbersLike, monthKeys: string[]): DshNumbers {
  const months: Record<string, number> = {}
  for (const ym of monthKeys) months[ym] = (status.months[ym] ?? 0) - (goal.months[ym] ?? 0)
  return {
    annual: status.annual - goal.annual,
    quarters: [0, 1, 2, 3].map((i) => (status.quarters[i] ?? 0) - (goal.quarters[i] ?? 0)) as DshNumbers["quarters"],
    months,
  }
}

// ── breakdown 중복 제거(최대-annual 채택) — 모든 파생의 단일 진입점 ──────────
// 구현은 lib/branch/dsh-dedupe.ts로 이동했다(SSOT — summary 라우트 deal_mix도 같은
// 함수를 쓴다). 기존 소비처(DshNumericGrid·테스트) 임포트 경로 보존을 위해 재노출한다.

export { dedupeDshByKind }
export type { DshDedupeResult } from "@/lib/branch/dsh-dedupe"

function sumRows(
  rows: Iterable<BranchDshBreakdownRow>,
  pred?: (row: BranchDshBreakdownRow) => boolean,
): DshNumbers {
  const total = emptyDshNumbers()
  for (const row of rows) {
    if (pred && !pred(row)) continue
    addDshNumbers(total, row)
  }
  return total
}

// 전사(Team KR) 합계 — 중복 제거 후 콤보 전체를 합산한 Goal/Status 한 쌍.
// 지표 밴드·월별 페이스가 공유하는 기반 집계다.
export function aggregateDshTotals(breakdown: BranchDshBreakdownRow[]): {
  monthKeys: string[]
  goal: DshNumbers
  status: DshNumbers
} {
  const deduped = dedupeDshByKind(breakdown)
  return {
    monthKeys: deduped.monthKeys,
    goal: sumRows(deduped.goal.values()),
    status: sumRows(deduped.status.values()),
  }
}

// ── 달성률(Rate) 규약 ────────────────────────────────────────────────────────

// 달성률 = Status ÷ Goal (%). 목표가 0 이하(결측 포함)면 null — 표시는 "–"로,
// 0%로 왜곡하지 않는다(목표 없는 셀의 실적은 "미달"이 아니다).
export function dshRate(status: number, goal: number): number | null {
  if (!(goal > 0)) return null
  return (status / goal) * 100
}

// 달성률 색 경계(결정 기록): ≥100% 달성 #084734 · 70~100% 주의 #A8741A · <70% 미달 #B43E3E.
// 기존 톤(음수 Gap 빨강 #B43E3E · 목표 초과 그린 #084734 · Warning #A8741A)과 일관.
// null(목표 없음)은 흐린 회색 — 판정 자체가 성립하지 않는 셀임을 표기한다.
export function dshRateToneClass(pct: number | null): string {
  if (pct == null) return "text-[#C9C5BF]"
  if (pct >= 100) return "text-[#084734]"
  if (pct >= 70) return "text-[#A8741A]"
  return "text-[#B43E3E]"
}

export function formatDshRate(pct: number | null): string {
  if (pct == null) return "–"
  return `${pct.toLocaleString("ko-KR", { maximumFractionDigits: 1, minimumFractionDigits: 1 })}%`
}

// ── 표기 규약(DSH 계열 카드 공통) ────────────────────────────────────────────
// DshNumericGrid가 확립한 검수용 밀도 규약의 단일 소스 — 셀 클래스·단위 천 표기·
// 원값 title 병기·월 라벨을 신규 카드(지표 밴드·월별 페이스·팀 그리드)가 그대로 공유한다.

export const DSH_CELL = "whitespace-nowrap border-b border-r border-[rgba(0,0,0,0.08)] px-2.5 py-1.5 text-right"

// 단위 천 — 시트 원값을 1,000으로 나눠 정수 표기한다.
export function formatDshThousands(value: number): string {
  return Math.round(value / 1000).toLocaleString("ko-KR")
}

// 원값 title 병기 — 표는 천 단위 반올림 표기이므로 title에 반올림 없는 원값(¥)을 병기한다.
export function dshExactTitle(value: number): string {
  return `¥${cnyExact(value)} · 시트 원값 · 반올림 없음`
}

// Rate 셀 title — 달성률 표기의 원값 쌍(실적·목표)을 반올림 없이 병기한다.
export function dshRateTitle(status: number, goal: number): string {
  return `실적 ¥${cnyExact(status)} ÷ 목표 ¥${cnyExact(goal)} · 시트 원값`
}

export function dshMonthLabel(ym: string): string {
  return `${Number(ym.slice(5))}월`
}

// FY 라벨 — 시트 관례(FY26-27)를 따른다. fy는 회계연도 시작 연도(4월 기준).
export function dshFiscalYearLabel(fy: number): string {
  const startYY = String(fy % 100).padStart(2, "0")
  const endYY = String((fy + 1) % 100).padStart(2, "0")
  return `FY${startYY}-${endYY}`
}

// ── 지표 밴드 파생 ───────────────────────────────────────────────────────────

export interface DshMetricTriple {
  goal: number
  status: number
  pct: number | null
}

export interface DshCompositionSegment {
  label: string
  value: number
}

export interface DshMetricsBandData {
  monthKeys: string[]
  fiscalYear: number
  currentQuarter: 1 | 2 | 3 | 4
  /** ymKey(now)가 breakdown 회계월 창 안에 있을 때만 채워진다(창 밖이면 null → 월 타일 "–"). */
  currentMonthKey: string | null
  annual: DshMetricTriple & { gap: number }
  quarter: DshMetricTriple
  month: DshMetricTriple
  software: DshMetricTriple
  hardware: DshMetricTriple
  newBiz: DshMetricTriple
  renew: DshMetricTriple
  remaining: {
    /** 연간 목표 − 연간 실적(시트 annual 그대로) — 음수면 이미 초과 달성. */
    amount: number
    /** 당월 포함 잔여 회계월 수 — monthKeys 중 ymKey(now) 이상인 달의 개수. */
    monthsLeft: number
    /** amount>0 && monthsLeft>0 → amount/monthsLeft. amount≤0 → 0(이미 달성).
        monthsLeft=0(회계연도 종료 후 조회) → null(페이스 산정 불가). */
    monthlyNeeded: number | null
  }
  /** 실적(Status) 연간 기준 구성비 — 첫 항목이 그린 액센트, 나머지는 뉴트럴 단계로 그린다. */
  composition: {
    swHw: DshCompositionSegment[]
    newRenew: DshCompositionSegment[]
    channel: DshCompositionSegment[]
  }
}

// 지표 밴드 파생 — 전부 breakdown에서 클라이언트 계산(신규 fetch 없음). now는 UTC 기준으로
// 해석한다(fiscal.ts·summary 라우트와 동일 규약 — KST 자정 부근 월 경계 표류를 서버와 맞춘다).
export function deriveDshMetricsBand(breakdown: BranchDshBreakdownRow[], now: Date): DshMetricsBandData | null {
  if (breakdown.length === 0) return null
  const deduped = dedupeDshByKind(breakdown)
  const { monthKeys } = deduped
  const goalAll = sumRows(deduped.goal.values())
  const statusAll = sumRows(deduped.status.values())

  const currentQuarter = fiscalQuarter(now.getUTCMonth() + 1)
  const nowYm = ymKey(now)
  const currentMonthKey = monthKeys.includes(nowYm) ? nowYm : null

  const triple = (goal: number, status: number): DshMetricTriple => ({ goal, status, pct: dshRate(status, goal) })
  // 차원 타일(SW/HW/New/Renew)은 연간 기준 — 중복 제거된 콤보를 술어로 걸러 합산한다.
  const dim = (pred: (row: BranchDshBreakdownRow) => boolean): DshMetricTriple =>
    triple(sumRows(deduped.goal.values(), pred).annual, sumRows(deduped.status.values(), pred).annual)
  const segment = (label: string, pred: (row: BranchDshBreakdownRow) => boolean): DshCompositionSegment => ({
    label,
    value: sumRows(deduped.status.values(), pred).annual,
  })

  const quarterIndex = currentQuarter - 1
  // 잔여 회계월(당월 포함) — 미래 FY 데이터를 보고 있으면 12개 전부, 종료된 FY면 0개.
  const monthsLeft = monthKeys.filter((ym) => ym >= nowYm).length
  const remainingAmount = goalAll.annual - statusAll.annual
  const monthlyNeeded = remainingAmount <= 0 ? 0 : monthsLeft > 0 ? remainingAmount / monthsLeft : null

  return {
    monthKeys,
    // FY는 breakdown 창의 첫 달(4월)에서 읽는다 — 창이 비면(월 키 없는 극단) 오늘 기준 폴백.
    fiscalYear: monthKeys.length > 0 ? Number(monthKeys[0].slice(0, 4)) : fyOf(now),
    currentQuarter,
    currentMonthKey,
    annual: { ...triple(goalAll.annual, statusAll.annual), gap: statusAll.annual - goalAll.annual },
    quarter: triple(goalAll.quarters[quarterIndex] ?? 0, statusAll.quarters[quarterIndex] ?? 0),
    month: triple(
      currentMonthKey ? goalAll.months[currentMonthKey] ?? 0 : 0,
      currentMonthKey ? statusAll.months[currentMonthKey] ?? 0 : 0,
    ),
    software: dim((row) => row.category === "Software"),
    hardware: dim((row) => row.category === "Hardware"),
    newBiz: dim((row) => row.status_type === "New"),
    renew: dim((row) => row.status_type === "Renew"),
    remaining: { amount: remainingAmount, monthsLeft, monthlyNeeded },
    composition: {
      swHw: [
        segment("SW", (row) => row.category === "Software"),
        segment("HW", (row) => row.category === "Hardware"),
      ],
      newRenew: [
        segment("New", (row) => row.status_type === "New"),
        segment("Renew", (row) => row.status_type === "Renew"),
      ],
      channel: [
        segment("Direct", (row) => row.channel === "Direct"),
        segment("Channel", (row) => row.channel === "Channel"),
        // "(미구분)" = 파서가 채널 공란 행을 버리지 않고 채택한 값(dsh.ts 2차 패스 주석 참조).
        segment("(미구분)", (row) => row.channel !== "Direct" && row.channel !== "Channel"),
      ],
    },
  }
}

// ── 스코프(월/분기/연간) 지표 파생 — 지표 밴드 기간 토글용 ───────────────────

// 밴드 기간 토글 스코프. W(주)는 DSH 시트에 주 단위 목표/실적이 없어 breakdown이 아니라
// summary deal_mix의 주간 실적(deriveDshWeeklyFromDealMix)을 쓴다 — 아래 주석 참조.
export type DshBandScope = "W" | "M" | "Q" | "Y"

export interface DshScopedMetrics {
  /** 타일 라벨용 스코프 표기 — "연간" | "Q2" | "7월" | "범위 밖". */
  scopeLabel: string
  total: DshMetricTriple & { gap: number }
  software: DshMetricTriple
  hardware: DshMetricTriple
  newBiz: DshMetricTriple
  renew: DshMetricTriple
  direct: DshMetricTriple
  channel: DshMetricTriple
  composition: DshMetricsBandData["composition"]
}

function pickScopedValue(row: DshNumbersLike, scope: "M" | "Q" | "Y", quarterIndex: number, ym: string | null): number {
  if (scope === "Y") return row.annual
  if (scope === "Q") return row.quarters[quarterIndex] ?? 0
  return ym ? row.months[ym] ?? 0 : 0
}

// 월/분기/연간 스코프의 차원별(전사/SW/HW/New/Renew/Direct/Channel) 목표·실적·달성률 —
// 전부 dedupeDshByKind를 거친다(3중 계상 방지 절대 규칙). 기준 기간은 "오늘"(UTC)이 속한
// 현재 회계분기/회계월 고정 — 과거 기간 탐색은 월별 페이스·수치 그리드가 담당한다.
export function deriveDshScopedMetrics(
  breakdown: BranchDshBreakdownRow[],
  now: Date,
  scope: "M" | "Q" | "Y",
): DshScopedMetrics | null {
  if (breakdown.length === 0) return null
  const deduped = dedupeDshByKind(breakdown)
  const quarterIndex = fiscalQuarter(now.getUTCMonth() + 1) - 1
  const nowYm = ymKey(now)
  const ym = deduped.monthKeys.includes(nowYm) ? nowYm : null

  const sum = (bucket: Map<string, BranchDshBreakdownRow>, pred?: (row: BranchDshBreakdownRow) => boolean): number => {
    let acc = 0
    for (const row of bucket.values()) {
      if (pred && !pred(row)) continue
      acc += pickScopedValue(row, scope, quarterIndex, ym)
    }
    return acc
  }
  const triple = (pred?: (row: BranchDshBreakdownRow) => boolean): DshMetricTriple => {
    const goal = sum(deduped.goal, pred)
    const status = sum(deduped.status, pred)
    return { goal, status, pct: dshRate(status, goal) }
  }
  const segment = (label: string, pred: (row: BranchDshBreakdownRow) => boolean): DshCompositionSegment => ({
    label,
    value: sum(deduped.status, pred),
  })

  const total = triple()
  return {
    scopeLabel: scope === "Y" ? "연간" : scope === "Q" ? `Q${quarterIndex + 1}` : ym ? dshMonthLabel(ym) : "범위 밖",
    total: { ...total, gap: total.status - total.goal },
    software: triple((row) => row.category === "Software"),
    hardware: triple((row) => row.category === "Hardware"),
    newBiz: triple((row) => row.status_type === "New"),
    renew: triple((row) => row.status_type === "Renew"),
    direct: triple((row) => row.channel === "Direct"),
    channel: triple((row) => row.channel === "Channel"),
    composition: {
      swHw: [
        segment("SW", (row) => row.category === "Software"),
        segment("HW", (row) => row.category === "Hardware"),
      ],
      newRenew: [
        segment("New", (row) => row.status_type === "New"),
        segment("Renew", (row) => row.status_type === "Renew"),
      ],
      channel: [
        segment("Direct", (row) => row.channel === "Direct"),
        segment("Channel", (row) => row.channel === "Channel"),
        segment("(미구분)", (row) => row.channel !== "Direct" && row.channel !== "Channel"),
      ],
    },
  }
}

// ── 주간 지표 파생 (deal_mix 원천) ───────────────────────────────────────────

export interface DshWeeklyDimension {
  actual: number
  /** 주간 합계 대비 구성비(%) — 합계가 0이면 null. */
  share: number | null
}

export interface DshWeeklyDealMetrics {
  total: { actual: number; prevActual: number }
  software: DshWeeklyDimension
  hardware: DshWeeklyDimension
  newBiz: DshWeeklyDimension
  renew: DshWeeklyDimension
  direct: DshWeeklyDimension
  channel: DshWeeklyDimension
  composition: DshMetricsBandData["composition"]
}

// 주간 뷰의 데이터 진실: DSH 시트에는 주 단위 목표/실적이 없다. summary deal_mix의
// week_actual(REV 딜 first_payment가 이번 주(월요일 시작, UTC)에 잡힌 계약 금액 —
// app/api/admin/branch/summary/route.ts aggregateWeekly)을 그대로 쓴다. 따라서
// ① 주 목표·달성률은 존재하지 않는다(합성 금지) ② summary 요청의 팀 필터를 따른다
// (breakdown 기반 M/Q/Y가 전사 고정인 것과 다름 — 밴드 캡션에 명시할 것)
// ③ 채널 축은 Direct/Channel 매핑 딜만 집계된다(미매핑 딜 제외라 SW:HW 합과 다를 수 있음).
export function deriveDshWeeklyFromDealMix(dealMix: BranchDealMix | null | undefined): DshWeeklyDealMetrics | null {
  if (!dealMix) return null
  // weekly_available=false면 축 전체 week_actual이 null(서버 규약) — 주간 뷰 자체를 접는다.
  if (dealMix.meta && !dealMix.meta.by_category.weekly_available) return null
  const week = (slices: { name: string; week_actual?: number | null }[] | undefined, name: string): number => {
    const slice = slices?.find((s) => s.name === name)
    return slice?.week_actual ?? 0
  }
  const prevWeek = (slices: { name: string; prev_week_actual?: number | null }[] | undefined): number =>
    (slices ?? []).reduce((acc, s) => acc + (s.prev_week_actual ?? 0), 0)

  // category 분류기는 전 딜을 Software/Hardware 중 하나로 귀속시킨다(null 없음) —
  // 주간 총액은 category 축 합이 정본이다.
  const software = week(dealMix.by_category, "Software")
  const hardware = week(dealMix.by_category, "Hardware")
  const total = software + hardware
  if (total === 0 && prevWeek(dealMix.by_category) === 0) {
    // 주간 매핑 딜이 있어도 금액이 전부 0이면 표시 가치가 없다 — 빈 상태 문구로 처리.
    return null
  }
  const dim = (actual: number): DshWeeklyDimension => ({ actual, share: total > 0 ? (actual / total) * 100 : null })

  const newBiz = week(dealMix.by_status_type, "New")
  const renew = week(dealMix.by_status_type, "Renew")
  const direct = week(dealMix.by_channel, "Direct")
  const channel = week(dealMix.by_channel, "Channel")
  return {
    total: { actual: total, prevActual: prevWeek(dealMix.by_category) },
    software: dim(software),
    hardware: dim(hardware),
    newBiz: dim(newBiz),
    renew: dim(renew),
    direct: dim(direct),
    channel: dim(channel),
    composition: {
      swHw: [
        { label: "SW", value: software },
        { label: "HW", value: hardware },
      ],
      newRenew: [
        { label: "New", value: newBiz },
        { label: "Renew", value: renew },
      ],
      channel: [
        { label: "Direct", value: direct },
        { label: "Channel", value: channel },
      ],
    },
  }
}

// ── 월별 페이스 파생 ─────────────────────────────────────────────────────────

export interface DshMonthPace {
  ym: string
  goal: number
  status: number
  gap: number
  pct: number | null
  cumGoal: number
  cumStatus: number
  cumPct: number | null
  isCurrent: boolean
  /** ymKey(now)보다 미래의 회계월 — 실적 0이 "미달"이 아니라 "아직 안 온 달"이라 회색 처리 대상. */
  isFuture: boolean
}

export interface DshMonthlyPaceData {
  months: DshMonthPace[]
  annual: { goal: number; status: number; gap: number; pct: number | null }
}

// 월별 페이스 — 전사 합계(aggregateDshTotals) 기반. 열은 breakdown이 실제로 담은 회계월
// 전체(정상 시트면 4월→3월 12개), 누적은 FY 시작부터의 러닝 섬이다.
export function deriveDshMonthlyPace(breakdown: BranchDshBreakdownRow[], now: Date): DshMonthlyPaceData | null {
  if (breakdown.length === 0) return null
  const { monthKeys, goal, status } = aggregateDshTotals(breakdown)
  const nowYm = ymKey(now)
  let cumGoal = 0
  let cumStatus = 0
  const months = monthKeys.map((ym): DshMonthPace => {
    const monthGoal = goal.months[ym] ?? 0
    const monthStatus = status.months[ym] ?? 0
    cumGoal += monthGoal
    cumStatus += monthStatus
    return {
      ym,
      goal: monthGoal,
      status: monthStatus,
      gap: monthStatus - monthGoal,
      pct: dshRate(monthStatus, monthGoal),
      cumGoal,
      cumStatus,
      cumPct: dshRate(cumStatus, cumGoal),
      isCurrent: ym === nowYm,
      // YYYY-MM zero-pad라 문자열 비교로 충분하다.
      isFuture: ym > nowYm,
    }
  })
  return {
    months,
    annual: {
      goal: goal.annual,
      status: status.annual,
      gap: status.annual - goal.annual,
      pct: dshRate(status.annual, goal.annual),
    },
  }
}

// ── 팀·멤버 그리드 파생 ──────────────────────────────────────────────────────

export const DSH_TEAM_ORDER = ["ALL", "BD", "MKT", "CSM"] as const

export interface DshTeamGridMember {
  member: string
  goal: DshNumbers | null
  status: DshNumbers | null
}

export interface DshTeamGridTeam {
  team: string
  goal: DshNumbers | null
  status: DshNumbers | null
  members: DshTeamGridMember[]
}

export interface DshTeamGridData {
  monthKeys: string[]
  teams: DshTeamGridTeam[]
}

// dsh_rows(파서 DshRow 미러)를 팀 → 멤버 트리로 조립한다.
// - 팀 순서는 ALL → BD → MKT → CSM 고정. 시트에 없는 팀은 행 생략(합성 금지 — 숫자가 정본).
//   파서 normalizeTeam 밖의 새 팀 값이 오면 뒤에 그대로 붙는다(무음 드랍 금지).
// - 같은 (team, kind)/(member, kind)가 중복되면 첫 행 채택 — 파서는 팀 행을 (team, kind)당
//   하나로 누적하지만, 방어적으로 합산은 금지한다(breakdown 3중 계상과 같은 계열의 부풀림 방지).
// - 멤버는 시트 등장 순서를 보존해 팀 아래에 묶는다(정렬 재배치 없음 — 시트 대조가 쉽도록).
export function buildDshTeamGrid(rows: BranchDshRow[]): DshTeamGridData {
  const keys = new Set<string>()
  for (const row of rows) for (const ym of Object.keys(row.months)) keys.add(ym)
  const monthKeys = [...keys].sort()

  const toNumbers = (row: BranchDshRow): DshNumbers => {
    const numbers = emptyDshNumbers()
    addDshNumbers(numbers, row)
    return numbers
  }

  const teamEntries = new Map<string, { goal?: DshNumbers; status?: DshNumbers }>()
  const memberEntries = new Map<string, { team: string; member: string; goal?: DshNumbers; status?: DshNumbers }>()
  const memberOrder: string[] = []

  for (const row of rows) {
    if (row.level === "team") {
      const entry = teamEntries.get(row.team) ?? {}
      if (!entry[row.kind]) entry[row.kind] = toNumbers(row)
      teamEntries.set(row.team, entry)
      continue
    }
    // 파서가 팀 매핑에 성공한 멤버 행만 push하므로 team은 항상 채워져 오지만, 방어한다.
    if (!row.member || !row.team) continue
    const key = `${row.team}|${row.member}`
    let entry = memberEntries.get(key)
    if (!entry) {
      entry = { team: row.team, member: row.member }
      memberEntries.set(key, entry)
      memberOrder.push(key)
    }
    if (!entry[row.kind]) entry[row.kind] = toNumbers(row)
  }

  const knownTeams = new Set<string>(DSH_TEAM_ORDER)
  const presentTeams = new Set<string>([
    ...teamEntries.keys(),
    ...[...memberEntries.values()].map((entry) => entry.team),
  ])
  const orderedTeams = [
    ...DSH_TEAM_ORDER.filter((team) => presentTeams.has(team)),
    ...[...presentTeams].filter((team) => !knownTeams.has(team)),
  ]

  const teams: DshTeamGridTeam[] = orderedTeams.map((team) => {
    const teamEntry = teamEntries.get(team)
    const members = memberOrder
      .map((key) => memberEntries.get(key)!)
      .filter((entry) => entry.team === team)
      .map((entry): DshTeamGridMember => ({
        member: entry.member,
        goal: entry.goal ?? null,
        status: entry.status ?? null,
      }))
    return { team, goal: teamEntry?.goal ?? null, status: teamEntry?.status ?? null, members }
  })

  return { monthKeys, teams }
}
