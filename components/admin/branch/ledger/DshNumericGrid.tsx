"use client"

// 장부 DSH 렌즈의 수치 상세 그리드 — 목업 kr-team-unified-2026-07-16.html의
// "목표 · 실적 상세 (단위: 천)" 카드 재현. 시각화는 KR Team 개요로 이동했고,
// 이 그리드는 시트 '1. DSH' breakdown(Goal/Status × Software/Hardware ×
// New/Renew × Direct/Channel)을 검수용 밀도 높은 숫자 표로 보여준다.
// breakdown은 팀 필터와 무관한 Team KR 전사 수치다(summary API 참조).
// Rate 뷰(2026-07-27 DSH 디벨롭 A): 셀 = Status ÷ Goal 달성률 — 집계는 아래
// aggregateDshRates(순수 함수, dedupeDshByKind 공유) 참조.

import Link from "next/link"
import { ArrowLeftRight } from "lucide-react"
import { useMemo, useState } from "react"
import type { BranchDataSourceInfo, BranchDshBreakdownRow } from "../types"
import { cnyExact } from "@/lib/branch/money-format"
import {
  addDshNumbers,
  dedupeDshByKind,
  dshExactTitle,
  dshRate,
  dshRateTitle,
  dshRateToneClass,
  emptyDshNumbers,
  formatDshRate,
  formatDshThousands,
  subtractDshNumbers,
  type DshNumbers,
} from "./dsh-derive"
import { formatDateTime, LoadingPanel } from "./shared"

export type DshGridView = "goal" | "status" | "gap" | "rate"

const VIEW_OPTIONS: Array<{ id: DshGridView; label: string }> = [
  { id: "goal", label: "Goal" },
  { id: "status", label: "Status" },
  { id: "gap", label: "Gap" },
  { id: "rate", label: "Rate" },
]

const CATEGORY_ORDER = ["Software", "Hardware"]
const STATUS_ORDER = ["New", "Renew"]
// "(미구분)" = 시트에서 채널 열이 공란인 행(예: Hardware Renew) — lib/branch/parsers/dsh.ts
// breakdown 2차 패스가 버리지 않고 채택한 값. 항상 맨 뒤에 둔다.
const CHANNEL_ORDER = ["Direct", "Channel", "(미구분)"]

// 수치 묶음(연간/분기/월)의 형태는 dsh-derive의 DshNumbers를 그대로 쓴다(파생 SSOT 통합).
type GridNumbers = DshNumbers

interface GridRow extends GridNumbers {
  category: string
  status_type: string
  channel: string
}

function orderIndex(order: string[], value: string) {
  const index = order.indexOf(value)
  return index === -1 ? order.length : index
}

function rowSortCompare(a: Pick<GridRow, "category" | "status_type" | "channel">, b: Pick<GridRow, "category" | "status_type" | "channel">) {
  return (
    orderIndex(CATEGORY_ORDER, a.category) - orderIndex(CATEGORY_ORDER, b.category) ||
    orderIndex(STATUS_ORDER, a.status_type) - orderIndex(STATUS_ORDER, b.status_type) ||
    orderIndex(CHANNEL_ORDER, a.channel) - orderIndex(CHANNEL_ORDER, b.channel)
  )
}

function formatRatio(value: number, total: number) {
  if (total <= 0) return "–"
  return `${((value / total) * 100).toLocaleString("ko-KR", { maximumFractionDigits: 1, minimumFractionDigits: 1 })}%`
}

function monthLabel(ym: string) {
  return `${Number(ym.slice(5))}월`
}

// 카드 헤더 레벨 계보(2026-07-17 사용성 디벨롭 항목 2) — 파서가 DSH breakdown에
// 행 좌표(sheet_row)를 방출하지 않아 셀 단위 계보는 스코프 밖(YAGNI). SyncStatusBar의
// sourceLabel과 동일한 kind→라벨 매핑을 그리드 헤더 캡션용으로 재현한다.
// DSH 계열 카드(지표 밴드·월별 페이스·팀 그리드)가 같은 캡션 관례를 공유하도록 export한다.
export function dshSourceLabel(source: BranchDataSourceInfo): string {
  if (source.kind === "import") return `장부 임포트${source.asOf ? ` · ${formatDateTime(source.asOf)}` : ""}`
  if (source.kind === "mirror") return `시트 미러${source.asOf ? ` · ${formatDateTime(source.asOf)}` : ""}`
  return `라이브 시트${source.asOf ? ` · ${formatDateTime(source.asOf)}` : ""}`
}

