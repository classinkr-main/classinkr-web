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
  /** 사이트 전체 페이지뷰 — 주면 페이지뷰 옆에 전체 대비 비중(%)을 붙인다. */
  totalPageViews?: number
  formatDuration?: (seconds: number) => string
}

type SortKey = "path" | "pageViews" | "visitors" | "avgDwellSeconds" | "exitRate"
type SortDirection = "asc" | "desc"

const INITIAL_VISIBLE_ROWS = 10
// 이 이상이면 '들어와서 바로 나가는' 페이지로 본다 — 색으로만 구분하지 않도록 굵기·문구도 같이 바꾼다.
const HIGH_EXIT_RATE = 60

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

// 공개 사이트 경로 → 사람이 읽는 이름. 모르는 경로는 경로 그대로 보인다.
const PAGE_NAMES: Record<string, string> = {
  "/": "홈",
  "/product": "제품 소개",
  "/product/sw": "소프트웨어",
  "/product/hw": "하드웨어 · Classin Board",
  "/product/ai-report": "녹화·AI 리포트",
  "/pricing": "가격",
  "/contact": "상담 신청",
  "/showroom": "쇼룸",
  "/blog": "블로그",
  "/events": "행사",
  "/updates": "업데이트",
  "/faq": "FAQ",
  "/about": "회사 소개",
  "/docs": "문서센터",
  "/docs/search": "문서 검색",
  "/download": "다운로드",
  "/login": "로그인",
  "/resources": "자료실",
  "/privacy": "개인정보처리방침",
  "/terms": "이용약관",
  __exit__: "사이트 이탈",
}

const PREFIX_NAMES: Array<[string, string]> = [
  ["/blog/", "블로그 글"],
  ["/docs/", "문서"],
  ["/events/", "행사 상세"],
  ["/resources/", "자료"],
  ["/updates/", "업데이트 글"],
  ["/l/", "캠페인 랜딩"],
]

