"use client"

import { useEffect, useMemo, useState, type MouseEvent } from "react"
import { ArrowDown, ArrowUp, ChevronDown, ChevronRight, Download, Loader2, RefreshCw, X } from "lucide-react"

import {
  DEFAULT_RECEIVABLE_VIEW_STATE,
  RECEIVABLE_AGE_BUCKET_LABELS,
  RECEIVABLE_GROUP_LABELS,
  RECEIVABLE_STATUS_FILTER_LABELS,
  buildReceivableMonthlyFlow,
  buildReceivableViewRows,
  buildReceivablesCsvRows,
  filterReceivableRows,
  groupReceivableRows,
  parseReceivableViewState,
  sortReceivableRows,
  summarizeReceivables,
  writeReceivableViewState,
  type ReceivableFilters,
  type ReceivableGroupKey,
  type ReceivableSortKey,
  type ReceivableStatusFilter,
  type ReceivableViewRow,
  type ReceivableViewState,
} from "@/lib/distributor-receivables-view"
import {
  DISTRIBUTOR_ISSUE_REASON_LABELS,
  DISTRIBUTOR_STATUS_LABELS,
  type DistributorReceivablePayment,
} from "@/lib/distributor-settlements"
import { downloadCsvFile } from "@/lib/export/browser-download"
import { fileDateStamp, safeFileName, toCsv } from "@/lib/export/delimited"
import type { DistributorReceivableRow } from "@/lib/repositories/distributor-settlements"

import { ReceivableAgeBar, ReceivableMonthlyFlow, ReceivableSummaryTiles } from "./DistributorReceivablesParts"
import { GHOST_BUTTON, INPUT, formatDateLabel, formatWon } from "./distributor-ui"

// 총판 미수금 보드 — 요약 → 경과 구간 → 월별 흐름 → 검토 대기 → 도구 줄 → 표.
// props 로만 동작한다(자체 fetch 없음). 계산은 lib/distributor-receivables-view.ts, 보던 조건은 주소(rst/rsort/rgroup…)에 남긴다.

export interface DistributorReceivablesBoardProps {
  rows: DistributorReceivableRow[]
  payments: DistributorReceivablePayment[]
  reviews: DistributorReceivableRow[]
  truncated: boolean
  /** YYYY-MM-DD(운영 = KST). */
  today: string
  loading: boolean
  onRefresh: () => void
  onOpenQuote: (quoteId: string) => void
  /** 초기 보기 상태. 주면 주소에서 읽지 않는다(서버 렌더 테스트용). */
  initialState?: ReceivableViewState
}

export function receivableQuoteHref(quoteId: string): string {
  return `/admin/quotes?tab=hardware&quote=${encodeURIComponent(quoteId)}`
}

function dueText(view: ReceivableViewRow): { text: string; tone: string } | null {
  if (view.outstanding <= 0) return null
  if (view.daysUntilDue == null) return { text: "기한 미입력", tone: "font-semibold text-[#7A520F]" }
  if (view.daysUntilDue < 0) {
    return { text: `${-view.daysUntilDue}일 경과`, tone: view.overdue ? "font-semibold text-[#B43E3E]" : "text-[#31302E]" }
  }
  if (view.daysUntilDue === 0) return { text: "오늘", tone: "font-semibold text-[#31302E]" }
  return { text: `D-${view.daysUntilDue}`, tone: "text-[#31302E]" }
}

const DEFAULT_DIR: Record<ReceivableSortKey, "asc" | "desc"> = {
  customer: "asc",
  due: "asc",
  issued: "desc",
  age: "desc",
  total: "desc",
  outstanding: "desc",
}

const SORT_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "issued.desc", label: "발행 최신순" },
  { value: "outstanding.desc", label: "남은 금액 큰 순" },
  { value: "age.desc", label: "오래된 순(경과)" },
  { value: "due.asc", label: "기한 빠른 순" },
  { value: "customer.asc", label: "고객명순" },
]