// breakdown 집계 — 컴포넌트 밖 순수 함수로 두어 단위 테스트가 가능하다.
// breakdown에는 같은 (kind, category, status_type, channel) 콤보가 스코프별로 반복된다
// (전사 + 팀/멤버 섹션 — 파서가 시트의 모든 섹션을 훑고, 액티브 임포트 소스는 순서까지 뒤섞임).
// 전사 행은 부분 행들의 합이라 annual이 항상 최대이므로, 합산 대신 최대 annual 행 하나를
// 채택한다 — 합산하면 전사+팀+멤버가 3중 계상돼 수치가 부풀려진다. 중복 제거 규칙 자체는
// dedupeDshByKind(dsh-derive.ts) 단일 소스를 쓴다(지표 밴드·월별 페이스·Rate 뷰와 공유).
export function aggregateDshBreakdown(breakdown: BranchDshBreakdownRow[], view: Exclude<DshGridView, "rate">) {
  const { monthKeys: months, goal, status } = dedupeDshByKind(breakdown)
  const byKind = { goal, status }
  const toGridRow = (row: BranchDshBreakdownRow): GridRow => {
    const entry: GridRow = { category: row.category, status_type: row.status_type, channel: row.channel, ...emptyDshNumbers() }
    addDshNumbers(entry, row)
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
        ...subtractDshNumbers(status ?? { ...base, ...emptyDshNumbers() }, goal ?? { ...base, ...emptyDshNumbers() }, months),
      }
    })
  } else {
    viewRows = [...byKind[view].values()].map(toGridRow)
  }
  viewRows.sort(rowSortCompare)

  const totalNumbers = emptyDshNumbers()
  for (const row of viewRows) addDshNumbers(totalNumbers, row)
  return { monthKeys: months, rows: viewRows, total: totalNumbers }
}

// ── Rate 뷰 집계 (2026-07-27 DSH 디벨롭 A) ──────────────────────────────────
// Gap과 동일하게 goal/status 두 "중복 제거된" 집계를 콤보 키로 결합하되, 셀마다 달성률
// (Status ÷ Goal)과 원값 쌍(title 병기용)을 함께 담는다. 목표 0/결측 셀은 pct=null("–") —
// 0%로 왜곡하지 않는다. total은 "합산 실적 ÷ 합산 목표"다(행 달성률 단순 평균이 아님 —
// 규모가 다른 콤보를 평균 내면 작은 콤보가 과대 대표된다).

export interface DshRateCell {
  pct: number | null
  status: number
  goal: number
}

interface RateNumbers {
  annual: DshRateCell
  quarters: [DshRateCell, DshRateCell, DshRateCell, DshRateCell]
  months: Record<string, DshRateCell>
}

interface RateRow extends RateNumbers {
  category: string
  status_type: string
  channel: string
}

