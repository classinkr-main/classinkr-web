"use client"

// 장부 DSH 렌즈 월별 페이스 그리드(2026-07-27 DSH 디벨롭 D) — 열=회계월(4월→3월),
// 행=목표/실적/Gap/달성률 + 누적 목표/누적 실적/누적 달성률. 전사 breakdown 합계
// (dsh-derive의 aggregateDshTotals — 최대-annual 채택, 3중 계상 방지) 기반 파생 전용 카드로,
// 월별 진도(당월까지 얼마나 왔고 목표 페이스 대비 어디쯤인지)를 숫자로만 검수한다.
// 미래 월의 실적 계열은 회색 처리한다 — 실적 0이 "미달"이 아니라 "아직 안 온 달"이므로
// 진하게 찍으면 오독을 부른다(달성률은 "–").
// 시트 고정 뒤(D4, summary 의 dsh_ledger): 고정 달부터 실적은 장부 확정이다 — 열 머리 '장부' 표시와 셀 title 로 밝힌다.
// 고정 달 한 달 동안은 "실적" 아래에 "시트 실적(비교)" 행을 두고 그 달 칸만 흐리게 채운다(다음 달부터 행이 사라진다).

import { ArrowLeftRight } from "lucide-react"
import { useMemo } from "react"
import type { ReactNode } from "react"
import type { BranchDshBreakdownRow } from "../types"
import { formatMoney } from "@/lib/branch/ledger-format"
import {
  deriveDshMonthlyPace,
  DSH_CELL,
  dshActiveSheetCompare,
  dshCompareTitle,
  dshExactTitle,
  dshGapTitle,
  dshLedgerColumnTitle,
  dshMonthLabel,
  dshRateTitle,
  dshRateTitleFor,
  dshRateToneClass,
  dshStatusSource,
  dshValueTitle,
  formatDshRate,
  formatDshThousands,
  isDshLedgerMonth,
  type BranchDshLedgerInfo,
  type DshLedgerSheetCompare,
  type DshMonthPace,
  type DshStatusSource,
} from "./dsh-derive"
import { LoadingPanel } from "./shared"

const FUTURE_TONE = "text-[#C9C5BF]"

// 월 1칸의 셀 묶음 렌더 정의 — 행마다 값·톤·title만 다르고 마크업은 공유한다.
interface PaceRowSpec {
  id: string
  label: string
  /** 행 머리 title(설명이 필요한 행만). */
  title?: string
  render: (month: DshMonthPace) => { text: string; tone: string; title: string }
}

// 실적 출처 — 그 달(월별 행)·4월부터 그 달까지(누적 행). 장부 정보가 없으면 늘 시트.
interface PaceSources {
  month: (month: DshMonthPace) => DshStatusSource
  cumulative: (month: DshMonthPace) => DshStatusSource
}

const SHEET_SOURCES: PaceSources = { month: () => "sheet", cumulative: () => "sheet" }

// 금액 계열 공통 톤 — 미래 월 회색 우선, 그 외 음수 빨강.
function amountTone(value: number, future: boolean): string {
  if (future) return FUTURE_TONE
  return value < 0 ? "text-[#B43E3E]" : ""
}

// 달성률 계열 공통 — 미래 월에 실적이 없으면 "–"(판정 유보), 값이 있으면 색 판정을 하되
// 미래 월은 회색으로 눌러 표기한다(선반영 실적의 참고치일 뿐 진도 판정이 아니다).
function rateCellSpec(pct: number | null, status: number, goal: number, future: boolean) {
  if (future && status === 0) {
    return { text: "–", tone: FUTURE_TONE, title: dshRateTitle(status, goal) }
  }
  return {
    text: formatDshRate(pct),
    tone: future ? FUTURE_TONE : dshRateToneClass(pct),
    title: dshRateTitle(status, goal),
  }
}