function ReceivableCard({
  view,
  onOpen,
}: {
  view: ReceivableViewRow
  onOpen: (event: MouseEvent<HTMLElement>, quoteId: string) => void
}) {
  const { row } = view
  const due = dueText(view)
  return (
    <li
      onClick={(event) => onOpen(event, row.quoteDocumentId)}
      className="cursor-pointer border-b border-[#f0f0ec] px-5 py-3 active:bg-[#F6F5F4]"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <a
            href={receivableQuoteHref(row.quoteDocumentId)}
            className="block truncate text-[13px] font-semibold text-[#111110] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#084734]"
          >
            {row.customerName ?? "고객 미상"}
          </a>
          <span className="block text-[11.5px] text-[#78736D]">
            <span className="font-mono">{row.quoteNumber ?? "—"}</span> · {row.distributorName}
          </span>
        </div>
        <span
          className={`shrink-0 text-[15px] font-bold tabular-nums ${view.outstanding > 0 ? "text-[#111110]" : "text-[#084734]"}`}
        >
          {formatWon(view.outstanding)}
        </span>
      </div>
      <p className="mt-1 text-[12.5px] text-[#31302E]">
        {due && <span className={`tabular-nums ${due.tone}`}>{due.text}</span>}
        {due && " · "}
        {row.dueDate && <span className="tabular-nums text-[#78736D]">{row.dueDate} · </span>}
        <span className="text-[#78736D]">{DISTRIBUTOR_STATUS_LABELS[row.status]}</span>
      </p>
      <p className="mt-1 text-[11.5px] tabular-nums text-[#78736D]">
        {view.issuedDate ?? "발행일 없음"}
        {view.ageDays != null && ` · 발행 후 ${view.ageDays}일`}
        {` · 청구 ${formatWon(row.totalAmount)} / 입금 ${formatWon(row.paidAmount)}`}
        {view.lastPaidOn && ` (${view.lastPaidOn})`}
      </p>
    </li>
  )
}

function SortHeader({
  label,
  sortKey,
  sort,
  onSort,
  align = "left",
  className = "",
}: {
  label: string
  sortKey: ReceivableSortKey
  sort: ReceivableViewState["sort"]
  onSort: (key: ReceivableSortKey) => void
  align?: "left" | "right"
  className?: string
}) {
  const active = sort.key === sortKey
  return (
    <th
      scope="col"
      aria-sort={active ? (sort.dir === "asc" ? "ascending" : "descending") : "none"}
      className={`py-1 font-semibold ${align === "right" ? "text-right" : "text-left"} ${className}`}
    >
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        className={`inline-flex min-h-9 items-center gap-1 rounded px-1 font-semibold hover:text-[#111110] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#084734] ${
          active ? "text-[#111110]" : ""
        }`}
      >
        {label}
        {active && (sort.dir === "asc" ? <ArrowUp className="h-3 w-3" aria-hidden="true" /> : <ArrowDown className="h-3 w-3" aria-hidden="true" />)}
      </button>
    </th>
  )
}

function Chip({ label, onClear }: { label: string; onClear: () => void }) {
  return (
    <button
      type="button"
      onClick={onClear}
      aria-label={`${label} 필터 지우기`}
      className="inline-flex h-9 items-center gap-1.5 rounded-md border border-[#31302E] bg-white px-2.5 text-[12.5px] font-semibold text-[#31302E] hover:bg-[#F6F5F4] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#084734]"
    >
      {label}
      <X className="h-3 w-3" aria-hidden="true" />
    </button>
  )
}

function sameFilters(a: ReceivableFilters, b: ReceivableFilters): boolean {
  return (
    a.query.trim() === b.query.trim() &&
    a.status === b.status &&
    a.distributor === b.distributor &&
    a.bucket === b.bucket &&
    a.month === b.month
  )
}

