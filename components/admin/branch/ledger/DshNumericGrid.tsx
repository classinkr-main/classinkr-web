"use client"

// 장부 DSH 렌즈의 수치 상세 그리드 — 목업 kr-team-unified-2026-07-16.html의
// "목표 · 실적 상세 (단위: 천)" 카드 재현. 시각화는 KR Team 개요로 이동했고,
// 이 그리드는 시트 '1. DSH' breakdown(Goal/Status × Software/Hardware ×
// New/Renew × Direct/Channel)을 검수용 밀도 높은 숫자 표로 보여준다.
// breakdown은 팀 필터와 무관한 Team KR 전사 수치다(summary API 참조).

import Link from "next/link"
import { useMemo } from "react"
import type { BranchDshBreakdownRow } from "../types"
import { LoadingPanel } from "./shared"

export type DshGridView = "goal" | "status" | "gap"

const VIEW_OPTIONS: Array<{ id: DshGridView; label: string }> = [
  { id: "goal", label: "Goal" },
  { id: "status", label: "Status" },
  { id: "gap", label: "Gap" },
]

const CATEGORY_ORDER = ["Software", "Hardware"]
const STATUS_ORDER = ["New", "Renew"]
// "(미구분)" = 시트에서 채널 열이 공란인 행(예: Hardware Renew) — lib/branch/parsers/dsh.ts
// breakdown 2차 패스가 버리지 않고 채택한 값. 항상 맨 뒤에 둔다.
const CHANNEL_ORDER = ["Direct", "Channel", "(미구분)"]

interface GridNumbers {
  annual: number
  quarters: [number, number, number, number]
  months: Record<string, number>
}

interface GridRow extends GridNumbers {
  category: string
  status_type: string
  channel: string
}

function emptyNumbers(): GridNumbers {
  return { annual: 0, quarters: [0, 0, 0, 0], months: {} }
}

function addNumbers(target: GridNumbers, source: GridNumbers) {
  target.annual += source.annual
  for (let i = 0; i < 4; i++) target.quarters[i] += source.quarters[i] ?? 0
  for (const [ym, value] of Object.entries(source.months)) {
    target.months[ym] = (target.months[ym] ?? 0) + value
  }
}

function subtractNumbers(status: GridNumbers, goal: GridNumbers, monthKeys: string[]): GridNumbers {
  const months: Record<string, number> = {}
  for (const ym of monthKeys) months[ym] = (status.months[ym] ?? 0) - (goal.months[ym] ?? 0)
  return {
    annual: status.annual - goal.annual,
    quarters: [0, 1, 2, 3].map((i) => (status.quarters[i] ?? 0) - (goal.quarters[i] ?? 0)) as GridNumbers["quarters"],
    months,
  }
}

function orderIndex(order: string[], value: string) {
  const index = order.indexOf(value)
  return index === -1 ? order.length : index
}

function rowSortCompare(a: GridRow, b: GridRow) {
  return (
    orderIndex(CATEGORY_ORDER, a.category) - orderIndex(CATEGORY_ORDER, b.category) ||
    orderIndex(STATUS_ORDER, a.status_type) - orderIndex(STATUS_ORDER, b.status_type) ||
    orderIndex(CHANNEL_ORDER, a.channel) - orderIndex(CHANNEL_ORDER, b.channel)
  )
}

// 단위 천 — 시트 원값(원)을 1,000으로 나눠 정수 표기한다.
function formatThousands(value: number) {
  return Math.round(value / 1000).toLocaleString("ko-KR")
}

function formatRatio(value: number, total: number) {
  if (total <= 0) return "–"
  return `${((value / total) * 100).toLocaleString("ko-KR", { maximumFractionDigits: 1, minimumFractionDigits: 1 })}%`
}

function monthLabel(ym: string) {
  return `${Number(ym.slice(5))}월`
}

