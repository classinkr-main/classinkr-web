"use client"

import { ArrowDown, ArrowUp, ChevronsUpDown } from "lucide-react"
import { useId, useMemo, useState } from "react"

export interface PagePerformanceRow {
  path: string
  pageViews: number
  visitors: number
  avgDwellSeconds: number
  exits: number
  exitRate: number
}

export interface PagePerformanceTableProps {
  rows: PagePerformanceRow[]
  formatLabel?: (path: string) => string
  formatDuration?: (seconds: number) => string
}

type SortKey = "path" | "pageViews" | "visitors" | "avgDwellSeconds" | "exitRate"
type SortDirection = "asc" | "desc"

const INITIAL_VISIBLE_ROWS = 5

const DEFAULT_SORT_DIRECTION: Record<SortKey, SortDirection> = {
  path: "asc",
  pageViews: "desc",
  visitors: "desc",
  avgDwellSeconds: "desc",
  exitRate: "desc",
}

const NUMBER_FORMATTER = new Intl.NumberFormat("ko-KR")
const PERCENT_FORMATTER = new Intl.NumberFormat("ko-KR", {
  maximumFractionDigits: 1,
})

function defaultFormatLabel(path: string) {
  if (path === "/") return "홈"
  if (path === "__exit__") return "사이트 이탈"
  return path
}

function defaultFormatDuration(seconds: number) {
  if (!Number.isFinite(seconds) || seconds <= 0) return "데이터 없음"

  const wholeSeconds = Math.round(seconds)
  const minutes = Math.floor(wholeSeconds / 60)
  const remainingSeconds = wholeSeconds % 60
  return minutes > 0 ? `${minutes}분 ${remainingSeconds}초` : `${remainingSeconds}초`
}

function compareRows(
  first: PagePerformanceRow,
  second: PagePerformanceRow,
  sortKey: SortKey,
  direction: SortDirection,
  formatLabel: (path: string) => string
) {
  const multiplier = direction === "asc" ? 1 : -1
  const difference =
    sortKey === "path"
      ? formatLabel(first.path).localeCompare(formatLabel(second.path), "ko")
      : first[sortKey] - second[sortKey]

  if (difference !== 0) return difference * multiplier
  return first.path.localeCompare(second.path, "ko")
}

interface SortHeaderProps {
  align?: "left" | "right"
  label: string
  sortKey: SortKey
  activeSortKey: SortKey
  direction: SortDirection
  onSort: (sortKey: SortKey) => void
}

function SortHeader({
  align = "right",
  label,
  sortKey,
  activeSortKey,
  direction,
  onSort,
}: SortHeaderProps) {
  const active = sortKey === activeSortKey
  const nextDirection = active
    ? direction === "asc"
      ? "내림차순"
      : "오름차순"
    : DEFAULT_SORT_DIRECTION[sortKey] === "asc"
      ? "오름차순"
      : "내림차순"

  return (
    <th
      scope="col"
      aria-sort={active ? (direction === "asc" ? "ascending" : "descending") : "none"}
      className={`px-3 text-[12px] font-semibold text-[#615D59] ${
        align === "left" ? "text-left" : "text-right"
      }`}
    >
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        aria-label={`${label}: ${nextDirection}으로 정렬`}
        className={`inline-flex min-h-11 items-center gap-1 rounded-md px-1.5 transition-colors hover:bg-[#F6F5F4] hover:text-[#111110] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#084734] ${
          align === "right" ? "flex-row-reverse" : ""
        } ${active ? "text-[#111110]" : ""}`}
      >
        <span>{label}</span>
        {active ? (
          direction === "asc" ? (
            <ArrowUp aria-hidden="true" className="h-3.5 w-3.5 shrink-0 text-[#084734]" />
          ) : (
            <ArrowDown aria-hidden="true" className="h-3.5 w-3.5 shrink-0 text-[#084734]" />
          )
        ) : (
          <ChevronsUpDown aria-hidden="true" className="h-3.5 w-3.5 shrink-0 text-[#A39E98]" />
        )}
      </button>
    </th>
  )
}

