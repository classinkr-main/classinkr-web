"use client"

// 결과 섹션 — 정렬 툴바 · 데스크톱 테이블 · 모바일 카드 · 페이지네이션 · 빈 상태.
// 상태는 전부 부모(CrmUnifiedCustomersClient)가 소유하고 여기는 표시·콜백만 담당한다.
// CrmUnifiedCustomersClient.tsx 분해(2026-08-28)로 이동. 2026-09-25: 행 선택 체크박스(현재 페이지만)·
// 마지막 연락 열·NEO 신호 줄·서버 정렬(전체 결과 기준) 추가. 같은 날 A안: Compass 매칭 행의 "다음 액션"
// 칸(데스크톱)·카드(모바일)에 "Compass에서 열기 ↗"(UnifiedCompassLink — 매칭이 없으면 아무것도 없음).
// 문구는 공용 판정(resolveCrmWriteSurface)을 따른다 — 전환·NEO 등록 확정 리드와 계정·전환 고객 행은 Home 정본이라
// 보조 "Compass 기록 ↗"(2026-09-26 교차 리뷰 [25]). NEO 등록 확정은 리드 보드와 같은 원천(neo-registered)을
// 여기서 한 번 읽어 넘긴다 — NEO 행이 스냅샷에 없어 안 접힌 등록 리드도 360·리드 보드와 같이 Home 정본(검증 [25] 잔여).

import Link from "next/link"
import { customerDetailHref } from "@/lib/crm/customer-navigation"
import { type MouseEvent, type ReactNode } from "react"
import { ChevronLeft, ChevronRight, ExternalLink, MapPin, PhoneCall, UserPlus } from "lucide-react"
import type { CrmUnifiedCustomerRow } from "@/lib/repositories/crm-unified-customers"
import CrmContactValue from "../CrmContactValue"
import CrmCustomerFlags from "../CrmCustomerFlags"
import { SORT_LABELS, SortableHeaderCell, type SortKey, type SortState } from "./sort"
import { LastContactCell, LeadRowBadges, moneyCell, NeoSignalLine, sourceBadge, TagChips } from "./row-visuals"
import UnifiedCompassLink, { unifiedRowNeedsNeoRegistration, useUnifiedNeoRegisteredLeadIds } from "./UnifiedCompassLink"
import { PAGE_LIMIT, formatDate, rowToFlags, type CrmUnifiedCustomers, type SavedViewFilter } from "./shared"
import { SECONDARY_TEXT_CLASS } from "../home/shared"

// 돈흐름 열 통화 안내 — 외부 CRM(¥잔액·$오더)과 전환 고객(₩계약·미수)이 같은 열에 놓인다.
export const MONEY_COLUMN_CURRENCY_HINT = "외부 CRM: ¥잔액·$오더 / 전환 고객: ₩계약·미수"

// 데스크톱 표 열 폭(%) — 고객·상태·다음 액션·돈흐름·담당·마지막 연락·최근 업데이트(합 100). 2026-10-13 고정 열
// 폭(table-fixed) 위에 2026-09-25 마지막 연락 열을 더해 7열로 나눴다.
export const RESULT_COLUMN_WIDTHS = [24, 11, 16, 15, 10, 12, 12] as const

// 정렬 범위 캡션 — 헤더 정렬은 서버가 현재 조건 전체를 정렬한 뒤 페이지를 자른다(C1). 페이지를 넘겨도
// 순서가 이어진다는 것을 툴바·페이지네이션 양쪽에 같은 문구로 알린다.
export function sortScopeCaption(totalCount: number) {
  return `전체 ${totalCount.toLocaleString("ko-KR")}건 기준`
}

/** 현재 페이지 선택 체크박스 상태 — 전부/일부/없음. */
export function pageSelectionState(pageKeys: readonly string[], selectedKeys: ReadonlySet<string>) {
  const selected = pageKeys.filter((key) => selectedKeys.has(key)).length
  return {
    selected,
    all: pageKeys.length > 0 && selected === pageKeys.length,
    some: selected > 0 && selected < pageKeys.length,
  }
}