// breakdown 집계 — 컴포넌트 밖 순수 함수로 두어 단위 테스트가 가능하다.
// breakdown에는 같은 (kind, category, status_type, channel) 콤보가 스코프별로 반복된다
// (전사 + 팀/멤버 섹션 — 파서가 시트의 모든 섹션을 훑고, 액티브 임포트 소스는 순서까지 뒤섞임).
// 전사 행은 부분 행들의 합이라 annual이 항상 최대이므로, 합산 대신 최대 annual 행 하나를
// 채택한다 — 합산하면 전사+팀+멤버가 3중 계상돼 수치가 부풀려진다.
export function aggregateDshBreakdown(breakdown: BranchDshBreakdownRow[], view: DshGridView) {
  const keys = new Set<string>()
  for (const row of breakdown) for (const ym of Object.keys(row.months)) keys.add(ym)
  // 회계월 키는 breakdown이 실제로 담고 있는 달의 합집합 — ym 문자열 정렬이
  // FY 경계(4월 시작 → 이듬해 3월)를 그대로 보존한다.
  const months = [...keys].sort()

  const byKind: Record<"goal" | "status", Map<string, BranchDshBreakdownRow>> = { goal: new Map(), status: new Map() }
  for (const row of breakdown) {
    const bucket = byKind[row.kind]
    if (!bucket) continue
    const key = `${row.category}|${row.status_type}|${row.channel}`
    const existing = bucket.get(key)
    if (!existing || row.annual > existing.annual) bucket.set(key, row)
  }
  const toGridRow = (row: BranchDshBreakdownRow): GridRow => {
    const entry: GridRow = { category: row.category, status_type: row.status_type, channel: row.channel, ...emptyNumbers() }
    addNumbers(entry, row)
    return entry
  }

  let viewRows: GridRow[]
  if (view === "gap") {
    // Gap = Status − Goal. 행 매칭 키는 category+status_type+channel — 한쪽에만
    // 있는 키도 0으로 간주해 누락 없이 전개한다.
    const unionKeys = new Set([...byKind.goal.keys(), ...byKind.status.keys()])
    viewRows = [...unionKeys].map((key) => {
      const goalSource = byKind.goal.get(key)
      const statusSource = byKind.status.get(key)
      const goal = goalSource ? toGridRow(goalSource) : undefined
      const status = statusSource ? toGridRow(statusSource) : undefined
      const base = (status ?? goal)!
      return {
        category: base.category,
        status_type: base.status_type,
        channel: base.channel,
        ...subtractNumbers(status ?? { ...base, ...emptyNumbers() }, goal ?? { ...base, ...emptyNumbers() }, months),
      }
    })
  } else {
    viewRows = [...byKind[view].values()].map(toGridRow)
  }
  viewRows.sort(rowSortCompare)

  const totalNumbers = emptyNumbers()
  for (const row of viewRows) addNumbers(totalNumbers, row)
  return { monthKeys: months, rows: viewRows, total: totalNumbers }
}

const CELL = "whitespace-nowrap border-b border-r border-[rgba(0,0,0,0.08)] px-2.5 py-1.5 text-right"

function numericCells(numbers: GridNumbers, monthKeys: string[], extra = "") {
  const tone = (value: number) => (value < 0 ? "text-[#B43E3E]" : "")
  return (
    <>
      <td className={`${CELL} ${tone(numbers.annual)} ${extra}`}>{formatThousands(numbers.annual)}</td>
      {numbers.quarters.map((value, index) => (
        <td key={`q${index}`} className={`${CELL} ${extra || "bg-[#FBFAF7]"} ${tone(value)}`}>
          {formatThousands(value)}
        </td>
      ))}
      {monthKeys.map((ym) => {
        const value = numbers.months[ym] ?? 0
        return (
          <td key={ym} className={`${CELL} ${tone(value)} ${extra}`}>
            {formatThousands(value)}
          </td>
        )
      })}
    </>
  )
}

interface DshNumericGridProps {
  breakdown: BranchDshBreakdownRow[]
  view: DshGridView
  onViewChange: (view: DshGridView) => void
  loading?: boolean
}

