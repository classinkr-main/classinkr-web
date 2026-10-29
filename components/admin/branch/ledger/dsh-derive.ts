// 장부 DSH 렌즈 공용 순수 파생 모듈 — 진도 개요(DshProgressOverview)·월별 페이스(DshMonthlyPace)·
// 팀·멤버 그리드(DshTeamGrid)·수치 그리드(DshNumericGrid의 집계/Rate 뷰)가 공유한다.
// JSX·컴포넌트 의존 없이 순수 함수와 표기 규약 상수만 둔다 — vitest가 직접 단위 테스트한다
// (tests/branch/dsh-derive.test.ts · dsh-progress.test.tsx · dsh-team-grid.test.ts ·
// dsh-numeric-grid-aggregate.test.ts).
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

// Goal/Status/Gap 뷰의 수치 묶음 — goal/status는 해당 kind가 시트에 없으면 null(전부 "–"), gap은 한쪽만
// 있어도 0으로 간주해 전개한다(수치 그리드 Gap 규약과 동일). 팀 그리드 표시와 TSV 복사(dsh-export)가 공유.
export function dshNumbersForView(
  view: "goal" | "status" | "gap",
  entry: { goal: DshNumbers | null; status: DshNumbers | null },
  monthKeys: string[],
): DshNumbers | null {
  if (view === "goal") return entry.goal
  if (view === "status") return entry.status
  if (!entry.goal && !entry.status) return null
  return subtractDshNumbers(entry.status ?? emptyDshNumbers(), entry.goal ?? emptyDshNumbers(), monthKeys)
}

// ── breakdown 중복 제거(최대-annual 채택) — 모든 파생의 단일 진입점 ──────────
// 구현은 lib/branch/dsh-dedupe.ts로 이동했다(SSOT — summary 라우트 deal_mix도 같은
// 함수를 쓴다). 기존 소비처(DshNumericGrid·테스트) 임포트 경로 보존을 위해 재노출한다.

export { dedupeDshByKind }
export type { DshDedupeResult } from "@/lib/branch/dsh-dedupe"

function sumRows(rows: Iterable<BranchDshBreakdownRow>): DshNumbers {
  const total = emptyDshNumbers()
  for (const row of rows) addDshNumbers(total, row)
  return total
}

// 전사(Team KR) 합계 — 중복 제거 후 콤보 전체를 합산한 Goal/Status 한 쌍.
// 진도 개요·월별 페이스가 공유하는 기반 집계다.
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

// 좁은 자리(월별 막대 머리·차트 라벨)용 정수 달성률 — 같은 null 규약("–").
export function formatDshRateShort(pct: number | null): string {
  if (pct == null) return "–"
  return `${Math.round(pct)}%`
}

// ── 표기 규약(DSH 계열 카드 공통) ────────────────────────────────────────────
// DshNumericGrid가 확립한 검수용 밀도 규약의 단일 소스 — 셀 클래스·단위 천 표기·
// 원값 title 병기·월 라벨을 신규 카드(진도 개요·월별 페이스·팀 그리드)가 그대로 공유한다.

export const DSH_CELL = "whitespace-nowrap border-b border-r border-[rgba(0,0,0,0.08)] px-2.5 py-1.5 text-right"