export function pageName(path: string) {
  if (PAGE_NAMES[path]) return PAGE_NAMES[path]
  return PREFIX_NAMES.find(([prefix]) => path.startsWith(prefix))?.[1] ?? path
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
  direction: SortDirection
) {
  const multiplier = direction === "asc" ? 1 : -1
  const difference =
    sortKey === "path"
      ? pageName(first.path).localeCompare(pageName(second.path), "ko")
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
      className={`px-3 text-[11px] font-semibold text-[#615D59] ${
        align === "left" ? "text-left" : "text-right"
      }`}
    >
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        aria-label={`${label}: ${nextDirection}으로 정렬`}
        className={`inline-flex min-h-8 items-center gap-1 rounded-md px-1 transition-colors hover:bg-[#F6F5F4] hover:text-[#111110] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#084734] ${
          align === "right" ? "-mr-1 flex-row-reverse" : "-ml-1"
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

function PageNameCell({ path }: { path: string }) {
  const name = pageName(path)
  return (
    <span className="flex min-w-0 items-baseline gap-1.5" title={path}>
      <span className="max-w-full shrink-0 truncate text-[13px] font-semibold text-[#111110]">{name}</span>
      {name !== path ? (
        <span className="min-w-0 truncate font-mono text-[11px] text-[#8A857F]">{path}</span>
      ) : null}
    </span>
  )
}

function ViewsBar({ pageViews, maxPageViews }: { pageViews: number; maxPageViews: number }) {
  return (
    <span aria-hidden="true" className="mt-1 block h-[3px] overflow-hidden rounded-full bg-[#F0F0EC]">
      <span
        className="block h-full rounded-full bg-[#084734]"
        style={{ width: `${maxPageViews > 0 ? (pageViews / maxPageViews) * 100 : 0}%` }}
      />
    </span>
  )
}

function ExitRate({ value }: { value: number }) {
  const high = value >= HIGH_EXIT_RATE
  return (
    <span className={high ? "font-bold text-[#B43E3E]" : "font-semibold text-[#111110]"}>
      {PERCENT_FORMATTER.format(value)}%
      {high ? <span className="sr-only"> (높음)</span> : null}
    </span>
  )
}

export default function PagePerformanceTable({
  rows,
  totalPageViews,
  formatDuration = defaultFormatDuration,
}: PagePerformanceTableProps) {
  const [sortKey, setSortKey] = useState<SortKey>("pageViews")
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc")
  const [expanded, setExpanded] = useState(false)
  const rowsRegionId = useId()

  const sortedRows = useMemo(
    () => [...rows].sort((first, second) => compareRows(first, second, sortKey, sortDirection)),
    [rows, sortDirection, sortKey]
  )
  const visibleRows = expanded ? sortedRows : sortedRows.slice(0, INITIAL_VISIBLE_ROWS)
  const hasMoreRows = sortedRows.length > INITIAL_VISIBLE_ROWS
  const maxPageViews = rows.reduce((max, row) => Math.max(max, row.pageViews), 0)
  const shareOf = (pageViews: number) =>
    totalPageViews && totalPageViews > 0
      ? ` · ${Math.round((pageViews / totalPageViews) * 100)}%`
      : ""

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
              <col className="w-[38%]" />
              <col className="w-[22%]" />
              <col className="w-[12%]" />
              <col className="w-[14%]" />
              <col className="w-[14%]" />
            </colgroup>
            <thead>
              <tr className="h-9 bg-[#F6F5F4] [&>*:first-child]:pl-4 [&>*:last-child]:pr-4">
                <SortHeader
                  align="left"
                  label="페이지"
                  sortKey="path"
                  activeSortKey={sortKey}
                  direction={sortDirection}
                  onSort={handleSort}
                />
                <SortHeader
                  label={totalPageViews ? "페이지뷰 · 비중" : "페이지뷰"}
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
                  className="transition-colors hover:bg-[#FAFAF8] [&>*:first-child]:pl-4 [&>*:last-child]:pr-4"
                >
                  <th
                    scope="row"
                    className="border-t border-[rgba(0,0,0,0.08)] px-3 py-2 text-left font-normal"
                  >
                    <PageNameCell path={row.path} />
                  </th>
                  <td className="border-t border-[rgba(0,0,0,0.08)] px-3 py-2 text-right text-[13px] tabular-nums">
                    <span className="font-semibold text-[#111110]">
                      {NUMBER_FORMATTER.format(row.pageViews)}
                    </span>
                    <span className="text-[12px] text-[#8A857F]">{shareOf(row.pageViews)}</span>
                    <ViewsBar pageViews={row.pageViews} maxPageViews={maxPageViews} />
                  </td>
                  <td className="border-t border-[rgba(0,0,0,0.08)] px-3 py-2 text-right text-[13px] tabular-nums text-[#31302E]">
                    {NUMBER_FORMATTER.format(row.visitors)}
                  </td>
                  <td className="border-t border-[rgba(0,0,0,0.08)] px-3 py-2 text-right text-[13px] tabular-nums text-[#31302E]">
                    {formatDuration(row.avgDwellSeconds)}
                  </td>
                  <td className="border-t border-[rgba(0,0,0,0.08)] px-3 py-2 text-right text-[13px] tabular-nums">
                    <ExitRate value={row.exitRate} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <ol className="space-y-1.5 md:hidden">
          {visibleRows.map((row, index) => (
            <li
              key={`${row.path}-${index}`}
              className="min-w-0 rounded-xl border border-[rgba(0,0,0,0.08)] bg-white px-3 py-2.5"
            >
              <PageNameCell path={row.path} />
              <ViewsBar pageViews={row.pageViews} maxPageViews={maxPageViews} />
              <dl className="mt-2 grid grid-cols-4 gap-x-2">
                <div>
                  <dt className="text-[11px] font-medium text-[#615D59]">페이지뷰</dt>
                  <dd className="mt-0.5 text-[13px] font-semibold tabular-nums text-[#111110]">
                    {NUMBER_FORMATTER.format(row.pageViews)}
                    <span className="text-[12px] font-normal text-[#8A857F]">{shareOf(row.pageViews)}</span>
                  </dd>
                </div>
                <div>
                  <dt className="text-[11px] font-medium text-[#615D59]">방문자</dt>
                  <dd className="mt-0.5 text-[13px] font-semibold tabular-nums text-[#111110]">
                    {NUMBER_FORMATTER.format(row.visitors)}
                  </dd>
                </div>
                <div>
                  <dt className="text-[11px] font-medium text-[#615D59]">체류</dt>
                  <dd className="mt-0.5 text-[13px] font-semibold tabular-nums text-[#111110]">
                    {formatDuration(row.avgDwellSeconds)}
                  </dd>
                </div>
                <div>
                  <dt className="text-[11px] font-medium text-[#615D59]">이탈률</dt>
                  <dd className="mt-0.5 text-[13px] tabular-nums">
                    <ExitRate value={row.exitRate} />
                  </dd>
                </div>
              </dl>
            </li>
          ))}
        </ol>
      </div>

      {hasMoreRows ? (
        <div className="flex justify-center border-t border-[rgba(0,0,0,0.08)] py-1">
          <button
            type="button"
            aria-controls={rowsRegionId}
            aria-expanded={expanded}
            onClick={() => setExpanded((current) => !current)}
            className="inline-flex min-h-9 items-center justify-center rounded-md px-4 text-[12px] font-semibold text-[#084734] transition-colors hover:bg-[#ECFDF5] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#084734]"
          >
            {expanded ? "접기" : `전체 보기 (${NUMBER_FORMATTER.format(sortedRows.length)})`}
          </button>
        </div>
      ) : null}
    </div>
  )
}