export default function CustomerResultsSection({
  data,
  rows,
  loading,
  loadingMore,
  refreshing,
  sort,
  onToggleSort,
  onClearSort,
  savedView,
  hasActiveFilters,
  onResetFilters,
  onOpenDrawer,
  onRowDoubleClick,
  onLoadPage,
  onOpenLeadModal,
  selectedKey = null,
  nowMs,
  selectedKeys,
  onToggleRow,
  onTogglePage,
  toolbarExtra,
}: {
  data: CrmUnifiedCustomers | null
  rows: CrmUnifiedCustomerRow[]
  loading: boolean
  loadingMore: boolean
  refreshing: boolean
  sort: SortState | null
  onToggleSort: (key: SortKey) => void
  onClearSort: () => void
  savedView: SavedViewFilter
  hasActiveFilters: boolean
  onResetFilters: () => void
  onOpenDrawer: (key: string, name: string) => void
  onRowDoubleClick: (event: MouseEvent<HTMLElement>, row: CrmUnifiedCustomerRow) => void
  onLoadPage: (offset: number) => void
  onOpenLeadModal: () => void
  /** 360 드로어(빠른 보기)로 연 행 — 표에서 강조(aria-selected)한다. */
  selectedKey?: string | null
  /** 상대 일수 기준 시각(보통 응답 generatedAt) — 없으면 지금. */
  nowMs?: number
  /** 선택한 행 키(현재 페이지만 고를 수 있다). 생략하면 체크박스를 그리지 않는다. */
  selectedKeys?: ReadonlySet<string>
  onToggleRow?: (key: string) => void
  onTogglePage?: () => void
  /** 툴바 오른쪽 끝 추가 행동(CSV 등). */
  toolbarExtra?: ReactNode
}) {
  const totalCount = data?.pagination.total ?? rows.length
  const scopeCaption = sortScopeCaption(totalCount)
  // 행이 있으면 응답(generatedAt)도 있다 — 없을 때의 0 은 그려질 행이 없어 쓰이지 않는다.
  const baseNowMs = nowMs ?? (data?.generatedAt ? Date.parse(data.generatedAt) : 0)
  const selectable = Boolean(selectedKeys && onToggleRow)
  // 등록 확정 원천은 문구가 바뀔 수 있는 행(Compass 링크가 있는 전환 아닌 리드)이 있을 때만 읽고, 목록 응답이
  // 새로 오면(generatedAt) 다시 읽는다. 조회 전·실패는 미등록 폴백(리드 보드·360 과 같은 쪽).
  const neoRegisteredLeadIds = useUnifiedNeoRegisteredLeadIds(
    rows.some(unifiedRowNeedsNeoRegistration),
    data?.generatedAt ?? null
  )
  const pageSelection = pageSelectionState(
    rows.map((row) => row.key),
    selectedKeys ?? new Set<string>()
  )
  return (
    <section
      className="min-w-0 border-y border-[rgba(0,0,0,0.08)] bg-white"
      aria-label="통합 고객 검색 결과"
      aria-busy={loading || loadingMore || refreshing}
    >
      {/* 정렬 툴바 — 현재 정렬 상태 표시 + 점수 정렬 진입점. 점수 컬럼은 화면에서 제거됐지만
          정렬 옵션으로는 유지한다(이 버튼이 유일한 진입점). 추천순 복귀 버튼은 정렬 활성 시에만 노출. */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#f0f0ec] px-4 py-2">
        <p className={`text-[11px] font-semibold ${SECONDARY_TEXT_CLASS}`}>
          정렬 ·{" "}
          {sort
            ? `${SORT_LABELS[sort.key]} ${sort.direction === "asc" ? "오름차순" : "내림차순"} · ${scopeCaption}`
            : "추천순 (기본)"}
        </p>
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={() => onToggleSort("last_contact")}
            aria-pressed={sort?.key === "last_contact"}
            title="마지막 연락이 오래된 순(기록 없음은 맨 뒤)"
            className={`h-7 rounded-md border px-2.5 text-[11px] font-semibold transition-colors ${
              sort?.key === "last_contact"
                ? "border-[#111110] bg-[#111110] text-white"
                : "border-[#e8e8e4] bg-white text-[#1a1a1a]/55 hover:text-[#111110]"
            }`}
          >
            연락순{sort?.key === "last_contact" ? (sort.direction === "asc" ? " ▲" : " ▼") : ""}
          </button>
          <button
            type="button"
            onClick={() => onToggleSort("score")}
            aria-pressed={sort?.key === "score"}
            title="우선순위 점수 기준 정렬 (기본 내림차순)"
            className={`h-7 rounded-md border px-2.5 text-[11px] font-semibold transition-colors ${
              sort?.key === "score"
                ? "border-[#111110] bg-[#111110] text-white"
                : "border-[#e8e8e4] bg-white text-[#1a1a1a]/55 hover:text-[#111110]"
            }`}
          >
            점수순{sort?.key === "score" ? (sort.direction === "asc" ? " ▲" : " ▼") : ""}
          </button>
          {sort ? (
            <button
              type="button"
              onClick={onClearSort}
              className="h-7 rounded-md border border-[#e8e8e4] bg-white px-2.5 text-[11px] font-semibold text-[#084734] transition-colors hover:bg-[#ECFDF5]"
            >
              추천순으로 되돌리기
            </button>
          ) : null}
          {toolbarExtra}
        </div>
      </div>
      <div className="hidden overflow-x-auto lg:block">
        <table className="w-full min-w-[760px] table-fixed border-collapse text-left">
          <caption className="sr-only">통합 고객 검색 결과 목록</caption>
          {/* 고정 열 폭(table-fixed) — 고객·상태·다음 액션·돈흐름·담당·마지막 연락·최근 업데이트 7열. 선택 체크박스 열
              (selectable)은 고정 40px 로 앞에 붙는다. 열을 더하거나 빼면 이 목록도 같이 고친다(빠지면 끝 열이 0폭). */}
          <colgroup>
            {selectable ? <col style={{ width: "40px" }} /> : null}
            {RESULT_COLUMN_WIDTHS.map((width, index) => <col key={index} style={{ width: `${width}%` }} />)}
          </colgroup>
          <thead className="bg-[#fafaf8] text-[11px] font-semibold uppercase tracking-[0.12em] text-[#1a1a1a]/35">
            <tr>
              {selectable ? (
                <th className="w-10 px-3 py-3">
                  <input
                    type="checkbox"
                    aria-label="이 페이지 고객 모두 선택"
                    checked={pageSelection.all}
                    ref={(element) => {
                      if (element) element.indeterminate = pageSelection.some
                    }}
                    onChange={() => onTogglePage?.()}
                    disabled={rows.length === 0}
                    className="h-4 w-4 accent-[#084734]"
                  />
                </th>
              ) : null}
              <SortableHeaderCell label="고객" sortKey="name" sort={sort} onToggle={onToggleSort} />
              <SortableHeaderCell label="상태" sortKey="status" sort={sort} onToggle={onToggleSort} />
              <th className="px-4 py-3">다음 액션</th>
              <th className="px-4 py-3" title={MONEY_COLUMN_CURRENCY_HINT}>
                돈흐름
                <span className="sr-only"> ({MONEY_COLUMN_CURRENCY_HINT})</span>
              </th>
              <SortableHeaderCell label="담당" sortKey="owner" sort={sort} onToggle={onToggleSort} />
              <SortableHeaderCell label="마지막 연락" sortKey="last_contact" sort={sort} onToggle={onToggleSort} />
              <SortableHeaderCell label="최근 업데이트" sortKey="updated" sort={sort} onToggle={onToggleSort} align="right" />
            </tr>
          </thead>
          <tbody className="divide-y divide-[#f0f0ec]">
            {loading && !data
              ? // 콜드로드 스켈레톤 — 컬럼(선택/고객/상태/다음 액션/돈흐름/담당/마지막 연락/최근 업데이트) 골격 일치.
                Array.from({ length: 8 }).map((_, index) => (
                  <tr key={`sk-${index}`}>
                    {selectable ? <td className="px-3 py-3" /> : null}
                    <td className="px-4 py-3">
                      <div className="h-4 w-40 animate-pulse rounded bg-[#f0f0ec]" />
                      <div className="mt-1.5 h-3 w-24 animate-pulse rounded bg-[#f5f5f2]" />
                    </td>
                    <td className="px-4 py-3">
                      <div className="h-5 w-16 animate-pulse rounded-full bg-[#f0f0ec]" />
                    </td>
                    <td className="px-4 py-3">
                      <div className="h-4 w-28 animate-pulse rounded bg-[#f0f0ec]" />
                    </td>
                    <td className="px-4 py-3">
                      <div className="h-4 w-20 animate-pulse rounded bg-[#f0f0ec]" />
                    </td>
                    <td className="px-4 py-3">
                      <div className="h-4 w-16 animate-pulse rounded bg-[#f0f0ec]" />
                    </td>
                    <td className="px-4 py-3">
                      <div className="h-4 w-16 animate-pulse rounded bg-[#f0f0ec]" />
                    </td>
                    <td className="px-4 py-3">
                      <div className="ml-auto h-4 w-14 animate-pulse rounded bg-[#f0f0ec]" />
                    </td>
                  </tr>
                ))
              : null}
            {rows.map((row) => (
              <tr
                key={row.key}
                onDoubleClick={(event) => onRowDoubleClick(event, row)}
                title={row.source === "customer" ? undefined : "더블클릭 — 고객 전용 페이지 열기"}
                aria-selected={selectedKey === row.key}
                // 빠른 보기로 연 행(selectedKey)이 가장 진하고, 일괄 작업으로 고른 행(selectedKeys)은 웜 화이트로 구분한다.
                className={`transition-colors ${
                  selectedKey === row.key
                    ? "bg-[#ECFDF5]"
                    : selectedKeys?.has(row.key)
                      ? "bg-[#F6F5F4]"
                      : "hover:bg-[#F6F5F4]"
                }`}
              >
                {selectable ? (
                  <td className="w-10 px-3 py-3 align-top">
                    <input
                      type="checkbox"
                      aria-label={`${row.name} 선택`}
                      checked={Boolean(selectedKeys?.has(row.key))}
                      onChange={() => onToggleRow?.(row.key)}
                      className="mt-0.5 h-4 w-4 accent-[#084734]"
                    />
                  </td>
                ) : null}
                <td className="px-4 py-3">
                  <div className="flex min-w-0 items-center gap-2">
                    <div className="min-w-0 flex-1">
                      {row.source === "customer" ? (
                        // 전환 고객은 360 드로어 미지원 — 파트너 워크스페이스(딜)로 이동.
                        <Link href={row.href} className="group block max-w-full text-left">
                          <p className="truncate text-[13px] font-bold text-[#111110] group-hover:underline">{row.name}</p>
                        </Link>
                      ) : (
                        <Link href={customerDetailHref(row.key)} prefetch={false} className="group block max-w-full text-left">
                          <p className="truncate text-[13px] font-bold text-[#111110] group-hover:underline">{row.name}</p>
                        </Link>
                      )}
                      <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
                      <CrmContactValue value={row.contact} />
                      <p className={`inline-flex items-center gap-1 text-[11px] font-semibold ${row.regionLabel ? "text-[#084734]" : "text-[#1a1a1a]/30"}`}>
                        <MapPin className="h-3 w-3" />
                        {row.regionLabel ?? "지역 미지정"}
                      </p>
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-1 empty:hidden">
                        <CrmCustomerFlags flags={rowToFlags(row)} max={4} />
                        <LeadRowBadges row={row} />
                      </div>
                      <TagChips tags={row.tags} />
                    </div>
                    {row.source !== "customer" ? <button type="button" onClick={() => onOpenDrawer(row.key, row.name)} className="min-h-11 shrink-0 px-2 text-[12px] font-medium text-[#615D59] hover:text-[#084734]">빠른 보기</button> : null}
                    <Link
                      href={row.source === "customer" ? row.href : customerDetailHref(row.key)}
                      // 행마다 상세 페이지(360 전체 조회)를 뷰포트 프리페치하지 않는다 — 한 화면 50행이 한꺼번에 서버
                      // 360 을 돌린다. 상세 404 수정(2026-09-29) 뒤로는 프리페치가 본문 렌더까지 실제로 돈다.
                      prefetch={false}
                      className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-[#1a1a1a]/35 transition-colors hover:bg-[#fafaf8] hover:text-[#111110]"
                      aria-label={`${row.name} 고객 상세 페이지 열기`}
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                    </Link>
                  </div>
                </td>
                <td className="px-4 py-3">
                  <div className="flex flex-col gap-1">
                    {sourceBadge(row)}
                    <span className="text-[12px] font-medium text-[#111110]">{row.statusLabel}</span>
                    <NeoSignalLine row={row} />
                  </div>
                </td>
                <td className="px-4 py-3">
                  <p className="text-[12px] font-semibold text-[#111110]">{row.nextActionLabel}</p>
                  <p className="mt-0.5 max-w-[220px] truncate text-[11px] text-[#1a1a1a]/40">{row.priorityReason}</p>
                  {/* A안 — 응대·기록은 Compass 에서. 셀 안 새 탭 링크(행 더블클릭은 a 위에서 무시된다). */}
                  <UnifiedCompassLink row={row} neoRegisteredLeadIds={neoRegisteredLeadIds} className="mt-1" />
                </td>
                <td className="px-4 py-3">{moneyCell(row)}</td>
                <td className="px-4 py-3">
                  <p className="text-[12px] font-semibold text-[#111110]">{row.ownerName ?? "미배정"}</p>
                </td>
                <td className="px-4 py-3">
                  <LastContactCell row={row} nowMs={baseNowMs} />
                </td>
                {/* 점수 컬럼 자리 — 탐색 테이블에서 점수 숫자는 숨기고 최근 업데이트 날짜로 대체. */}
                <td className="px-4 py-3 text-right text-[12px] font-medium tabular-nums text-[#1a1a1a]/55">
                  {formatDate(row.updatedAt)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="divide-y divide-[#f0f0ec] lg:hidden">
        {loading && !data
          ? // 모바일 카드 스켈레톤 — 카드 폴백과 동일 골격.
            Array.from({ length: 5 }).map((_, index) => (
              <div key={`msk-${index}`} className="p-4">
                <div className="h-5 w-16 animate-pulse rounded-full bg-[#f0f0ec]" />
                <div className="mt-2 h-4 w-40 animate-pulse rounded bg-[#f0f0ec]" />
                <div className="mt-1.5 h-3 w-24 animate-pulse rounded bg-[#f5f5f2]" />
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <div className="h-8 animate-pulse rounded-lg bg-[#f5f5f2]" />
                  <div className="h-8 animate-pulse rounded-lg bg-[#f5f5f2]" />
                </div>
              </div>
            ))
          : null}
        {rows.map((row) => (
          <div key={row.key} className={`relative transition-colors ${selectedKey === row.key ? "bg-[#ECFDF5]" : "hover:bg-[#fafaf8]"}`}>
            {selectable ? (
              // 카드 전체가 상세 열기 버튼이라 체크박스는 그 위(z-20)에 따로 둔다.
              <label className="absolute right-3 top-3 z-20 inline-flex min-h-11 min-w-11 cursor-pointer items-center justify-center">
                <input
                  type="checkbox"
                  aria-label={`${row.name} 선택`}
                  checked={Boolean(selectedKeys?.has(row.key))}
                  onChange={() => onToggleRow?.(row.key)}
                  className="h-4 w-4 accent-[#084734]"
                />
              </label>
            ) : null}
            {row.source === "customer" ? (
              <Link href={row.href} aria-label={`${row.name} 상세 보기`} className="absolute inset-0 z-0" />
            ) : (
              <Link href={customerDetailHref(row.key)} prefetch={false} aria-label={`${row.name} 고객 전용 페이지 열기`} className="absolute inset-1 z-0 rounded-xl focus-visible:ring-inset" />
            )}
            <div className="pointer-events-none relative z-10 p-4">
              <div className="mb-2 flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="mb-1">{sourceBadge(row)}</div>
                  <p className="truncate text-[14px] font-bold text-[#111110]">{row.name}</p>
                  <CrmContactValue value={row.contact} className="pointer-events-auto mt-0.5" />
                  <p className={`mt-1 inline-flex items-center gap-1 text-[11px] font-semibold ${row.regionLabel ? "text-[#084734]" : "text-[#1a1a1a]/30"}`}>
                    <MapPin className="h-3 w-3" />
                    {row.regionLabel ?? "지역 미지정"}
                  </p>
                  <div className="mt-1.5 flex flex-wrap items-center gap-1 empty:hidden">
                    <CrmCustomerFlags flags={rowToFlags(row)} max={4} />
                    <LeadRowBadges row={row} />
                  </div>
                  <TagChips tags={row.tags} />
                </div>
                {/* 점수 숫자 숨김(탐색 전용) — 카드 우측 상단은 최근 업데이트 날짜로 대체(선택 체크박스 자리만큼 비킨다). */}
                <span className={`shrink-0 text-[11px] font-medium tabular-nums text-[#1a1a1a]/35 ${selectable ? "mr-10" : ""}`}>
                  {formatDate(row.updatedAt)}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2 text-[12px]">
                <div>
                  <p className="text-[11px] font-semibold text-[#1a1a1a]/35">다음 액션</p>
                  <p className="mt-0.5 font-semibold text-[#111110]">{row.nextActionLabel}</p>
                  {/* 카드 상세 버튼은 형제(absolute z-0)라 조상이 button 이 아니다 — 실제 링크를 두고
                      pointer-events-none 본문 위로만 클릭을 되살린다(z-20). */}
                  <UnifiedCompassLink
                    row={row}
                    neoRegisteredLeadIds={neoRegisteredLeadIds}
                    className="mt-0.5"
                    linkClassName="pointer-events-auto relative z-20"
                  />
                </div>
                <div>
                  <p className="text-[11px] font-semibold text-[#1a1a1a]/35">담당</p>
                  <p className="mt-0.5 font-semibold text-[#111110]">{row.ownerName ?? "미배정"}</p>
                </div>
                <div className="col-span-2">
                  <p className="text-[11px] font-semibold text-[#1a1a1a]/35">마지막 연락</p>
                  <div className="mt-0.5">
                    <LastContactCell row={row} nowMs={baseNowMs} />
                  </div>
                </div>
              </div>
              <NeoSignalLine row={row} />
              <p className="mt-2 text-[12px] text-[#1a1a1a]/45">{row.priorityReason}</p>
            </div>
          </div>
        ))}
      </div>

      {data && data.pagination.total > 0 ? (
        <div className="flex flex-col gap-3 border-t border-[#f0f0ec] px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <p className={`text-[12px] font-medium tabular-nums ${SECONDARY_TEXT_CLASS}`}>
            {(data.pagination.offset + 1).toLocaleString("ko-KR")}–
            {(data.pagination.offset + data.rows.length).toLocaleString("ko-KR")} / {data.pagination.total.toLocaleString("ko-KR")}명
            {sort ? (
              // 정렬은 서버가 현재 조건 전체 기준으로 한다(C1) — 페이지를 넘겨도 순서가 이어진다는 범위를 명시.
              <span className="ml-2 font-normal">· 정렬은 {scopeCaption}</span>
            ) : null}
          </p>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => onLoadPage(Math.max(0, data.pagination.offset - PAGE_LIMIT))}
              disabled={data.pagination.offset === 0 || loading || loadingMore || refreshing}
              className="inline-flex h-9 items-center gap-1 rounded-lg border border-[#e8e8e4] bg-white px-2.5 text-[12px] font-semibold text-[#111110] transition-colors hover:bg-[#f5f5f2] disabled:opacity-40"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
              이전
            </button>
            <span
              className="px-1.5 text-[12px] font-semibold tabular-nums text-[#1a1a1a]/55"
              aria-live="polite"
              aria-atomic="true"
            >
              {Math.floor(data.pagination.offset / PAGE_LIMIT) + 1} /{" "}
              {Math.max(1, Math.ceil(data.pagination.total / PAGE_LIMIT))}
            </span>
            <button
              type="button"
              onClick={() => onLoadPage(data.pagination.nextOffset ?? data.pagination.offset + PAGE_LIMIT)}
              disabled={!data.pagination.hasMore || loading || loadingMore || refreshing}
              className="inline-flex h-9 items-center gap-1 rounded-lg border border-[#e8e8e4] bg-white px-2.5 text-[12px] font-semibold text-[#111110] transition-colors hover:bg-[#f5f5f2] disabled:opacity-40"
            >
              다음
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      ) : null}

      {!loading && data && data.rows.length === 0 ? (
        <div className="px-6 py-12 text-center">
          <p className="text-[13px] font-semibold text-[#111110]">
            {savedView === "recent_contact"
              ? "최근 30일 내 컨택 기록이 없습니다."
              : savedView === "active_deal"
                ? "현재 진행 중인 딜이 없습니다."
                : "조건에 맞는 고객이 없습니다."}
          </p>
          <p className="mt-1 text-[12px] text-[#1a1a1a]/45">
            {savedView === "recent_contact"
              ? "Home에 콜·문자·미팅을 기록하거나 Compass에서 연락하면 최근 컨택에 표시됩니다."
              : savedView === "active_deal"
                ? "Portal V2에서 진행 상태인 딜이 연결되면 여기에 표시됩니다."
                : hasActiveFilters
                  ? "필터를 초기화하거나 새 리드를 등록해 시작하세요."
                  : "새 리드를 등록하거나 REV/HW 원본 매칭을 연결해 시작하세요."}
          </p>
          <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
            {hasActiveFilters ? (
              <button
                type="button"
                onClick={onResetFilters}
                className="inline-flex h-8 items-center rounded-lg border border-[#e8e8e4] bg-white px-3 text-[12px] font-semibold text-[#111110] transition-colors hover:bg-[#f5f5f2]"
              >
                필터 초기화
              </button>
            ) : null}
            {savedView === "recent_contact" ? (
              <Link
                href="/admin/crm/activity"
                className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-[#084734] px-3 text-[12px] font-semibold text-white transition-opacity hover:opacity-90"
              >
                <PhoneCall className="h-3.5 w-3.5" />
                기록 남기기
              </Link>
            ) : savedView === "active_deal" ? (
              <Link
                href="/admin/crm/deals"
                className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-[#084734] px-3 text-[12px] font-semibold text-white transition-opacity hover:opacity-90"
              >
                진행 딜 확인
                <ExternalLink className="h-3 w-3" />
              </Link>
            ) : (
              <>
                <button
                  type="button"
                  onClick={onOpenLeadModal}
                  className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-[#084734] px-3 text-[12px] font-semibold text-white transition-opacity hover:opacity-90"
                >
                  <UserPlus className="h-3.5 w-3.5" />
                  리드 등록
                </button>
                <Link
                  href="/admin/crm/matching"
                  className="inline-flex h-8 items-center gap-1 rounded-lg border border-[#e8e8e4] bg-white px-3 text-[12px] font-semibold text-[#111110] transition-colors hover:bg-[#f5f5f2]"
                >
                  매칭 연결
                  <ExternalLink className="h-3 w-3" />
                </Link>
              </>
            )}
          </div>
        </div>
      ) : null}
    </section>
  )
}