// 행 정의 — 장부 출처(sources)에 따라 title 만 바뀐다. 장부 정보가 없으면 지금 문구 그대로다.
function paceRows(sources: PaceSources): PaceRowSpec[] {
  return [
    {
      id: "goal",
      label: "목표",
      // 목표는 미래 월에도 확정된 계획 수치라 회색 처리하지 않는다(회색 대상은 실적 계열만). 목표는 늘 시트다.
      render: (m) => ({ text: formatDshThousands(m.goal), tone: "", title: dshExactTitle(m.goal) }),
    },
    {
      id: "status",
      label: "실적",
      render: (m) => ({
        text: formatDshThousands(m.status),
        tone: m.isFuture ? FUTURE_TONE : "",
        title: dshValueTitle(m.status, sources.month(m)),
      }),
    },
    {
      id: "gap",
      label: "Gap",
      render: (m) => ({ text: formatDshThousands(m.gap), tone: amountTone(m.gap, m.isFuture), title: dshGapTitle(m.gap, sources.month(m)) }),
    },
    {
      id: "rate",
      label: "달성률",
      render: (m) => ({ ...rateCellSpec(m.pct, m.status, m.goal, m.isFuture), title: dshRateTitleFor(m.status, m.goal, sources.month(m)) }),
    },
    {
      id: "cum-goal",
      label: "누적 목표",
      render: (m) => ({ text: formatDshThousands(m.cumGoal), tone: "", title: dshExactTitle(m.cumGoal) }),
    },
    {
      id: "cum-status",
      label: "누적 실적",
      // 미래 월의 누적 실적은 현재까지의 값이 그대로 이월된 평평한 수치 — 회색으로 눌러 둔다.
      render: (m) => ({
        text: formatDshThousands(m.cumStatus),
        tone: m.isFuture ? FUTURE_TONE : "",
        title: dshValueTitle(m.cumStatus, sources.cumulative(m)),
      }),
    },
    {
      id: "cum-rate",
      label: "누적 달성률",
      render: (m) => ({
        ...rateCellSpec(m.cumPct, m.cumStatus, m.cumGoal, m.isFuture),
        title: dshRateTitleFor(m.cumStatus, m.cumGoal, sources.cumulative(m)),
      }),
    },
  ]
}

// 고정 달 비교 행 — 그 달 칸만 시트 실적(흐리게), 나머지 칸은 비운다.
function sheetCompareRow(compare: DshLedgerSheetCompare): PaceRowSpec {
  return {
    id: "sheet-compare",
    label: "시트 실적(비교)",
    title: `시트 ‘1. DSH’에 적힌 ${dshMonthLabel(compare.month)} 실적 — ${dshMonthLabel(compare.month)} 한 달만 비교로 보여 줍니다`,
    render: (m) =>
      m.ym === compare.month
        ? { text: formatDshThousands(compare.total), tone: "text-[#A39E98]", title: dshCompareTitle(m.status, compare.total) }
        : { text: "", tone: "", title: "" },
  }
}

// 월별 4행(+ 고정 달 비교 1행) / 누적 3행 블록 구분 — DshNumericGrid의 카테고리 블록 행 관례를 따른다.
function paceBlocks(sources: PaceSources, compare: DshLedgerSheetCompare | null): Array<{ id: string; label: string; rows: PaceRowSpec[] }> {
  const rows = paceRows(sources)
  const monthly = rows.slice(0, 4)
  if (compare) monthly.splice(2, 0, sheetCompareRow(compare))
  return [
    { id: "monthly", label: "월별", rows: monthly },
    { id: "cumulative", label: "누적 (4월 → 해당 월)", rows: rows.slice(4) },
  ]
}

interface DshMonthlyPaceProps {
  breakdown: BranchDshBreakdownRow[]
  loading?: boolean
  /** 시트 고정 뒤 장부 실적 표기(summary 의 dsh_ledger). null·없음 = 지금 그대로. */
  ledger?: BranchDshLedgerInfo | null
  /** 테스트용 "오늘" 고정. */
  now?: Date
}