// 단위 천 — 시트 원값을 1,000으로 나눠 정수 표기한다. -500 < 값 < 0 은 반올림이 -0이 되어 빨간 "-0"으로
// 찍혔다(라운드 5 D-11) — `|| 0`으로 -0·NaN을 0으로 접는다(음수 빨강 판정은 호출부가 원값으로 따로 한다).
export function formatDshThousands(value: number): string {
  return (Math.round(value / 1000) || 0).toLocaleString("ko-KR")
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

// ── 지표 공통 형태 ───────────────────────────────────────────────────────────

export interface DshMetricTriple {
  goal: number
  status: number
  pct: number | null
}

export interface DshCompositionSegment {
  label: string
  value: number
}

/** 실적(Status) 구성비 — 축마다 항목 순서가 고정이다(채널 축은 "(미구분)"이 끝). */
export interface DshComposition {
  swHw: DshCompositionSegment[]
  newRenew: DshCompositionSegment[]
  channel: DshCompositionSegment[]
}

export interface DshRemainingPace {
  /** 연간 목표 − 연간 실적(시트 annual 그대로) — 음수면 이미 초과 달성. */
  amount: number
  /** 당월 포함 잔여 회계월 수 — monthKeys 중 ymKey(now) 이상인 달의 개수. */
  monthsLeft: number
  /** amount>0 && monthsLeft>0 → amount/monthsLeft. amount≤0 → 0(이미 달성).
      monthsLeft=0(회계연도 종료 후 조회) → null(페이스 산정 불가). */
  monthlyNeeded: number | null
}

// 남은 목표·필요 페이스 — 잔여 회계월은 당월 포함(미래 FY를 보고 있으면 12개 전부, 종료된 FY면
// 0개). 진도 개요(deriveDshProgress)가 쓴다.
function remainingPace(goalAnnual: number, statusAnnual: number, monthKeys: string[], nowYm: string): DshRemainingPace {
  const monthsLeft = monthKeys.filter((ym) => ym >= nowYm).length
  const amount = goalAnnual - statusAnnual
  const monthlyNeeded = amount <= 0 ? 0 : monthsLeft > 0 ? amount / monthsLeft : null
  return { amount, monthsLeft, monthlyNeeded }
}

// ── 기간 스코프 ──────────────────────────────────────────────────────────────
// now는 UTC 기준으로 해석한다(fiscal.ts·summary 라우트와 동일 규약 — KST 자정 부근 월 경계
// 표류를 서버와 맞춘다). 분기·월 스코프는 "오늘"이 속한 현재 회계분기/회계월 고정이다 —
// 과거 기간 탐색은 월별 페이스·수치 그리드가 담당한다.

// 진도 히어로 기간 토글 스코프. W(주)는 DSH 시트에 주 단위 목표/실적이 없어 breakdown이 아니라
// summary deal_mix의 주간 실적(deriveDshWeeklyFromDealMix)을 쓴다 — 아래 주석 참조.
export type DshBandScope = "W" | "M" | "Q" | "Y"

// 구성별·팀/멤버 달성 기간 토글 스코프(연간/현재 분기/현재 월).
export type DshProgressScope = "M" | "Q" | "Y"

// 연간/현재 분기/현재 월 값 하나를 고른다 — 월 키가 창 밖(null)이면 0.
export function pickScopedValue(row: DshNumbersLike, scope: DshProgressScope, quarterIndex: number, ym: string | null): number {
  if (scope === "Y") return row.annual
  if (scope === "Q") return row.quarters[quarterIndex] ?? 0
  return ym ? row.months[ym] ?? 0 : 0
}

// pickScopedValue 좌표 — 현재 회계분기 인덱스(0~3)와, 오늘이 회계월 창 안일 때만 현재 월 키.
function scopeCoordinates(monthKeys: string[], now: Date): { quarterIndex: number; ym: string | null } {
  const nowYm = ymKey(now)
  return { quarterIndex: fiscalQuarter(now.getUTCMonth() + 1) - 1, ym: monthKeys.includes(nowYm) ? nowYm : null }
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
  composition: DshComposition
}

// 주간 뷰의 데이터 진실: DSH 시트에는 주 단위 목표/실적이 없다. summary deal_mix의
// week_actual(REV 딜 first_payment가 이번 주(월요일 시작, UTC)에 잡힌 계약 금액 —
// app/api/admin/branch/summary/route.ts aggregateWeekly)을 그대로 쓴다. 따라서
// ① 주 목표·달성률은 존재하지 않는다(합성 금지) ② summary 요청의 팀 필터를 따른다
// (breakdown 기반 M/Q/Y가 전사 고정인 것과 다름 — 히어로 캡션에 명시할 것)
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
  return {
    months: monthlyPaceRows(monthKeys, goal, status, ymKey(now)),
    annual: {
      goal: goal.annual,
      status: status.annual,
      gap: status.annual - goal.annual,
      pct: dshRate(status.annual, goal.annual),
    },
  }
}