export default function PagePerformanceTable({
  rows,
  formatLabel = defaultFormatLabel,
  formatDuration = defaultFormatDuration,
}: PagePerformanceTableProps) {
  const [sortKey, setSortKey] = useState<SortKey>("pageViews")
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc")
  const [expanded, setExpanded] = useState(false)
  const rowsRegionId = useId()

  const sortedRows = useMemo(
    () =>
      [...rows].sort((first, second) =>
        compareRows(first, second, sortKey, sortDirection, formatLabel)
      ),
    [formatLabel, rows, sortDirection, sortKey]
  )
  const visibleRows = expanded ? sortedRows : sortedRows.slice(0, INITIAL_VISIBLE_ROWS)
  const hasMoreRows = sortedRows.length > INITIAL_VISIBLE_ROWS

  const handleSort = (nextSortKey: SortKey) => {
    if (sortKey === nextSortKey) {
      setSortDirection((current) => (current === "asc" ? "desc" : "asc"))
      return
    }

    setSortKey(nextSortKey)
    setSortDirection(DEFAULT_SORT_DIRECTION[nextSortKey])
  }

  if (rows.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-[rgba(0,0,0,0.08)] bg-[#FAFAF8] px-4 py-10 text-center text-[13px] text-[#615D59]">
        페이지 성과 데이터가 없습니다.
      </p>
    )
  }

  return (
    <div>
      <div id={rowsRegionId}>
        <div className="hidden md:block">
          <table className="w-full table-fixed border-separate border-spacing-0">
            <caption className="sr-only">페이지별 페이지뷰, 방문자, 평균 체류 시간, 이탈률</caption>
            <colgroup>
              <col className="w-[40%]" />
              <col className="w-[15%]" />
              <col className="w-[15%]" />
              <col className="w-[17%]" />
              <col className="w-[13%]" />
            </colgroup>
            <thead>
              <tr className="h-11 bg-[#F6F5F4]">
                <SortHeader
                  align="left"
                  label="페이지"
                  sortKey="path"
                  activeSortKey={sortKey}
                  direction={sortDirection}
                  onSort={handleSort}
                />
                <SortHeader
                  label="페이지뷰"
                  sortKey="pageViews"
                  activeSortKey={sortKey}
                  direction={sortDirection}
                  onSort={handleSort}
                />
                <SortHeader
                  label="방문자"
                  sortKey="visitors"
                  activeSortKey={sortKey}
                  direction={sortDirection}
                  onSort={handleSort}
                />
                <SortHeader
                  label="평균 체류"
                  sortKey="avgDwellSeconds"
                  activeSortKey={sortKey}
                  direction={sortDirection}
                  onSort={handleSort}
                />
                <SortHeader
                  label="이탈률"
                  sortKey="exitRate"
                  activeSortKey={sortKey}
                  direction={sortDirection}
                  onSort={handleSort}
                />
              </tr>
            </thead>
            <tbody>
              {visibleRows.map((row, index) => (
                <tr
                  key={`${row.path}-${index}`}
                  className="transition-colors hover:bg-[#FAFAF8]"
                >
                  <th
                    scope="row"
                    title={formatLabel(row.path)}
                    className="border-t border-[rgba(0,0,0,0.08)] px-4 py-3.5 text-left font-mono text-[12px] font-medium text-[#111110]"
                  >
                    <span className="block truncate">{formatLabel(row.path)}</span>
                  </th>
                  <td className="border-t border-[rgba(0,0,0,0.08)] px-4 py-3.5 text-right text-[13px] font-semibold tabular-nums text-[#111110]">
                    {NUMBER_FORMATTER.format(row.pageViews)}
                  </td>
                  <td className="border-t border-[rgba(0,0,0,0.08)] px-4 py-3.5 text-right text-[13px] tabular-nums text-[#31302E]">
                    {NUMBER_FORMATTER.format(row.visitors)}
                  </td>
                  <td className="border-t border-[rgba(0,0,0,0.08)] px-4 py-3.5 text-right text-[13px] tabular-nums text-[#31302E]">
                    {formatDuration(row.avgDwellSeconds)}
                  </td>
                  <td className="border-t border-[rgba(0,0,0,0.08)] px-4 py-3.5 text-right text-[13px] font-semibold tabular-nums text-[#111110]">
                    {PERCENT_FORMATTER.format(row.exitRate)}%
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <ol className="space-y-2 md:hidden">
          {visibleRows.map((row, index) => (
            <li
              key={`${row.path}-${index}`}
              className="min-w-0 rounded-xl border border-[rgba(0,0,0,0.08)] bg-white px-4 py-3.5"
            >
              <p className="break-words font-mono text-[12px] font-semibold leading-5 text-[#111110]">
                {formatLabel(row.path)}
              </p>
              <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-3">
                <div>
                  <dt className="text-[12px] font-medium text-[#615D59]">PV</dt>
                  <dd className="mt-0.5 text-[14px] font-semibold tabular-nums text-[#111110]">
                    {NUMBER_FORMATTER.format(row.pageViews)}
                  </dd>
                </div>
                <div>
                  <dt className="text-[12px] font-medium text-[#615D59]">방문자</dt>
                  <dd className="mt-0.5 text-[14px] font-semibold tabular-nums text-[#111110]">
                    {NUMBER_FORMATTER.format(row.visitors)}
                  </dd>
                </div>
                <div>
                  <dt className="text-[12px] font-medium text-[#615D59]">체류</dt>
                  <dd className="mt-0.5 text-[14px] font-semibold tabular-nums text-[#111110]">
                    {formatDuration(row.avgDwellSeconds)}
                  </dd>
                </div>
                <div>
                  <dt className="text-[12px] font-medium text-[#615D59]">이탈률</dt>
                  <dd className="mt-0.5 text-[14px] font-semibold tabular-nums text-[#111110]">
                    {PERCENT_FORMATTER.format(row.exitRate)}%
                  </dd>
                </div>
              </dl>
            </li>
          ))}
        </ol>
      </div>

      {hasMoreRows ? (
        <div className="mt-3 flex justify-center border-t border-[rgba(0,0,0,0.08)] pt-3">
          <button
            type="button"
            aria-controls={rowsRegionId}
            aria-expanded={expanded}
            onClick={() => setExpanded((current) => !current)}
            className="inline-flex min-h-11 items-center justify-center rounded-md px-4 text-[13px] font-semibold text-[#084734] transition-colors hover:bg-[#ECFDF5] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#084734]"
          >
            {expanded ? "접기" : `전체 보기 (${NUMBER_FORMATTER.format(sortedRows.length)})`}
          </button>
        </div>
      ) : null}
    </div>
  )
}