export function aggregateDshRates(breakdown: BranchDshBreakdownRow[]) {
  const { monthKeys, goal, status } = dedupeDshByKind(breakdown)
  const cell = (statusValue: number, goalValue: number): DshRateCell => ({
    pct: dshRate(statusValue, goalValue),
    status: statusValue,
    goal: goalValue,
  })
  const build = (goalRow: DshNumbers | undefined, statusRow: DshNumbers | undefined): RateNumbers => ({
    annual: cell(statusRow?.annual ?? 0, goalRow?.annual ?? 0),
    quarters: [0, 1, 2, 3].map((i) => cell(statusRow?.quarters[i] ?? 0, goalRow?.quarters[i] ?? 0)) as RateNumbers["quarters"],
    months: Object.fromEntries(monthKeys.map((ym) => [ym, cell(statusRow?.months[ym] ?? 0, goalRow?.months[ym] ?? 0)])),
  })

  const unionKeys = new Set([...goal.keys(), ...status.keys()])
  const rows: RateRow[] = [...unionKeys].map((key) => {
    const goalRow = goal.get(key)
    const statusRow = status.get(key)
    const base = (statusRow ?? goalRow)!
    return {
      category: base.category,
      status_type: base.status_type,
      channel: base.channel,
      ...build(goalRow, statusRow),
    }
  })
  rows.sort(rowSortCompare)

  const goalTotal = emptyDshNumbers()
  for (const row of goal.values()) addDshNumbers(goalTotal, row)
  const statusTotal = emptyDshNumbers()
  for (const row of status.values()) addDshNumbers(statusTotal, row)
  const total = build(goalTotal, statusTotal)
  return { monthKeys, rows, total }
}

const CELL = "whitespace-nowrap border-b border-r border-[rgba(0,0,0,0.08)] px-2.5 py-1.5 text-right"

// 원값 호버(2026-07-17 사용성 디벨롭 항목 1) — formatDshThousands는 1,000 단위로 반올림
// 표기하므로, title에 원값 전체 자릿수(¥, 반올림 없음)를 병기해 보정한다.
// 문구 규약은 dsh-derive의 dshExactTitle 단일 소스를 그대로 쓴다(계열 카드 공통).
const exactTitle = dshExactTitle

// 원값 접근성(품질 웨이브 2, 항목 8): hover-only title로만 원값을 확인할 수 있던 문제 —
// 개별 셀 tabIndex 대신 헤더 토글로 표시 자체를 전환한다. 검수(reconciliation) 작업은
// 여러 셀을 훑어야 해서, 셀 하나하나 포커스/hover하는 것보다 한 번의 토글로 표 전체가
// 원값으로 바뀌는 쪽이 스크린리더·키보드 사용자 모두에게 더 빠르다 — 텍스트 자체가
// 원값이 되므로 hover 의존이 없어진다. 집계·산식은 무변경(표시 전환만).
function numericCells(numbers: GridNumbers, monthKeys: string[], extra = "", showRaw = false) {
  const tone = (value: number) => (value < 0 ? "text-[#B43E3E]" : "")
  const display = (value: number) => (showRaw ? `¥${cnyExact(value)}` : formatDshThousands(value))
  return (
    <>
      <td className={`${CELL} cursor-help ${tone(numbers.annual)} ${extra}`} title={exactTitle(numbers.annual)}>{display(numbers.annual)}</td>
      {numbers.quarters.map((value, index) => (
        <td key={`q${index}`} className={`${CELL} cursor-help ${extra || "bg-[#FBFAF7]"} ${tone(value)}`} title={exactTitle(value)}>
          {display(value)}
        </td>
      ))}
      {monthKeys.map((ym) => {
        const value = numbers.months[ym] ?? 0
        return (
          <td key={ym} className={`${CELL} cursor-help ${tone(value)} ${extra}`} title={exactTitle(value)}>
            {display(value)}
          </td>
        )
      })}
    </>
  )
}

