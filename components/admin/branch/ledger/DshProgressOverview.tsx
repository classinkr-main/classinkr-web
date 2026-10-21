"use client"

// 장부 DSH 렌즈 진도 개요(시안 "매출시트 DSH 1a", 2026-10) — 접힌 수치 표들(DshDetailFolds) 위에
// 놓는 시각 요약. 지표 밴드(DshMetricsBand)를 대체한다.
//  ① 연간 진도 히어로 — 기대 진도(기간 경과율) 대비 달성률 + 남은 목표·당월까지 누적
//  ② 월별 목표 대비 실적 막대 + 이번 달·현재 분기 카드
//  ③ 구성별 연간 달성(SW/HW × New/Renew × Direct/Channel) + 실적 구성비
//  ④ 팀·멤버 달성(월/분기/연간 — 팀 행을 누르면 멤버 펼침)
// 파생은 전부 dsh-derive 순수 함수(최대-annual 채택 — 3중 계상 방지)를 쓴다.
// 지표 밴드의 주/월/분기/연도 토글은 히어로 기간 전환으로 보존했다 — 주는 시트에 주 목표가 없어
// summary deal_mix의 REV 확정액만 보여준다(달성률·기대 진도 합성 금지).
// 개인 범위(내 담당)는 summary가 breakdown을 비우므로(scopeDshToManager) 시트 개인 행으로
// 히어로·월별·기간 카드를 그리고, 개인 단위 데이터가 없는 구성별 분해는 생략한다.

import { ChevronDown, ChevronRight } from "lucide-react"
import { useMemo, useState } from "react"
import type { ReactNode } from "react"
import { cnyExact } from "@/lib/branch/money-format"
import { formatMoney } from "@/lib/branch/ledger-format"
import { branchTeamLabel } from "@/lib/branch/current-organization"
import { branchManagerLabel } from "@/lib/branch/personal-scope"
import type { BranchDataSourceInfo, BranchDealMix, BranchDshBreakdownRow, BranchDshRow, Team } from "../types"
import {
  aggregateDshTotals,
  deriveDshMetricsBand,
  deriveDshProgress,
  deriveDshSegments,
  deriveDshTeamProgress,
  deriveDshWeeklyFromDealMix,
  dshCurrentQuarterMonths,
  dshExactTitle,
  dshFiscalYearLabel,
  dshMonthLabel,
  dshRateTitle,
  dshRateToneClass,
  dshTotalsFromRows,
  formatDshRate,
  formatDshRateShort,
  type DshBandScope,
  type DshCompositionSegment,
  type DshMetricTriple,
  type DshMonthPace,
  type DshProgress,
  type DshProgressScope,
  type DshScopedPair,
} from "./dsh-derive"
import { dshSourceLabel } from "./DshNumericGrid"
import { formatSignedMoney, LoadingPanel } from "./shared"

const HERO_SCOPES: Array<{ id: DshBandScope; label: string }> = [
  { id: "W", label: "주" },
  { id: "M", label: "월" },
  { id: "Q", label: "분기" },
  { id: "Y", label: "연도" },
]

const TEAM_SCOPES: Array<{ id: DshProgressScope; label: string }> = [
  { id: "M", label: "월" },
  { id: "Q", label: "분기" },
  { id: "Y", label: "연간" },
]

const CARD = "rounded-[10px] border border-[rgba(0,0,0,0.08)] bg-white"

function formatPp(value: number): string {
  return value.toLocaleString("ko-KR", { maximumFractionDigits: 1, minimumFractionDigits: 1 })
}