export function DshNumericGrid({ breakdown, view, onViewChange, loading = false }: DshNumericGridProps) {
  const { monthKeys, rows, total } = useMemo(() => aggregateDshBreakdown(breakdown, view), [breakdown, view])

  const columnCount = 2 + 4 + monthKeys.length + 1

  return (
    <section className="rounded-lg border border-[rgba(0,0,0,0.08)] bg-white">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[rgba(0,0,0,0.08)] px-4 py-3">
        <div>
          <p className="text-[13px] font-bold text-[#111110]">
            목표 · 실적 상세 <span className="font-semibold text-[#615D59]">(단위: 천)</span>
          </p>
          <p className="mt-0.5 text-[11px] text-[#615D59]">
            시트 &lsquo;1. DSH&rsquo; 미러 · Team KR 전사 — 팀 필터와 무관 · 숫자가 정본
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex rounded-lg border border-[rgba(0,0,0,0.08)] bg-[#F6F5F4] p-[3px]" role="group" aria-label="Goal/Status/Gap 보기 전환">
            {VIEW_OPTIONS.map((option) => (
              <button
                key={option.id}
                type="button"
                aria-pressed={view === option.id}
                onClick={() => onViewChange(option.id)}
                className={`rounded-md px-3 py-1.5 text-[12px] font-bold transition ${
                  view === option.id
                    ? "bg-white text-[#111110] shadow-[0_1px_2px_rgba(0,0,0,0.06)]"
                    : "text-[#615D59] hover:text-[#111110]"
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
          <Link
            href="/admin/branch"
            className="inline-flex items-center gap-1.5 rounded-md border border-dashed border-[rgba(0,0,0,0.15)] bg-white px-3 py-1.5 text-[12px] font-bold text-[#084734] transition hover:bg-[#ECFDF5] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#084734]"
          >
            차트로 보기 → KR Team 개요
          </Link>
        </div>
      </div>

      {loading && breakdown.length === 0 ? (
        <div className="p-4">
          <LoadingPanel label="DSH 상세 수치를 불러오는 중" />
        </div>
      ) : breakdown.length === 0 ? (
        <p className="px-4 py-10 text-center text-[12px] text-[#615D59]">
          DSH 상세 데이터가 없습니다 — 시트 &lsquo;1. DSH&rsquo; 동기화 후 다시 확인하세요.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1080px] border-separate border-spacing-0 text-[11.5px] tabular-nums">
            <thead>
              <tr className="text-[10.5px] uppercase tracking-[0.04em] text-[#615D59]">
                <th className={`${CELL} sticky left-0 z-[1] bg-[#F6F5F4] text-left font-bold`}>구분</th>
                <th className={`${CELL} bg-[#F6F5F4] font-bold`}>연간</th>
                {["Q1", "Q2", "Q3", "Q4"].map((label) => (
                  <th key={label} className={`${CELL} bg-[#F6F5F4] font-bold`}>
                    {label}
                  </th>
                ))}
                {monthKeys.map((ym) => (
                  <th key={ym} className={`${CELL} bg-[#F6F5F4] font-bold`}>
                    {monthLabel(ym)}
                  </th>
                ))}
                <th className={`${CELL} bg-[#F6F5F4] font-bold`}>비율</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className={`${CELL} sticky left-0 z-[1] bg-[#ECFDF5] text-left font-extrabold text-[#084734]`}>
                  Team KR · Total
                </td>
                {numericCells(total, monthKeys, "bg-[#ECFDF5] font-extrabold text-[#084734]")}
                <td className={`${CELL} bg-[#ECFDF5] font-extrabold text-[#084734]`}>
                  {view === "gap" ? "–" : formatRatio(total.annual, total.annual)}
                </td>
              </tr>
              {CATEGORY_ORDER.filter((category) => rows.some((row) => row.category === category)).map((category) => (
                <CategoryBlock
                  key={category}
                  category={category}
                  rows={rows.filter((row) => row.category === category)}
                  monthKeys={monthKeys}
                  columnCount={columnCount}
                  totalAnnual={total.annual}
                  view={view}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}

function CategoryBlock({
  category,
  rows,
  monthKeys,
  columnCount,
  totalAnnual,
  view,
}: {
  category: string
  rows: GridRow[]
  monthKeys: string[]
  columnCount: number
  totalAnnual: number
  view: DshGridView
}) {
  return (
    <>
      <tr>
        {/* 목업의 colspan 블록 행 — 첫 셀만 sticky로 분리해 가로 스크롤 중에도 블록명이 남는다. */}
        <td className={`${CELL} sticky left-0 z-[1] bg-[#F6F5F4] text-left font-extrabold`}>{category}</td>
        <td colSpan={columnCount - 1} className={`${CELL} bg-[#F6F5F4]`} aria-hidden />
      </tr>
      {rows.map((row) => (
        <tr key={`${row.category}-${row.status_type}-${row.channel}`}>
          <td className={`${CELL} sticky left-0 z-[1] bg-white text-left font-semibold`}>
            {row.status_type} · {row.channel}
          </td>
          {numericCells(row, monthKeys)}
          <td className={`${CELL} text-[#615D59]`}>{view === "gap" ? "–" : formatRatio(row.annual, totalAnnual)}</td>
        </tr>
      ))}
    </>
  )
}