// 회계월 열 전개 — 월별 페이스 표와 진도 개요의 월별 막대가 같은 행을 쓴다.
function monthlyPaceRows(monthKeys: string[], goal: DshNumbersLike, status: DshNumbersLike, nowYm: string): DshMonthPace[] {
  let cumGoal = 0
  let cumStatus = 0
  return monthKeys.map((ym): DshMonthPace => {
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

// ── 진도 개요 파생(시안 "매출시트 DSH 1a", 2026-10) ───────────────────────────────
// 연간 진도 히어로·월별 목표 대비 실적·이번 달/현재 분기 카드·구성별 달성·팀/멤버 달성이 공유한다.
// 기대 진도 = 기간 경과율(오늘 포함 지난 일수 ÷ 기간 일수) — 목표가 기간에 고르게 깔렸다고 볼 때
// "지금쯤 와 있어야 할" 달성률이다. now는 다른 파생과 같이 UTC 일자로 해석한다.

const DAY_MS = 86_400_000

export interface DshTotals {
  monthKeys: string[]
  goal: DshNumbers
  status: DshNumbers
}

// 개인 범위(lib/branch/personal-scope.ts scopeDshToManager)는 breakdown을 비우고 개인 행을
// ALL 팀 행으로 복제해 보낸다 — 그 ALL 행이 곧 개인 합계다. 전사 범위는 aggregateDshTotals를 쓴다.
export function dshTotalsFromRows(rows: BranchDshRow[]): DshTotals | null {
  const grid = buildDshTeamGrid(rows)
  const all = grid.teams.find((team) => team.team === "ALL")
  if (!all || (!all.goal && !all.status)) return null
  return { monthKeys: grid.monthKeys, goal: all.goal ?? emptyDshNumbers(), status: all.status ?? emptyDshNumbers() }
}

export interface DshElapsedPeriod {
  /** 0~100 — 기간 시작 전이면 0, 끝났으면 100. */
  pct: number
  /** 오늘 뒤로 남은 일수(오늘이 기간 밖이면 0). */
  daysLeft: number
}

export interface DshElapsed {
  year: DshElapsedPeriod
  quarter: DshElapsedPeriod
  month: DshElapsedPeriod
  /** 마커 라벨용 "10/21". */
  todayLabel: string
}

function elapsedPeriod(startMs: number, endMs: number, today: number): DshElapsedPeriod {
  const start = startMs / DAY_MS
  const end = endMs / DAY_MS
  const done = Math.min(end - start, Math.max(0, today - start + 1))
  return { pct: (done / (end - start)) * 100, daysLeft: today >= start && today < end ? end - today - 1 : 0 }
}

// 오늘이 속한 회계분기의 첫 달(0-based) — Q1=4월, Q2=7월, Q3=10월, Q4=1월.
function quarterStartMonth(now: Date): number {
  return [3, 6, 9, 0][fiscalQuarter(now.getUTCMonth() + 1) - 1]
}

// 연도는 데이터의 회계연도 기준, 분기·월은 오늘이 속한 기간 기준(기간 스코프 규약과 같은 기준).
export function dshElapsed(now: Date, fiscalYear: number): DshElapsed {
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) / DAY_MS
  const year = now.getUTCFullYear()
  const month0 = now.getUTCMonth()
  const qStart = quarterStartMonth(now)
  return {
    year: elapsedPeriod(Date.UTC(fiscalYear, 3, 1), Date.UTC(fiscalYear + 1, 3, 1), today),
    quarter: elapsedPeriod(Date.UTC(year, qStart, 1), Date.UTC(year, qStart + 3, 1), today),
    month: elapsedPeriod(Date.UTC(year, month0, 1), Date.UTC(year, month0 + 1, 1), today),
    todayLabel: `${month0 + 1}/${now.getUTCDate()}`,
  }
}

// 오늘이 속한 회계분기의 회계월 키 3개(예: 2026-10 → 10·11·12월).
export function dshCurrentQuarterMonths(now: Date): string[] {
  const qStart = quarterStartMonth(now)
  return [0, 1, 2].map((offset) => ymKey(new Date(Date.UTC(now.getUTCFullYear(), qStart + offset, 1))))
}

export interface DshProgress {
  fiscalYear: number
  currentQuarter: 1 | 2 | 3 | 4
  /** ymKey(now)가 회계월 창 안일 때만 채워진다(창 밖이면 null → 월 카드 "범위 밖"). */
  currentMonthKey: string | null
  annual: DshMetricTriple
  quarter: DshMetricTriple
  month: DshMetricTriple
  remaining: DshRemainingPace
  months: DshMonthPace[]
  /** 회계연도 첫 달 → 당월 누적. 당월이 창 밖이면 null. */
  toDate: DshMetricTriple | null
  /** 현재 분기의 미래 월에 이미 잡힌 실적(선반영) — 분기 실적에 들어 있으므로 카드에서 밝힌다. */
  prebooked: { months: string[]; amount: number }
  elapsed: DshElapsed
}

export function deriveDshProgress(totals: DshTotals, now: Date): DshProgress {
  const { monthKeys, goal, status } = totals
  const nowYm = ymKey(now)
  const currentQuarter = fiscalQuarter(now.getUTCMonth() + 1)
  const currentMonthKey = monthKeys.includes(nowYm) ? nowYm : null
  // FY는 창의 첫 달(4월)에서 읽는다 — 창이 비면(월 키 없는 극단) 오늘 기준 폴백.
  const fiscalYear = monthKeys.length > 0 ? Number(monthKeys[0].slice(0, 4)) : fyOf(now)
  const triple = (goalValue: number, statusValue: number): DshMetricTriple => ({
    goal: goalValue,
    status: statusValue,
    pct: dshRate(statusValue, goalValue),
  })
  const months = monthlyPaceRows(monthKeys, goal, status, nowYm)
  const current = months.find((month) => month.isCurrent)
  const quarterMonths = new Set(dshCurrentQuarterMonths(now))
  const prebooked = months.filter((month) => month.isFuture && quarterMonths.has(month.ym) && month.status !== 0)
  return {
    fiscalYear,
    currentQuarter,
    currentMonthKey,
    annual: triple(goal.annual, status.annual),
    quarter: triple(goal.quarters[currentQuarter - 1] ?? 0, status.quarters[currentQuarter - 1] ?? 0),
    month: triple(
      currentMonthKey ? goal.months[currentMonthKey] ?? 0 : 0,
      currentMonthKey ? status.months[currentMonthKey] ?? 0 : 0,
    ),
    remaining: remainingPace(goal.annual, status.annual, monthKeys, nowYm),
    months,
    toDate: current ? triple(current.cumGoal, current.cumStatus) : null,
    prebooked: {
      months: prebooked.map((month) => month.ym),
      amount: prebooked.reduce((acc, month) => acc + month.status, 0),
    },
    elapsed: dshElapsed(now, fiscalYear),
  }
}

export interface DshSegmentRow {
  key: string
  /** "New · Direct" — 상태 유형 · 채널. */
  label: string
  goal: number
  status: number
  pct: number | null
}

export interface DshSegmentGroup {
  category: string
  goal: number
  status: number
  pct: number | null
  rows: DshSegmentRow[]
}

const CATEGORY_ORDER = ["Software", "Hardware"]
const STATUS_TYPE_ORDER = ["New", "Renew"]
const CHANNEL_ORDER = ["Direct", "Channel"]

function orderRank(order: readonly string[], value: string): number {
  const index = order.indexOf(value)
  return index === -1 ? order.length : index
}

// 구성별 달성 — 중복 제거된 콤보(category × status_type × channel)를 카테고리로 묶고 스코프 값(연간/
// 현재 분기/현재 월)을 고른다. 행 구성은 연간 기준으로 고정한다 — 연간 목표·실적이 모두 0인 콤보
// (시트의 빈 조합)만 빼므로 스코프를 바꿔도 행이 들고 나지 않는다(그 기간 목표가 없으면 달성률 "–").
// 순서는 시트 배치와 같다: Software → Hardware, New → Renew, Direct → Channel → 그 외("(미구분)" 등은
// 이름순).
export function deriveDshSegments(
  breakdown: BranchDshBreakdownRow[],
  now: Date,
  scope: DshProgressScope,
): DshSegmentGroup[] {
  const deduped = dedupeDshByKind(breakdown)
  const { quarterIndex, ym } = scopeCoordinates(deduped.monthKeys, now)
  type Combo = { category: string; statusType: string; channel: string; goal: number; status: number; inSheet: boolean }
  const combos = new Map<string, Combo>()
  for (const kind of ["goal", "status"] as const) {
    for (const [key, row] of deduped[kind]) {
      const combo = combos.get(key) ?? {
        category: row.category,
        statusType: row.status_type,
        channel: row.channel,
        goal: 0,
        status: 0,
        inSheet: false,
      }
      combo[kind] = pickScopedValue(row, scope, quarterIndex, ym)
      combo.inSheet ||= row.annual !== 0
      combos.set(key, combo)
    }
  }
  const sorted = [...combos.entries()]
    .filter(([, combo]) => combo.inSheet)
    .sort(
      ([, a], [, b]) =>
        orderRank(CATEGORY_ORDER, a.category) - orderRank(CATEGORY_ORDER, b.category) ||
        a.category.localeCompare(b.category) ||
        orderRank(STATUS_TYPE_ORDER, a.statusType) - orderRank(STATUS_TYPE_ORDER, b.statusType) ||
        a.statusType.localeCompare(b.statusType) ||
        orderRank(CHANNEL_ORDER, a.channel) - orderRank(CHANNEL_ORDER, b.channel) ||
        a.channel.localeCompare(b.channel),
    )
  const groups: DshSegmentGroup[] = []
  for (const [key, combo] of sorted) {
    let group = groups.find((candidate) => candidate.category === combo.category)
    if (!group) {
      group = { category: combo.category, goal: 0, status: 0, pct: null, rows: [] }
      groups.push(group)
    }
    group.goal += combo.goal
    group.status += combo.status
    group.rows.push({
      key,
      label: `${combo.statusType} · ${combo.channel}`,
      goal: combo.goal,
      status: combo.status,
      pct: dshRate(combo.status, combo.goal),
    })
  }
  for (const group of groups) group.pct = dshRate(group.status, group.goal)
  return groups
}

// 실적(Status) 구성비 — 중복 제거된 Status 콤보의 스코프 값을 축별로 합산한다. "(미구분)" = 파서가
// 채널 공란 행을 버리지 않고 채택한 값(lib/branch/parsers/dsh.ts 2차 패스 주석 참조).
export function deriveDshComposition(
  breakdown: BranchDshBreakdownRow[],
  now: Date,
  scope: DshProgressScope,
): DshComposition | null {
  if (breakdown.length === 0) return null
  const deduped = dedupeDshByKind(breakdown)
  const { quarterIndex, ym } = scopeCoordinates(deduped.monthKeys, now)
  const segment = (label: string, pred: (row: BranchDshBreakdownRow) => boolean): DshCompositionSegment => {
    let value = 0
    for (const row of deduped.status.values()) if (pred(row)) value += pickScopedValue(row, scope, quarterIndex, ym)
    return { label, value }
  }
  return {
    swHw: [segment("SW", (row) => row.category === "Software"), segment("HW", (row) => row.category === "Hardware")],
    newRenew: [segment("New", (row) => row.status_type === "New"), segment("Renew", (row) => row.status_type === "Renew")],
    channel: [
      segment("Direct", (row) => row.channel === "Direct"),
      segment("Channel", (row) => row.channel === "Channel"),
      segment("(미구분)", (row) => row.channel !== "Direct" && row.channel !== "Channel"),
    ],
  }
}

export interface DshScopedPair {
  /** 해당 kind가 시트에 없으면 null("–") — 0으로 합성하지 않는다. */
  goal: number | null
  status: number | null
  pct: number | null
}

export interface DshTeamProgress extends DshScopedPair {
  team: string
  members: Array<DshScopedPair & { member: string }>
}

// 팀·멤버 달성 — buildDshTeamGrid 트리(첫 행 채택, 합산 금지)에서 스코프 값(연간/현재 분기/
// 현재 월)을 고른다. 월 스코프에서 오늘이 회계월 창 밖이면 값이 없다(전부 "–").
export function deriveDshTeamProgress(rows: BranchDshRow[], now: Date, scope: DshProgressScope): DshTeamProgress[] {
  const { monthKeys, teams } = buildDshTeamGrid(rows)
  const { quarterIndex, ym } = scopeCoordinates(monthKeys, now)
  const outOfRange = scope === "M" && ym == null
  const pick = (numbers: DshNumbers | null) =>
    numbers == null || outOfRange ? null : pickScopedValue(numbers, scope, quarterIndex, ym)
  const pair = (entry: { goal: DshNumbers | null; status: DshNumbers | null }): DshScopedPair => {
    const goal = pick(entry.goal)
    const status = pick(entry.status)
    return { goal, status, pct: dshRate(status ?? 0, goal ?? 0) }
  }
  return teams.map((team) => ({
    team: team.team,
    ...pair(team),
    members: team.members.map((member) => ({ member: member.member, ...pair(member) })),
  }))
}