function SegmentedControl<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string
  options: Array<{ id: T; label: string }>
  value: T
  onChange: (value: T) => void
}) {
  return (
    <div className="inline-flex shrink-0 rounded-lg border border-[rgba(0,0,0,0.08)] bg-[#F6F5F4] p-[3px]" role="group" aria-label={label}>
      {options.map((option) => (
        <button
          key={option.id}
          type="button"
          aria-pressed={value === option.id}
          onClick={() => onChange(option.id)}
          className={`rounded-md px-3 py-1.5 text-[12px] font-bold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-[#084734]/30 ${
            value === option.id
              ? "bg-white text-[#111110] shadow-[0_1px_2px_rgba(0,0,0,0.06)]"
              : "text-[#615D59] hover:text-[#111110]"
          }`}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}

// 진도 막대 — 달성률 채움 + 기대 진도 세로선. 값은 옆 숫자가 말하므로 장식(aria-hidden).
// 채움은 0~100으로 클램프(초과분은 숫자·색이 말한다).
function ProgressTrack({
  pct,
  expected,
  heightClass,
  fillClass = "bg-[#084734]",
  markerClass,
  children,
}: {
  pct: number | null
  expected: number
  heightClass: string
  fillClass?: string
  markerClass: string
  children?: ReactNode
}) {
  return (
    <div aria-hidden className={`relative rounded-full bg-[#F0F0EC] ${heightClass}`}>
      {pct != null && (
        <div
          className={`absolute inset-y-0 left-0 rounded-full ${fillClass}`}
          style={{ width: `${Math.min(100, Math.max(0, pct))}%` }}
        />
      )}
      <div className={`absolute ${markerClass}`} style={{ left: `${expected}%` }} />
      {children}
    </div>
  )
}

/* ── ① 히어로 ─────────────────────────────────────────────────── */

interface HeroView {
  title: string
  triple: DshMetricTriple
  expected: number
  axis: [string, string]
}

function heroView(progress: DshProgress, scope: "M" | "Q" | "Y", now: Date): HeroView {
  const fy = dshFiscalYearLabel(progress.fiscalYear)
  if (scope === "Q") {
    const [first, , last] = dshCurrentQuarterMonths(now)
    return {
      title: `${fy} Q${progress.currentQuarter} 진도`,
      triple: progress.quarter,
      expected: progress.elapsed.quarter.pct,
      axis: [dshMonthLabel(first), dshMonthLabel(last)],
    }
  }
  if (scope === "M") {
    const lastDay = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0)).getUTCDate()
    return {
      title: progress.currentMonthKey ? `${dshMonthLabel(progress.currentMonthKey)} 진도` : "현재 월 진도 (범위 밖)",
      triple: progress.month,
      expected: progress.elapsed.month.pct,
      axis: ["1일", `${lastDay}일`],
    }
  }
  const first = progress.months[0]?.ym
  const last = progress.months[progress.months.length - 1]?.ym
  return {
    title: `${fy} 연간 진도`,
    triple: progress.annual,
    expected: progress.elapsed.year.pct,
    axis: [first ? dshMonthLabel(first) : "", last ? dshMonthLabel(last) : ""],
  }
}

// 기대 진도 대비 앞/뒤 배지 — 목표가 없으면(달성률 null) 판정하지 않는다.
function PaceBadge({ pct, expected }: { pct: number | null; expected: number }) {
  if (pct == null) return null
  const diff = pct - expected
  const behind = diff < 0
  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-full border px-2.5 py-1 text-[12px] font-bold ${
        behind ? "border-[#ECD29C] bg-[#FBF1E0] text-[#7A520F]" : "border-[#BDEFD8] bg-[#ECFDF5] text-[#084734]"
      }`}
    >
      기대 진도보다&nbsp;{formatPp(Math.abs(diff))}%p {behind ? "뒤" : "앞"}
    </span>
  )
}

// 기대 진도 라벨 — 양 끝에 가까우면 카드 밖으로 넘치지 않게 정렬 기준을 바꾼다.
function expectedLabelShift(expected: number): string {
  if (expected < 12) return "translateX(0)"
  if (expected > 88) return "translateX(-100%)"
  return "translateX(-50%)"
}

function HeroAnnualStats({ progress, scope }: { progress: DshProgress; scope: DshBandScope }) {
  const { remaining, toDate, currentMonthKey } = progress
  return (
    <div className="grid grid-cols-2 border-t border-[rgba(0,0,0,0.08)] pt-5 @min-[880px]:border-l @min-[880px]:border-t-0 @min-[880px]:pt-0">
      <div
        className="pr-5 @min-[880px]:px-5"
        title={`산식: (연간 목표 − 연간 실적) ÷ 잔여 회계월 수(당월 포함 ${remaining.monthsLeft}개월) = 월평균 필요액`}
      >
        <p className="text-[12px] font-bold text-[#615D59]">남은 목표{scope !== "Y" && " (연간)"}</p>
        <p
          className={`mt-1.5 text-[24px] font-bold tracking-[-0.02em] tabular-nums ${
            remaining.amount <= 0 ? "text-[#084734]" : "text-[#111110]"
          }`}
          {...(remaining.amount > 0 ? { title: dshExactTitle(remaining.amount) } : {})}
        >
          {remaining.amount <= 0 ? "달성 완료" : formatMoney(remaining.amount)}
        </p>
        <p className="mt-1 text-[12px] text-[#615D59]">
          {remaining.amount <= 0 ? (
            "연간 목표 이미 달성 — 추가 필요액 없음"
          ) : remaining.monthlyNeeded == null ? (
            "잔여 회계월 없음 — 페이스 산정 불가"
          ) : (
            <>
              월평균 <b className="font-semibold text-[#111110]">{formatMoney(remaining.monthlyNeeded)}</b> 필요 · 잔여{" "}
              {remaining.monthsLeft}개월
            </>
          )}
        </p>
      </div>
      <div className="border-l border-[rgba(0,0,0,0.08)] px-5">
        <p className="text-[12px] font-bold text-[#615D59]">
          {toDate && currentMonthKey ? `${dshMonthLabel(currentMonthKey)}까지 누적` : "누적 달성"}
        </p>
        <p
          className={`mt-1.5 text-[24px] font-bold tracking-[-0.02em] tabular-nums ${dshRateToneClass(toDate?.pct ?? null)}`}
          {...(toDate ? { title: dshRateTitle(toDate.status, toDate.goal) } : {})}
        >
          {formatDshRate(toDate?.pct ?? null)}
        </p>
        <p className="mt-1 text-[12px] text-[#615D59]">
          {toDate ? `누적 목표 ${formatMoney(toDate.goal)} 대비` : "회계연도 범위 밖"}
        </p>
      </div>
    </div>
  )
}

function ProgressHero({
  progress,
  now,
  subtitle,
  weeklyDealMix,
  team,
}: {
  progress: DshProgress
  now: Date
  subtitle: string
  weeklyDealMix: BranchDealMix | null
  team: Team
}) {
  const [scope, setScope] = useState<DshBandScope>("Y")
  const weekly = useMemo(() => (scope === "W" ? deriveDshWeeklyFromDealMix(weeklyDealMix) : null), [scope, weeklyDealMix])
  const view = scope === "W" ? null : heroView(progress, scope, now)

  return (
    <section className={`${CARD} @container px-5 py-[22px] sm:px-[26px]`}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 flex-[1_1_320px] flex-wrap items-baseline gap-x-2.5 gap-y-1">
          <h2 className="whitespace-nowrap text-[15px] font-bold text-[#111110]">{view ? view.title : "이번 주 확정"}</h2>
          <p className="text-[12px] text-[#615D59]">
            {scope === "W"
              ? `REV 딜 첫결제일 기준 확정 금액 · 월요일 시작 캘린더 주 · 팀 필터(${team === "ALL" ? "KR 전체" : team}) 적용`
              : subtitle}
          </p>
        </div>
        <SegmentedControl label="진도 기간 전환" options={HERO_SCOPES} value={scope} onChange={setScope} />
      </div>

      <div className="mt-[18px] grid items-end gap-7 @min-[880px]:grid-cols-2 @min-[880px]:gap-x-9">
        {view ? (
          <div>
            <div className="flex flex-wrap items-baseline gap-x-3.5 gap-y-2">
              <span
                className="text-[44px] font-bold leading-none tracking-[-0.03em] tabular-nums text-[#111110] sm:text-[56px]"
                title={dshRateTitle(view.triple.status, view.triple.goal)}
              >
                {formatDshRate(view.triple.pct)}
              </span>
              <span className="text-[15px] tabular-nums text-[#615D59]">
                실적{" "}
                <b className="cursor-help text-[#111110]" title={dshExactTitle(view.triple.status)}>
                  {formatMoney(view.triple.status)}
                </b>{" "}
                / 목표{" "}
                <span className="cursor-help" title={dshExactTitle(view.triple.goal)}>
                  {formatMoney(view.triple.goal)}
                </span>
              </span>
              <span className="ml-auto">
                <PaceBadge pct={view.triple.pct} expected={view.expected} />
              </span>
            </div>
            <ProgressTrack
              pct={view.triple.pct}
              expected={view.expected}
              heightClass="mt-[30px] h-3.5"
              markerClass="-bottom-2 -top-2 w-0.5 bg-[#111110]"
            >
              <span
                className="absolute -top-[30px] whitespace-nowrap text-[11.5px] font-bold text-[#111110]"
                style={{ left: `${view.expected}%`, transform: expectedLabelShift(view.expected) }}
              >
                기대 진도 {Math.round(view.expected)}% · {progress.elapsed.todayLabel}
              </span>
            </ProgressTrack>
            <div className="mt-2 flex justify-between text-[11px] text-[#A39E98]">
              <span>{view.axis[0]}</span>
              <span>{view.axis[1]}</span>
            </div>
          </div>
        ) : weekly ? (
          <div>
            <div className="flex flex-wrap items-baseline gap-x-3.5 gap-y-2">
              <span
                className="text-[44px] font-bold leading-none tracking-[-0.03em] tabular-nums text-[#111110] sm:text-[56px]"
                title={dshExactTitle(weekly.total.actual)}
              >
                {formatMoney(weekly.total.actual)}
              </span>
              <span className="text-[15px] tabular-nums text-[#615D59]">
                전주{" "}
                <b className="cursor-help text-[#111110]" title={dshExactTitle(weekly.total.prevActual)}>
                  {formatMoney(weekly.total.prevActual)}
                </b>
                {" · "}
                <b
                  className={`cursor-help ${weekly.total.actual - weekly.total.prevActual < 0 ? "text-[#B43E3E]" : "text-[#084734]"}`}
                  title={dshExactTitle(weekly.total.actual - weekly.total.prevActual)}
                >
                  {formatSignedMoney(weekly.total.actual - weekly.total.prevActual)}
                </b>
              </span>
            </div>
            <p className="mt-4 text-[12px] leading-relaxed text-[#615D59]">
              시트에 주 단위 목표가 없어 달성률·기대 진도는 없습니다 — 확정 금액만 봅니다.
            </p>
          </div>
        ) : (
          <p className="py-6 text-[12px] leading-relaxed text-[#615D59]">
            이번 주·전주에 첫결제로 잡힌 확정 딜이 없거나 주간 집계를 사용할 수 없습니다 — 월/분기/연도 보기를 이용하세요.
          </p>
        )}
        <HeroAnnualStats progress={progress} scope={scope} />
      </div>
    </section>
  )
}

/* ── ② 월별 목표 대비 실적 + 기간 카드 ─────────────────────────── */

// 지난달 = 달성률 판정 색, 당월 = 진행 중(회색 글자·옅은 그린 채움), 미래 = 점선 목표 +
// 선반영(이미 잡힌 실적)만 회색 채움 — 미래 월 실적 0은 "미달"이 아니라 "아직 안 온 달"이다.
function MonthlyGoalBars({ months }: { months: DshMonthPace[] }) {
  const max = Math.max(0, ...months.flatMap((month) => [month.goal, month.status]))
  const px = (value: number) => (max > 0 ? (Math.max(0, value) / max) * 170 : 0)
  const columns = { gridTemplateColumns: `repeat(${Math.max(1, months.length)}, minmax(0, 1fr))` }

  return (
    <section className={`${CARD} min-w-0 px-5 py-5 sm:px-6`}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-[15px] font-bold text-[#111110]">월별 목표 대비 실적</h3>
        <div className="flex gap-3.5 text-[11.5px] text-[#615D59]">
          <span className="inline-flex items-center gap-1.5">
            <span aria-hidden className="h-2.5 w-2.5 rounded-[2px] border-[1.5px] border-[#A39E98]" />
            목표
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span aria-hidden className="h-2.5 w-2.5 rounded-[2px] bg-[#084734]" />
            실적
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span aria-hidden className="h-2.5 w-2.5 rounded-[2px] bg-[#C9C5BF]" />
            선반영
          </span>
        </div>
      </div>
      <div className="overflow-x-auto">
        <div className="min-w-[440px]">
          <div className="mt-[18px] grid h-[236px] items-end gap-2 border-b border-[rgba(0,0,0,0.08)]" style={columns}>
            {months.map((month) => {
              const label = dshMonthLabel(month.ym)
              const rateClass = month.isFuture || month.isCurrent ? "text-[#A39E98]" : dshRateToneClass(month.pct)
              const fillClass = month.isFuture ? "bg-[#C9C5BF]" : month.isCurrent ? "bg-[#084734]/75" : "bg-[#084734]"
              const prebooked = month.isFuture && month.status !== 0
              return (
                <div
                  key={month.ym}
                  // relative — sr-only 텍스트(absolute)가 가로 스크롤 영역 밖 문서 폭을 늘리지 않게 가둔다.
                  className={`relative flex h-full flex-col items-stretch justify-end gap-1.5 rounded-t-md px-[3px] ${month.isCurrent ? "bg-[#F2FAF6]" : ""}`}
                  title={`${label} · 목표 ¥${cnyExact(month.goal)} · 실적 ¥${cnyExact(month.status)}${prebooked ? " (선반영)" : ""}`}
                >
                  <span className={`text-center text-[11.5px] font-bold tabular-nums ${rateClass}`} aria-hidden>
                    {month.isFuture ? "–" : formatDshRateShort(month.pct)}
                  </span>
                  <span className="sr-only">
                    {label} 목표 {formatMoney(month.goal)}, 실적 {formatMoney(month.status)}
                    {month.isFuture ? (prebooked ? ", 선반영" : ", 아직 오지 않은 달") : `, 달성률 ${formatDshRate(month.pct)}`}
                  </span>
                  {/* 막대 영역은 목표·실적 중 큰 쪽 높이 — 초과 달성 채움이 위의 달성률 글자를 덮지 않는다. */}
                  <div aria-hidden className="relative" style={{ height: `${Math.max(px(month.goal), px(month.status))}px` }}>
                    <div
                      className={`absolute inset-x-0 bottom-0 rounded-t border-[1.5px] border-b-0 border-[#A39E98] ${month.isFuture ? "border-dashed" : ""}`}
                      style={{ height: `${px(month.goal)}px` }}
                    />
                    {month.status > 0 && (
                      <div
                        className={`absolute bottom-0 left-[4.5px] right-[4.5px] rounded-t-[2px] ${fillClass}`}
                        style={{ height: `${px(month.status)}px` }}
                      />
                    )}
                  </div>
                </div>
              )
            })}
          </div>
          <div className="mt-2 grid gap-2" style={columns} aria-hidden>
            {months.map((month) => (
              <span
                key={month.ym}
                className={`text-center text-[12px] ${month.isCurrent ? "font-extrabold text-[#084734]" : "font-semibold text-[#615D59]"}`}
              >
                {dshMonthLabel(month.ym)}
              </span>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}

function PeriodCard({
  title,
  elapsedLabel,
  triple,
  expected,
  note,
}: {
  title: string
  elapsedLabel: string
  triple: DshMetricTriple
  expected: number
  note: string
}) {
  return (
    <section className={`${CARD} px-5 py-[18px] sm:px-[22px]`}>
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="text-[14px] font-bold text-[#111110]">{title}</h3>
        <span className="text-[11.5px] font-semibold text-[#615D59]">{elapsedLabel}</span>
      </div>
      <div className="mt-2.5 flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
        <span
          className="text-[30px] font-bold leading-none tracking-[-0.02em] tabular-nums text-[#111110]"
          title={dshRateTitle(triple.status, triple.goal)}
        >
          {formatDshRate(triple.pct)}
        </span>
        <span className="text-[13px] tabular-nums text-[#615D59]">
          {formatMoney(triple.status)} / {formatMoney(triple.goal)}
        </span>
      </div>
      <ProgressTrack
        pct={triple.pct}
        expected={expected}
        heightClass="mt-3.5 h-2.5"
        markerClass="-bottom-[5px] -top-[5px] w-0.5 bg-[#111110]"
      />
      <p className="mt-2.5 text-[12px] text-[#615D59]">{note}</p>
    </section>
  )
}

function monthNote(triple: DshMetricTriple, daysLeft: number): string {
  if (!(triple.goal > 0)) return "이번 달 목표 없음"
  const left = triple.goal - triple.status
  if (left <= 0) return "이번 달 목표 달성"
  return daysLeft > 0 ? `남은 ${daysLeft}일 동안 ${formatMoney(left)} 필요` : `이번 달 ${formatMoney(left)} 미달`
}

function quarterNote(progress: DshProgress): string {
  const { quarter, prebooked } = progress
  if (prebooked.amount !== 0) {
    return `${prebooked.months.map(dshMonthLabel).join("·")} 선반영 ${formatMoney(prebooked.amount)} 포함`
  }
  if (!(quarter.goal > 0)) return "분기 목표 없음"
  const left = quarter.goal - quarter.status
  return left <= 0 ? "분기 목표 달성" : `분기 남은 목표 ${formatMoney(left)}`
}

/* ── ③·④ 달성 막대 행 ─────────────────────────────────────────── */

type BulletTone = "group" | "row" | "team" | "member" | "total"

const BULLET_STYLE: Record<BulletTone, { label: string; bar: string; pad: string }> = {
  total: { label: "text-[13.5px] font-extrabold text-[#084734]", bar: "h-3", pad: "pb-2 pt-2.5" },
  group: { label: "text-[13.5px] font-bold text-[#111110]", bar: "h-3", pad: "pb-2 pt-2.5" },
  team: { label: "text-[13px] font-bold text-[#111110]", bar: "h-2.5", pad: "py-2" },
  row: { label: "pl-3 text-[13px] font-medium text-[#31302E]", bar: "h-2", pad: "py-2" },
  member: { label: "pl-[22px] text-[12.5px] font-medium text-[#615D59]", bar: "h-1.5", pad: "py-1.5" },
}

const BULLET_GRID =
  "grid grid-cols-[minmax(90px,1fr)_minmax(60px,1fr)_52px] items-center gap-3 sm:grid-cols-[minmax(110px,190px)_minmax(80px,1fr)_56px_minmax(0,124px)]"

// 기대 진도 이상이면 그린, 미만이면 주의 — 목표가 없으면(null) 채움 없이 "–".
function BulletCells({ pair, expected, tone }: { pair: DshScopedPair; expected: number; tone: BulletTone }) {
  const ahead = pair.pct != null && pair.pct >= expected
  const style = BULLET_STYLE[tone]
  return (
    <>
      <ProgressTrack
        pct={pair.pct}
        expected={expected}
        heightClass={style.bar}
        fillClass={ahead ? "bg-[#084734]" : "bg-[#A8741A]"}
        markerClass="-bottom-1 -top-1 w-[1.5px] bg-[#111110]/55"
      />
      <span
        className={`cursor-help text-right text-[13px] font-bold tabular-nums ${
          pair.pct == null ? "text-[#C9C5BF]" : ahead ? "text-[#084734]" : "text-[#A8741A]"
        }`}
        title={dshRateTitle(pair.status ?? 0, pair.goal ?? 0)}
      >
        {formatDshRate(pair.pct)}
      </span>
      <span className="hidden truncate text-right text-[11.5px] tabular-nums text-[#615D59] sm:block">
        {pair.status == null ? "–" : formatMoney(pair.status)} / {pair.goal == null ? "–" : formatMoney(pair.goal)}
      </span>
    </>
  )
}

function BulletRow({
  label,
  pair,
  expected,
  tone,
  divider,
}: {
  label: ReactNode
  pair: DshScopedPair
  expected: number
  tone: BulletTone
  divider: "none" | "line" | "soft"
}) {
  const style = BULLET_STYLE[tone]
  const border = divider === "line" ? "border-t border-[rgba(0,0,0,0.08)]" : divider === "soft" ? "border-t border-[#F0F0EC]" : ""
  return (
    <div className={`${BULLET_GRID} ${style.pad} ${border}`}>
      <span className={`min-w-0 truncate ${style.label}`}>{label}</span>
      <BulletCells pair={pair} expected={expected} tone={tone} />
    </div>
  )
}

function compositionText(segments: DshCompositionSegment[]): { text: string; title: string } | null {
  const total = segments.reduce((acc, segment) => acc + Math.max(0, segment.value), 0)
  if (total <= 0) return null
  const share = (value: number) => Math.round((Math.max(0, value) / total) * 100)
  const [first, second, ...rest] = segments
  const extra = rest.filter((segment) => segment.value > 0).map((segment) => ` · ${segment.label.replace(/[()]/g, "")} ${share(segment.value)}`)
  return {
    text: `${share(first.value)} : ${share(second.value)}${extra.join("")}`,
    title: segments.map((segment) => `${segment.label} ¥${cnyExact(segment.value)}`).join(" · "),
  }
}

function SegmentSection({
  breakdown,
  now,
  expected,
  personal,
}: {
  breakdown: BranchDshBreakdownRow[]
  now: Date
  expected: number
  personal: boolean
}) {
  const groups = useMemo(() => deriveDshSegments(breakdown), [breakdown])
  const composition = useMemo(() => deriveDshMetricsBand(breakdown, now)?.composition ?? null, [breakdown, now])
  const axes = composition
    ? [
        { label: "SW : HW", value: compositionText(composition.swHw) },
        { label: "New : Renew", value: compositionText(composition.newRenew) },
        { label: "Direct : Channel", value: compositionText(composition.channel) },
      ]
    : []

  return (
    <section className={`${CARD} min-w-0 px-5 py-5 sm:px-6`}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-[15px] font-bold text-[#111110]">구성별 연간 달성</h3>
        <span className="text-[11.5px] text-[#615D59]">세로선 = 기대 진도 {Math.round(expected)}%</span>
      </div>
      {groups.length === 0 ? (
        <p className="py-8 text-center text-[12px] text-[#615D59]">
          {personal
            ? "개인 범위에는 구성별(SW/HW · New/Renew · 채널) 분해가 없습니다 — 전체 담당자로 보면 Team KR 구성을 볼 수 있습니다."
            : "구성별 수치가 없습니다 — 시트 ‘1. DSH’ 동기화 후 다시 확인하세요."}
        </p>
      ) : (
        <>
          <div className="mt-1.5 flex flex-col">
            {groups.map((group, groupIndex) => (
              <div key={group.category}>
                <BulletRow
                  label={group.category}
                  pair={group}
                  expected={expected}
                  tone="group"
                  divider={groupIndex === 0 ? "none" : "line"}
                />
                {group.rows.map((row) => (
                  <BulletRow key={row.key} label={row.label} pair={row} expected={expected} tone="row" divider="soft" />
                ))}
              </div>
            ))}
          </div>
          {axes.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-x-[18px] gap-y-1 border-t border-[rgba(0,0,0,0.08)] pt-3 text-[12px] text-[#615D59]">
              {axes.map((axis) => (
                <span key={axis.label} className="tabular-nums" {...(axis.value ? { title: axis.value.title } : {})}>
                  <b className="text-[#111110]">{axis.label}</b> {axis.value?.text ?? "실적 없음"}
                </span>
              ))}
            </div>
          )}
        </>
      )}
    </section>
  )
}

function teamName(team: string): string {
  return team === "ALL" ? "Team KR" : branchTeamLabel(team)
}

function TeamSection({
  rows,
  now,
  progress,
  personal,
}: {
  rows: BranchDshRow[]
  now: Date
  progress: DshProgress
  personal: boolean
}) {
  const [scope, setScope] = useState<DshProgressScope>("Y")
  // 펼친 팀 — 처음엔 멤버가 있는 첫 팀을 연다(시안 기본). 사용자가 접거나 바꾸면 그 선택을 따른다.
  const [openChoice, setOpenChoice] = useState<string | null | undefined>(undefined)
  const teams = useMemo(() => deriveDshTeamProgress(rows, now, scope), [rows, now, scope])
  const defaultOpen = teams.find((team) => team.team !== "ALL" && team.members.length > 0)?.team ?? null
  const openTeam = openChoice === undefined ? defaultOpen : openChoice

  const quarterMonths = dshCurrentQuarterMonths(now)
  const scopeTitle =
    scope === "Y"
      ? "연간 달성"
      : scope === "Q"
        ? `Q${progress.currentQuarter} 달성 (${Number(quarterMonths[0].slice(5))}–${Number(quarterMonths[2].slice(5))}월)`
        : progress.currentMonthKey
          ? `${dshMonthLabel(progress.currentMonthKey)} 달성`
          : "현재 월 달성 (범위 밖)"
  const expected =
    scope === "Y" ? progress.elapsed.year.pct : scope === "Q" ? progress.elapsed.quarter.pct : progress.elapsed.month.pct
  const expectedBasis = scope === "Y" ? "연 경과" : scope === "Q" ? "분기 경과" : "월 경과"
  const members = personal ? teams.flatMap((team) => team.members) : []

  return (
    <section className={`${CARD} min-w-0 px-5 py-5 sm:px-6`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-[15px] font-bold text-[#111110]">
          {personal ? "개인" : "팀 · 멤버"} {scopeTitle}
        </h3>
        <SegmentedControl label="팀·멤버 달성 기간 전환" options={TEAM_SCOPES} value={scope} onChange={setScope} />
      </div>
      <p className="mt-2.5 text-[11.5px] text-[#615D59]">
        세로선 = 기대 진도 {Math.round(expected)}% ({expectedBasis}){personal ? "" : " · 행을 누르면 멤버 펼침"}
      </p>
      {teams.length === 0 ? (
        <p className="py-8 text-center text-[12px] text-[#615D59]">
          팀·멤버 수치가 없습니다 — 시트 ‘1. DSH’ 동기화 후 다시 확인하세요.
        </p>
      ) : personal ? (
        <div className="mt-1 flex flex-col">
          {members.map((member, index) => (
            <BulletRow
              key={`${member.member}-${index}`}
              label={member.member}
              pair={member}
              expected={expected}
              tone="team"
              divider={index === 0 ? "none" : "soft"}
            />
          ))}
        </div>
      ) : (
        <div className="mt-1 flex flex-col">
          {teams.map((team) => {
            if (team.team === "ALL") {
              return <BulletRow key="ALL" label={teamName("ALL")} pair={team} expected={expected} tone="total" divider="none" />
            }
            const open = openTeam === team.team
            return (
              <div key={team.team}>
                <button
                  type="button"
                  aria-expanded={open}
                  onClick={() => setOpenChoice(open ? null : team.team)}
                  className={`${BULLET_GRID} ${BULLET_STYLE.team.pad} w-full border-t border-[#F0F0EC] text-left transition hover:bg-[#FAFAF8] focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#084734]/30`}
                >
                  <span className={`flex min-w-0 items-center gap-1 ${BULLET_STYLE.team.label}`}>
                    {open ? (
                      <ChevronDown className="h-3.5 w-3.5 shrink-0 text-[#615D59]" aria-hidden />
                    ) : (
                      <ChevronRight className="h-3.5 w-3.5 shrink-0 text-[#615D59]" aria-hidden />
                    )}
                    <span className="truncate">{teamName(team.team)}</span>
                    <span className="shrink-0 text-[11px] font-medium text-[#A39E98]">{team.members.length}명</span>
                  </span>
                  <BulletCells pair={team} expected={expected} tone="team" />
                </button>
                {open &&
                  team.members.map((member, index) => (
                    <BulletRow
                      key={`${member.member}-${index}`}
                      label={member.member}
                      pair={member}
                      expected={expected}
                      tone="member"
                      divider="soft"
                    />
                  ))}
              </div>
            )
          })}
        </div>
      )}
    </section>
  )
}

/* ── 개요 본체 ─────────────────────────────────────────────────── */

interface DshProgressOverviewProps {
  breakdown: BranchDshBreakdownRow[]
  rows: BranchDshRow[]
  loading?: boolean
  dataSource?: BranchDataSourceInfo | null
  // 히어로 "주" 원천 — summary deal_mix(week_actual). summary 팀 필터를 따른다(M/Q/Y는 시트 기준).
  dealMix?: BranchDealMix | null
  team?: Team
  // 내 담당 한 명으로 좁혔을 때 — summary가 breakdown을 비우고 개인 행만 보낸다.
  personalManager?: string
  // 테스트용 "오늘" 고정.
  now?: Date
}

export function DshProgressOverview({
  breakdown,
  rows,
  loading = false,
  dataSource = null,
  dealMix = null,
  team = "ALL",
  personalManager,
  now: fixedNow,
}: DshProgressOverviewProps) {
  // "오늘" 기준점 — ssr:false 지연 로드 전용이라 클라이언트에서 1회 고정한다(UTC 해석은 dsh-derive 규약).
  const now = useMemo(() => fixedNow ?? new Date(), [fixedNow])
  const personal = Boolean(personalManager)
  const totals = useMemo(
    () => (breakdown.length > 0 ? aggregateDshTotals(breakdown) : dshTotalsFromRows(rows)),
    [breakdown, rows],
  )
  const progress = useMemo(() => (totals ? deriveDshProgress(totals, now) : null), [totals, now])

  if (loading && !progress) return <LoadingPanel label="DSH 진도를 계산하는 중" />
  if (!progress) {
    return (
      <p className={`${CARD} px-4 py-10 text-center text-[12px] text-[#615D59]`}>
        DSH 진도를 계산할 데이터가 없습니다 — 시트 &lsquo;1. DSH&rsquo; 동기화 후 다시 확인하세요.
      </p>
    )
  }
  // 이하 카드들은 시안 밀도(브라우저 기본 줄 높이)에 맞춰 leading-tight를 깔고, 큰 숫자는 개별 지정한다.

  const subtitle = [
    personal && breakdown.length === 0
      ? `개인 DSH · ${branchManagerLabel(personalManager ?? "")} · 시트 ‘1. DSH’ 개인 행`
      : "Team KR 전사 · 시트 ‘1. DSH’ 미러 · 팀 필터와 무관",
    `오늘 ${progress.elapsed.todayLabel} 기준`,
    ...(dataSource ? [`원천 ${dshSourceLabel(dataSource)}`] : []),
  ].join(" · ")
  const monthTitle = progress.currentMonthKey ? `이번 달 · ${dshMonthLabel(progress.currentMonthKey)}` : "이번 달 · 범위 밖"

  return (
    <div className="space-y-5 leading-tight">
      <ProgressHero progress={progress} now={now} subtitle={subtitle} weeklyDealMix={dealMix} team={team} />

      <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,360px),1fr))] gap-5">
        <MonthlyGoalBars months={progress.months} />
        <div className="grid gap-5">
          <PeriodCard
            title={monthTitle}
            elapsedLabel={`월 경과 ${Math.round(progress.elapsed.month.pct)}%`}
            triple={progress.month}
            expected={progress.elapsed.month.pct}
            note={monthNote(progress.month, progress.elapsed.month.daysLeft)}
          />
          <PeriodCard
            title={`현재 분기 · Q${progress.currentQuarter}`}
            elapsedLabel={`분기 경과 ${Math.round(progress.elapsed.quarter.pct)}%`}
            triple={progress.quarter}
            expected={progress.elapsed.quarter.pct}
            note={quarterNote(progress)}
          />
        </div>
      </div>

      <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,520px),1fr))] gap-5">
        <SegmentSection breakdown={breakdown} now={now} expected={progress.elapsed.year.pct} personal={personal} />
        <TeamSection rows={rows} now={now} progress={progress} personal={personal} />
      </div>
    </div>
  )
}