// Rate 셀 — 표기는 달성률 %(소수 1자리), title에 실적·목표 원값(¥, 반올림 없음) 쌍을 병기한다.
// 색 경계는 dshRateToneClass(≥100 그린 / 70~100 주의 / <70 미달 / 목표 없음 회색) — 강조 행
// (Team KR · Total)에서도 톤 색은 유지한다(달성률 판정 색을 행 강조색으로 덮지 않는다).
function rateCells(numbers: RateNumbers, monthKeys: string[], extra = "") {
  const renderCell = (value: DshRateCell, key: string, cellExtra: string) => (
    <td
      key={key}
      className={`${CELL} cursor-help ${cellExtra} ${dshRateToneClass(value.pct)}`}
      title={dshRateTitle(value.status, value.goal)}
    >
      {formatDshRate(value.pct)}
    </td>
  )
  return (
    <>
      {renderCell(numbers.annual, "annual", extra)}
      {numbers.quarters.map((value, index) => renderCell(value, `q${index}`, extra || "bg-[#FBFAF7]"))}
      {monthKeys.map((ym) => renderCell(numbers.months[ym] ?? { pct: null, status: 0, goal: 0 }, ym, extra))}
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
  // Rate 뷰는 셀 형태(원값 쌍+달성률)가 달라 별도 집계를 태운다 — 둘 다 순수 함수라
  // 비활성 뷰 쪽 memo는 null로 스킵된다(불필요 계산 없음).
  const numeric = useMemo(
    () => (view === "rate" ? null : aggregateDshBreakdown(breakdown, view)),
    [breakdown, view],
  )
  const rate = useMemo(() => (view === "rate" ? aggregateDshRates(breakdown) : null), [breakdown, view])
  const monthKeys = (rate ?? numeric)!.monthKeys
  // 원값 표시 토글(항목 8) — 기본은 기존 "단위: 천" 축약, 켜면 표 전체가 반올림 없는 원값(¥)으로
  // 바뀐다. 검수용 표시 전환일 뿐 집계·산식은 그대로다. Rate 뷰에서는 본 표기가 %라 전환이
  // 무의미하므로 비활성화한다(원값은 셀 title의 실적÷목표 쌍으로 확인).
  const [showRawValue, setShowRawValue] = useState(false)
  const rawToggleDisabled = view === "rate"

  const columnCount = 2 + 4 + monthKeys.length + 1

  return (
    <section className="rounded-lg border border-[rgba(0,0,0,0.08)] bg-white">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[rgba(0,0,0,0.08)] px-4 py-3">
        <div>
          <p className="text-[13px] font-bold text-[#111110]">
            목표 · 실적 상세{" "}
            <span className="font-semibold text-[#615D59]">
              {view === "rate" ? "(달성률 %)" : showRawValue ? "(원값)" : "(단위: 천)"}
            </span>
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {/* disabled 버튼은 브라우저에 따라 hover title이 안 뜬다 — 이유 병기는 감싼 span의
              title로 보장한다(Rate 뷰 비활성 사유 안내). */}
          <span
            title={
              rawToggleDisabled
                ? "달성률 뷰에서는 %가 본 표기라 원값 전환이 적용되지 않습니다 — 원값(실적·목표)은 각 셀에 마우스를 올려 확인하세요."
                : undefined
            }
          >
            <button
              type="button"
              aria-pressed={showRawValue && !rawToggleDisabled}
              disabled={rawToggleDisabled}
              onClick={() => setShowRawValue((value) => !value)}
              title={rawToggleDisabled ? undefined : "셀을 hover하지 않아도 반올림 없는 원값을 표에서 바로 확인합니다."}
              className={`rounded-md border px-3 py-1.5 text-[12px] font-bold transition disabled:cursor-not-allowed disabled:opacity-40 ${
                showRawValue && !rawToggleDisabled
                  ? "border-[#BDEFD8] bg-[#ECFDF5] text-[#084734]"
                  : "border-[rgba(0,0,0,0.08)] bg-white text-[#615D59] hover:text-[#111110]"
              }`}
            >
              {showRawValue && !rawToggleDisabled ? "원값 표시 중" : "원값 표시"}
            </button>
          </span>
          <div className="inline-flex rounded-lg border border-[rgba(0,0,0,0.08)] bg-[#F6F5F4] p-[3px]" role="group" aria-label="Goal/Status/Gap/Rate 보기 전환">
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
        <>
          {/* 품질 웨이브 7 — 항목 5: min-w-[1080px] 표는 md 미만에서 첫 열만 고정한 채 나머지가
              전부 가로 스크롤 밖으로 밀린다. 이 표는 검수용 밀도 높은 원장이라(헤더 주석 "숫자가
              정본") 모바일에서 열을 줄인 축약 카드로 바꾸면 오히려 신뢰도가 떨어진다 — 대신
              구분(sticky) 열은 그대로 두고, 스크롤이 더 있다는 사실만 명확히 알려준다. */}
          <div className="flex items-center gap-1.5 border-b border-[rgba(0,0,0,0.08)] bg-[#FFFCF5] px-4 py-1.5 text-[10.5px] font-semibold text-[#7A520F] md:hidden">
            <ArrowLeftRight className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            좌우로 스크롤하면 분기·월별 수치를 볼 수 있습니다 — 구분 열은 고정됩니다.
          </div>
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
                {rate ? (
                  <>
                    <tr>
                      <td className={`${CELL} sticky left-0 z-[1] bg-[#ECFDF5] text-left font-extrabold text-[#084734]`}>
                        Team KR · Total
                      </td>
                      {rateCells(rate.total, monthKeys, "bg-[#ECFDF5] font-extrabold")}
                      <td className={`${CELL} bg-[#ECFDF5] font-extrabold text-[#084734]`}>–</td>
                    </tr>
                    {CATEGORY_ORDER.filter((category) => rate.rows.some((row) => row.category === category)).map((category) => (
                      <RateCategoryBlock
                        key={category}
                        category={category}
                        rows={rate.rows.filter((row) => row.category === category)}
                        monthKeys={monthKeys}
                        columnCount={columnCount}
                      />
                    ))}
                  </>
                ) : numeric ? (
                  <>
                    <tr>
                      <td className={`${CELL} sticky left-0 z-[1] bg-[#ECFDF5] text-left font-extrabold text-[#084734]`}>
                        Team KR · Total
                      </td>
                      {numericCells(numeric.total, monthKeys, "bg-[#ECFDF5] font-extrabold text-[#084734]", showRawValue)}
                      <td className={`${CELL} bg-[#ECFDF5] font-extrabold text-[#084734]`}>
                        {view === "gap" ? "–" : formatRatio(numeric.total.annual, numeric.total.annual)}
                      </td>
                    </tr>
                    {CATEGORY_ORDER.filter((category) => numeric.rows.some((row) => row.category === category)).map((category) => (
                      <CategoryBlock
                        key={category}
                        category={category}
                        rows={numeric.rows.filter((row) => row.category === category)}
                        monthKeys={monthKeys}
                        columnCount={columnCount}
                        showRawValue={showRawValue}
                        totalAnnual={numeric.total.annual}
                        view={view}
                      />
                    ))}
                  </>
                ) : null}
              </tbody>
            </table>
          </div>
        </>
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
  showRawValue,
}: {
  category: string
  rows: GridRow[]
  monthKeys: string[]
  columnCount: number
  totalAnnual: number
  view: DshGridView
  showRawValue: boolean
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
          {numericCells(row, monthKeys, "", showRawValue)}
          <td className={`${CELL} text-[#615D59]`}>{view === "gap" ? "–" : formatRatio(row.annual, totalAnnual)}</td>
        </tr>
      ))}
    </>
  )
}

// Rate 뷰의 카테고리 블록 — 블록 행 마크업은 CategoryBlock과 동일 관례, 데이터 셀만
// 달성률(rateCells)이고 비율 열은 Gap 뷰처럼 "–"(달성률 표에 구성비를 섞지 않는다).
function RateCategoryBlock({
  category,
  rows,
  monthKeys,
  columnCount,
}: {
  category: string
  rows: RateRow[]
  monthKeys: string[]
  columnCount: number
}) {
  return (
    <>
      <tr>
        <td className={`${CELL} sticky left-0 z-[1] bg-[#F6F5F4] text-left font-extrabold`}>{category}</td>
        <td colSpan={columnCount - 1} className={`${CELL} bg-[#F6F5F4]`} aria-hidden />
      </tr>
      {rows.map((row) => (
        <tr key={`${row.category}-${row.status_type}-${row.channel}`}>
          <td className={`${CELL} sticky left-0 z-[1] bg-white text-left font-semibold`}>
            {row.status_type} · {row.channel}
          </td>
          {rateCells(row, monthKeys)}
          <td className={`${CELL} text-[#615D59]`}>–</td>
        </tr>
      ))}
    </>
  )
}