export default function DistributorReceivablesBoard({
  rows,
  payments,
  reviews,
  truncated,
  today,
  loading,
  onRefresh,
  onOpenQuote,
  initialState,
}: DistributorReceivablesBoardProps) {
  const [state, setState] = useState<ReceivableViewState>(initialState ?? DEFAULT_RECEIVABLE_VIEW_STATE)
  // 주소는 마운트 뒤에 읽는다(서버 렌더와 첫 클라이언트 렌더를 같게 — hydration 불일치 방지).
  const [urlReady, setUrlReady] = useState(Boolean(initialState))
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(() => new Set())

  useEffect(() => {
    if (initialState) return
    setState(parseReceivableViewState(new URLSearchParams(window.location.search)))
    setUrlReady(true)
    // 마운트 때 한 번만 읽는다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // 바뀔 때마다 주소에 쓴다 — tab 등 다른 키는 그대로 두고 history 는 쌓지 않는다.
  useEffect(() => {
    if (!urlReady || typeof window === "undefined") return
    const url = new URL(window.location.href)
    writeReceivableViewState(url.searchParams, state)
    if (url.toString() !== window.location.href) window.history.replaceState(window.history.state, "", url.toString())
  }, [state, urlReady])

  const { filters, sort, group } = state
  const patchFilters = (patch: Partial<ReceivableFilters>) =>
    setState((current) => ({ ...current, filters: { ...current.filters, ...patch } }))

  const viewRows = useMemo(() => buildReceivableViewRows(rows, payments, today), [rows, payments, today])
  // 요약·구간·월별은 필터와 무관하게 전체 발행분 기준이다.
  const summary = useMemo(() => summarizeReceivables(viewRows), [viewRows])
  const monthly = useMemo(() => buildReceivableMonthlyFlow(viewRows, payments, { months: 6, today }), [viewRows, payments, today])
  const visibleRows = useMemo(
    () => sortReceivableRows(filterReceivableRows(viewRows, filters), sort),
    [viewRows, filters, sort]
  )
  const groups = useMemo(() => groupReceivableRows(visibleRows, group), [visibleRows, group])
  const visibleSummary = useMemo(() => summarizeReceivables(visibleRows), [visibleRows])
  const distributors = useMemo(
    () => [...new Set(rows.map((row) => row.distributorName))].sort((a, b) => a.localeCompare(b, "ko")),
    [rows]
  )

  const filtersChanged = !sameFilters(filters, DEFAULT_RECEIVABLE_VIEW_STATE.filters)
  const clearFilters = () => patchFilters({ ...DEFAULT_RECEIVABLE_VIEW_STATE.filters })

  function handleSort(key: ReceivableSortKey) {
    setState((current) => ({
      ...current,
      sort:
        current.sort.key === key
          ? { key, dir: current.sort.dir === "asc" ? "desc" : "asc" }
          : { key, dir: DEFAULT_DIR[key] },
    }))
  }

  function toggleGroup(key: string) {
    setCollapsed((current) => {
      const next = new Set(current)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  function exportCsv() {
    if (visibleRows.length === 0) return
    downloadCsvFile(
      `${safeFileName(`총판미수금_${fileDateStamp()}`)}.csv`,
      toCsv(buildReceivablesCsvRows(visibleRows))
    )
  }

  function handleRowClick(event: MouseEvent<HTMLElement>, quoteId: string) {
    if ((event.target as HTMLElement).closest("a,button")) return
    onOpenQuote(quoteId)
  }

  const colCount = 8
  const showGroupHeaders = group !== "none"

  return (
    <div>
      <ReceivableSummaryTiles
        summary={summary}
        status={filters.status}
        onPickStatus={(status) => patchFilters({ status })}
      />
      <ReceivableAgeBar buckets={summary.buckets} selected={filters.bucket} onPick={(bucket) => patchFilters({ bucket })} />
      <ReceivableMonthlyFlow points={monthly} selectedMonth={filters.month} onPick={(month) => patchFilters({ month })} />

      {reviews.length > 0 && (
        <div aria-label="검토 대기" className="border-b border-[#e8e8e4] bg-[#FFFBF2] px-5 py-3">
          <p className="text-[12.5px] font-semibold text-[#7A520F]">
            검토 대기 {reviews.length}건 — 설치 완료로 자동 준비됐거나 자동 발행이 보류된 정산입니다. 확인 후 발행해 주세요.
          </p>
          <ul className="mt-1.5">
            {reviews.map((row) => (
              <li key={row.id} className="flex flex-wrap items-center justify-between gap-2 border-t border-[#F2E6CC] py-2 first:border-t-0">
                <span className="min-w-0 flex-1 text-[12.5px] text-[#31302E]">
                  <span className="font-semibold">{row.customerName ?? "고객"}</span>
                  <span className="text-[#78736D]"> · {row.quoteNumber ?? "견적"} · {row.fulfillmentMode}방식</span>
                  <span className="mt-0.5 block text-[11.5px] text-[#615D59]">{row.reviewRequiredReason}</span>
                </span>
                <button type="button" onClick={() => onOpenQuote(row.quoteDocumentId)} className={GHOST_BUTTON}>
                  검토하기
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {truncated && (
        <p role="status" className="border-b border-[#ECD29C] bg-[#FBF1E0] px-5 py-2.5 text-[12.5px] text-[#7A520F]">
          최근 500건까지만 불러왔습니다. 그보다 오래된 건은 목록·요약·합계에 빠져 있을 수 있습니다.
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2 border-b border-[#e8e8e4] px-5 py-3">
        <input
          type="search"
          aria-label="미수금 검색(고객·견적번호·총판·딜)"
          placeholder="고객·견적번호·총판·딜 검색"
          value={filters.query}
          onChange={(event) => patchFilters({ query: event.target.value })}
          className={`${INPUT} sm:w-64`}
        />
        <select
          aria-label="상태"
          value={filters.status}
          onChange={(event) => patchFilters({ status: event.target.value as ReceivableStatusFilter })}
          className={`${INPUT} sm:w-auto`}
        >
          {(Object.keys(RECEIVABLE_STATUS_FILTER_LABELS) as ReceivableStatusFilter[]).map((key) => (
            <option key={key} value={key}>{RECEIVABLE_STATUS_FILTER_LABELS[key]}</option>
          ))}
        </select>
        {distributors.length >= 2 && (
          <select
            aria-label="총판"
            value={filters.distributor ?? ""}
            onChange={(event) => patchFilters({ distributor: event.target.value || null })}
            className={`${INPUT} sm:w-auto`}
          >
            <option value="">모든 총판</option>
            {distributors.map((name) => (
              <option key={name} value={name}>{name}</option>
            ))}
          </select>
        )}
        <select
          aria-label="묶음"
          value={group}
          onChange={(event) => setState((current) => ({ ...current, group: event.target.value as ReceivableGroupKey }))}
          className={`${INPUT} sm:w-auto`}
        >
          {(Object.keys(RECEIVABLE_GROUP_LABELS) as ReceivableGroupKey[]).map((key) => (
            <option key={key} value={key}>{RECEIVABLE_GROUP_LABELS[key]}</option>
          ))}
        </select>
        <select
          aria-label="정렬"
          value={`${sort.key}.${sort.dir}`}
          onChange={(event) => {
            const [key, dir] = event.target.value.split(".")
            setState((current) => ({ ...current, sort: { key: key as ReceivableSortKey, dir: dir as "asc" | "desc" } }))
          }}
          className={`${INPUT} sm:hidden`}
        >
          {!SORT_OPTIONS.some((option) => option.value === `${sort.key}.${sort.dir}`) && (
            <option value={`${sort.key}.${sort.dir}`}>직접 정렬</option>
          )}
          {SORT_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>{option.label}</option>
          ))}
        </select>
        {filters.bucket && (
          <Chip label={`경과 ${RECEIVABLE_AGE_BUCKET_LABELS[filters.bucket]}`} onClear={() => patchFilters({ bucket: null })} />
        )}
        {filters.month && <Chip label={`${filters.month} 발행분`} onClear={() => patchFilters({ month: null })} />}
        {filtersChanged && (
          <button type="button" onClick={clearFilters} className={GHOST_BUTTON}>
            필터 지우기
          </button>
        )}
        <div className="ml-auto flex items-center gap-2">
          <button type="button" onClick={exportCsv} disabled={visibleRows.length === 0} className={GHOST_BUTTON}>
            <Download className="h-3.5 w-3.5" aria-hidden="true" />
            CSV 내보내기
          </button>
          <button type="button" onClick={onRefresh} disabled={loading} className={GHOST_BUTTON}>
            {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />}
            새로고침
          </button>
        </div>
      </div>

      {loading && rows.length === 0 ? (
        <p role="status" className="flex items-center gap-2 px-5 py-6 text-xs text-[#78736D]">
          <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
          불러오는 중
        </p>
      ) : rows.length === 0 ? (
        <p className="px-5 py-6 text-sm text-[#615D59]">발행된 총판 견적서가 없습니다.</p>
      ) : visibleRows.length === 0 ? (
        <div className="px-5 py-6">
          <p className="text-sm text-[#615D59]">조건에 맞는 건이 없습니다.</p>
          <button type="button" onClick={clearFilters} className={`${GHOST_BUTTON} mt-3`}>
            필터 지우기
          </button>
        </div>
      ) : (
        <>
        <div className="hidden overflow-x-auto sm:block">
          <table className="w-full min-w-[960px] text-[12.5px]">
            <caption className="sr-only">총판 미수금 목록 — 머리글 버튼으로 정렬합니다.</caption>
            <thead>
              <tr className="border-b border-[#e8e8e4] text-[11px] text-[#78736D]">
                <SortHeader label="견적" sortKey="customer" sort={sort} onSort={handleSort} className="pl-4 pr-2" />
                <th scope="col" className="py-2 text-left font-semibold">총판</th>
                <SortHeader label="발행" sortKey="issued" sort={sort} onSort={handleSort} />
                <SortHeader label="경과" sortKey="age" sort={sort} onSort={handleSort} align="right" className="pl-2" />
                <SortHeader label="청구" sortKey="total" sort={sort} onSort={handleSort} align="right" className="pl-2" />
                <th scope="col" className="py-2 pl-2 text-right font-semibold">입금</th>
                <SortHeader label="남은 금액" sortKey="outstanding" sort={sort} onSort={handleSort} align="right" className="pl-2" />
                <SortHeader label="기한 · 상태" sortKey="due" sort={sort} onSort={handleSort} align="right" className="pl-2 pr-4" />
              </tr>
            </thead>
            {groups.map((section) => {
              const isCollapsed = showGroupHeaders && collapsed.has(section.key)
              return (
                <tbody key={section.key}>
                  {showGroupHeaders && (
                    <tr className="border-b border-[#e8e8e4] bg-[#F6F5F4] text-[12px]">
                      <th scope="rowgroup" colSpan={4} className="py-1 pl-4 pr-2 text-left font-semibold text-[#111110]">
                        <button
                          type="button"
                          onClick={() => toggleGroup(section.key)}
                          aria-expanded={!isCollapsed}
                          className="inline-flex min-h-9 items-center gap-1.5 rounded px-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#084734]"
                        >
                          {isCollapsed ? <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" /> : <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />}
                          {section.label}
                          <span className="font-normal text-[#78736D]">{section.count}건</span>
                        </button>
                      </th>
                      <td className="py-1 pl-2 text-right font-semibold tabular-nums">{formatWon(section.totalAmount)}</td>
                      <td className="py-1 pl-2 text-right font-semibold tabular-nums text-[#615D59]">{formatWon(section.paidAmount)}</td>
                      <td className="py-1 pl-2 text-right font-semibold tabular-nums">{formatWon(section.outstandingAmount)}</td>
                      <td className="py-1 pl-2 pr-4 text-right text-[11.5px] text-[#78736D]">
                        {section.overdueCount > 0 ? `기한 경과 ${section.overdueCount}건` : ""}
                      </td>
                    </tr>
                  )}
                  {!isCollapsed &&
                    section.rows.map((view) => {
                      const { row } = view
                      const due = dueText(view)
                      return (
                        <tr
                          key={row.id}
                          onClick={(event) => handleRowClick(event, row.quoteDocumentId)}
                          className="cursor-pointer border-b border-[#f0f0ec] hover:bg-[#F6F5F4]"
                        >
                          <td className="py-2.5 pl-5 pr-2">
                            <a
                              href={receivableQuoteHref(row.quoteDocumentId)}
                              className="block font-semibold text-[#111110] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#084734]"
                            >
                              {row.customerName ?? "고객 미상"}
                            </a>
                            <span className="font-mono text-[11px] text-[#78736D]">{row.quoteNumber ?? "—"}</span>
                          </td>
                          <td className="py-2.5 text-[#31302E]">{row.distributorName}</td>
                          <td className="py-2.5 text-[#31302E]">
                            {formatDateLabel(row.issuedAt) ?? "—"}
                            {row.issueReason && (
                              <span className="block text-[11px] text-[#78736D]">{DISTRIBUTOR_ISSUE_REASON_LABELS[row.issueReason]}</span>
                            )}
                          </td>
                          <td className="py-2.5 pl-2 text-right tabular-nums text-[#31302E]">
                            {view.ageDays == null ? "—" : `${view.ageDays}일`}
                          </td>
                          <td className="py-2.5 pl-2 text-right tabular-nums">{formatWon(row.totalAmount)}</td>
                          <td className="py-2.5 pl-2 text-right tabular-nums text-[#615D59]">
                            {formatWon(row.paidAmount)}
                            {view.lastPaidOn && <span className="block text-[11px] text-[#78736D]">{view.lastPaidOn}</span>}
                          </td>
                          <td className={`py-2.5 pl-2 text-right font-semibold tabular-nums ${view.outstanding > 0 ? "text-[#111110]" : "text-[#084734]"}`}>
                            {formatWon(view.outstanding)}
                          </td>
                          <td className="py-2.5 pl-2 pr-5 text-right">
                            {due && <span className={`block tabular-nums ${due.tone}`}>{due.text}</span>}
                            {row.dueDate && <span className="block text-[11px] tabular-nums text-[#78736D]">{row.dueDate}</span>}
                            <span className="text-[11px] text-[#78736D]">{DISTRIBUTOR_STATUS_LABELS[row.status]}</span>
                          </td>
                        </tr>
                      )
                    })}
                </tbody>
              )
            })}
            <tfoot>
              <tr className="border-t border-[#e8e8e4] bg-[#FAFAF8] font-semibold">
                <th scope="row" colSpan={4} className="py-2.5 pl-5 pr-2 text-left text-[#31302E]">
                  표시 중 {visibleSummary.count}건 합계
                </th>
                <td className="py-2.5 pl-2 text-right tabular-nums">{formatWon(visibleSummary.totalAmount)}</td>
                <td className="py-2.5 pl-2 text-right tabular-nums text-[#615D59]">{formatWon(visibleSummary.paidAmount)}</td>
                <td className="py-2.5 pl-2 text-right tabular-nums">{formatWon(visibleSummary.openAmount)}</td>
                <td colSpan={colCount - 7} />
              </tr>
            </tfoot>
          </table>
        </div>

        <div className="sm:hidden">
          {groups.map((section) => {
            const isCollapsed = showGroupHeaders && collapsed.has(section.key)
            return (
              <section key={section.key} aria-label={showGroupHeaders ? section.label : "미수금 목록"}>
                {showGroupHeaders && (
                  <div className="flex items-center justify-between gap-2 border-b border-[#e8e8e4] bg-[#F6F5F4] px-4 py-1 text-[12px]">
                    <button
                      type="button"
                      onClick={() => toggleGroup(section.key)}
                      aria-expanded={!isCollapsed}
                      className="inline-flex min-h-9 items-center gap-1.5 rounded px-1 font-semibold text-[#111110] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#084734]"
                    >
                      {isCollapsed ? <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" /> : <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />}
                      {section.label}
                      <span className="font-normal text-[#78736D]">{section.count}건</span>
                    </button>
                    <span className="font-semibold tabular-nums">{formatWon(section.outstandingAmount)}</span>
                  </div>
                )}
                {!isCollapsed && (
                  <ul>
                    {section.rows.map((view) => (
                      <ReceivableCard key={view.row.id} view={view} onOpen={handleRowClick} />
                    ))}
                  </ul>
                )}
              </section>
            )
          })}
          <dl className="space-y-0.5 bg-[#FAFAF8] px-5 py-3 text-[12.5px] tabular-nums">
            <dt className="font-semibold text-[#31302E]">표시 중 {visibleSummary.count}건 합계</dt>
            <dd className="flex justify-between"><span className="text-[#78736D]">청구</span><span className="font-semibold">{formatWon(visibleSummary.totalAmount)}</span></dd>
            <dd className="flex justify-between"><span className="text-[#78736D]">입금</span><span className="font-semibold text-[#615D59]">{formatWon(visibleSummary.paidAmount)}</span></dd>
            <dd className="flex justify-between"><span className="text-[#78736D]">남은 금액</span><span className="font-semibold">{formatWon(visibleSummary.openAmount)}</span></dd>
          </dl>
        </div>
        </>
      )}
    </div>
  )
}