export function DshMonthlyPace({ breakdown, loading = false, ledger = null, now: fixedNow }: DshMonthlyPaceProps) {
  const now = useMemo(() => fixedNow ?? new Date(), [fixedNow])
  const pace = useMemo(() => deriveDshMonthlyPace(breakdown, now), [breakdown, now])
  const blocks = useMemo(() => {
    const monthKeys = pace?.months.map((month) => month.ym) ?? []
    const sources: PaceSources = ledger
      ? {
          month: (month) => dshStatusSource(ledger, [month.ym]),
          cumulative: (month) => dshStatusSource(ledger, monthKeys.filter((ym) => ym <= month.ym)),
        }
      : SHEET_SOURCES
    return paceBlocks(sources, dshActiveSheetCompare(ledger, now))
  }, [ledger, now, pace])

  // 현재 회계월 열 배경 — 헤더는 진하게, 본문 셀은 같은 틴트로 세로 스트립을 만든다
  // (좁은 1열이라 그린 액센트 허용 범위).
  const currentColumnClass = (month: DshMonthPace, base: string) =>
    month.isCurrent ? `${base} bg-[#EAF6F0]` : base

  let annualSummary: ReactNode = null
  if (pace) {
    const annualSource = dshStatusSource(ledger, pace.months.map((month) => month.ym))
    annualSummary = (
      <p className="text-[11px] tabular-nums text-[#615D59]">
        {/* 요약줄은 ¥·만 축약(formatMoney) — 아래 표는 단위 천 원장 규약 유지, 헤더 요약만
            통화 기호가 있는 축약이 빠르게 읽힌다(2026-07-27 피드백 "단위·기호 넣기"). */}
        연간 — 목표{" "}
        <span className="cursor-help font-semibold text-[#111110]" title={dshExactTitle(pace.annual.goal)}>
          {formatMoney(pace.annual.goal)}
        </span>
        {" · "}실적{" "}
        <span className="cursor-help font-semibold text-[#111110]" title={dshValueTitle(pace.annual.status, annualSource)}>
          {formatMoney(pace.annual.status)}
        </span>
        {" · "}달성률{" "}
        <span
          className={`cursor-help font-semibold ${dshRateToneClass(pace.annual.pct)}`}
          title={dshRateTitleFor(pace.annual.status, pace.annual.goal, annualSource)}
        >
          {formatDshRate(pace.annual.pct)}
        </span>
      </p>
    )
  }

  return (
    <section className="rounded-lg border border-[rgba(0,0,0,0.08)] bg-white">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[rgba(0,0,0,0.08)] px-4 py-3">
        <div>
          <p className="text-[13px] font-bold text-[#111110]">
            월별 페이스 <span className="font-semibold text-[#615D59]">(단위: 천)</span>
          </p>
        </div>
        {annualSummary}
      </div>

      {loading && breakdown.length === 0 ? (
        <div className="p-4">
          <LoadingPanel label="월별 페이스를 계산하는 중" />
        </div>
      ) : !pace ? (
        <p className="px-4 py-10 text-center text-[12px] text-[#615D59]">
          월별 페이스를 계산할 데이터가 없습니다 — 시트 &lsquo;1. DSH&rsquo; 동기화 후 다시 확인하세요.
        </p>
      ) : (
        <>
          {/* DshNumericGrid의 모바일 규약 복제(품질 웨이브 7 항목 5와 동일 이유) — 열 축약 대신
              sticky 첫 열 + 가로 스크롤 힌트. */}
          <div className="flex items-center gap-1.5 border-b border-[rgba(0,0,0,0.08)] bg-[#FFFCF5] px-4 py-1.5 text-[10.5px] font-semibold text-[#7A520F] md:hidden">
            <ArrowLeftRight className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            좌우로 스크롤하면 월별 수치를 볼 수 있습니다 — 구분 열은 고정됩니다.
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[980px] border-separate border-spacing-0 text-[11.5px] tabular-nums">
              <thead>
                <tr className="text-[10.5px] uppercase tracking-[0.04em] text-[#615D59]">
                  <th className={`${DSH_CELL} sticky left-0 z-[1] bg-[#F6F5F4] text-left font-bold`}>구분</th>
                  {pace.months.map((month) => {
                    const fromLedger = ledger != null && isDshLedgerMonth(ledger, month.ym)
                    const baseTitle = month.isCurrent ? `${month.ym} — 현재 회계월` : month.ym
                    return (
                      <th
                        key={month.ym}
                        className={`${DSH_CELL} font-bold ${
                          month.isCurrent ? "bg-[#EAF6F0] text-[#084734]" : "bg-[#F6F5F4]"
                        }`}
                        title={fromLedger && ledger ? `${baseTitle} · ${dshLedgerColumnTitle(ledger)}` : baseTitle}
                      >
                        {dshMonthLabel(month.ym)}
                        {month.isCurrent && <span className="ml-1 text-[9px] font-extrabold">今</span>}
                        {fromLedger && (
                          <span className="ml-1 text-[9px] font-semibold normal-case tracking-normal text-[#A39E98]">장부</span>
                        )}
                      </th>
                    )
                  })}
                </tr>
              </thead>
              <tbody>
                {blocks.map((block) => (
                  <PaceBlock
                    key={block.id}
                    block={block}
                    months={pace.months}
                    currentColumnClass={currentColumnClass}
                  />
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  )
}

function PaceBlock({
  block,
  months,
  currentColumnClass,
}: {
  block: { id: string; label: string; rows: PaceRowSpec[] }
  months: DshMonthPace[]
  currentColumnClass: (month: DshMonthPace, base: string) => string
}) {
  return (
    <>
      <tr>
        {/* 블록 구분 행 — 첫 셀만 sticky로 분리해 가로 스크롤 중에도 블록명이 남는다. */}
        <td className={`${DSH_CELL} sticky left-0 z-[1] bg-[#F6F5F4] text-left font-extrabold`}>{block.label}</td>
        <td colSpan={months.length} className={`${DSH_CELL} bg-[#F6F5F4]`} aria-hidden />
      </tr>
      {block.rows.map((rowSpec) => (
        <tr key={rowSpec.id}>
          <td
            className={`${DSH_CELL} sticky left-0 z-[1] bg-white text-left font-semibold ${rowSpec.id === "sheet-compare" ? "text-[#A39E98]" : ""}`}
            {...(rowSpec.title ? { title: rowSpec.title } : {})}
          >
            {rowSpec.label}
          </td>
          {months.map((month) => {
            const cell = rowSpec.render(month)
            return (
              <td
                key={month.ym}
                className={currentColumnClass(month, `${DSH_CELL} ${cell.title ? "cursor-help" : ""} ${cell.tone}`)}
                {...(cell.title ? { title: cell.title } : {})}
              >
                {cell.text}
              </td>
            )
          })}
        </tr>
      ))}
    </>
  )
}
