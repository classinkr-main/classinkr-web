"use client"

// 결과 섹션 — 정렬 툴바 · 데스크톱 테이블 · 모바일 카드 · 페이지네이션 · 빈 상태.
// 상태는 전부 부모(CrmUnifiedCustomersClient)가 소유하고 여기는 표시·콜백만 담당한다.
// CrmUnifiedCustomersClient.tsx 분해(2026-08-28)로 이동 — 로직 무변경.

import Link from "next/link"
import { type MouseEvent } from "react"
import { ChevronLeft, ChevronRight, ExternalLink, MapPin, PhoneCall, UserPlus } from "lucide-react"
import type { CrmUnifiedCustomerRow } from "@/lib/repositories/crm-unified-customers"
import CrmContactValue from "../CrmContactValue"
import CrmCustomerFlags from "../CrmCustomerFlags"
import { SORT_LABELS, SortableHeaderCell, type SortKey, type SortState } from "./sort"
import { LeadRowBadges, moneyCell, sourceBadge, TagChips } from "./row-visuals"
import { PAGE_LIMIT, formatDate, rowToFlags, type CrmUnifiedCustomers, type SavedViewFilter } from "./shared"

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
}) {
  return (
    <section
      className="rounded-2xl border border-[#e8e8e4] bg-white"
      aria-label="통합 고객 검색 결과"
      aria-busy={loading || loadingMore || refreshing}
    >
      {/* 정렬 툴바 — 현재 정렬 상태 표시 + 점수 정렬 진입점. 점수 컬럼은 화면에서 제거됐지만
          정렬 옵션으로는 유지한다(이 버튼이 유일한 진입점). 추천순 복귀 버튼은 정렬 활성 시에만 노출. */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#f0f0ec] px-4 py-2">
        <p className="text-[11px] font-semibold text-[#1a1a1a]/40">
          정렬 ·{" "}
          {sort
            ? `${SORT_LABELS[sort.key]} ${sort.direction === "asc" ? "오름차순" : "내림차순"}`
            : "추천순 (기본)"}
        </p>
        <div className="flex items-center gap-1.5">
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
        </div>
      </div>
      <div className="hidden overflow-hidden lg:block">
        <table className="w-full border-collapse text-left">
          <caption className="sr-only">통합 고객 검색 결과 목록</caption>
          <thead className="bg-[#fafaf8] text-[11px] font-semibold uppercase tracking-[0.12em] text-[#1a1a1a]/35">
            <tr>
              <SortableHeaderCell label="고객" sortKey="name" sort={sort} onToggle={onToggleSort} />
              <SortableHeaderCell label="상태" sortKey="status" sort={sort} onToggle={onToggleSort} />
              <th className="px-4 py-3">다음 액션</th>
              <th className="px-4 py-3">돈흐름</th>
              <SortableHeaderCell label="담당" sortKey="owner" sort={sort} onToggle={onToggleSort} />
              <SortableHeaderCell label="최근 업데이트" sortKey="updated" sort={sort} onToggle={onToggleSort} align="right" />
            </tr>
          </thead>
          <tbody className="divide-y divide-[#f0f0ec]">
            {loading && !data
              ? // 콜드로드 스켈레톤 — 컬럼(고객/상태/다음 액션/돈흐름/담당/최근 업데이트) 골격 일치.
                Array.from({ length: 8 }).map((_, index) => (
                  <tr key={`sk-${index}`}>
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
                      <div className="ml-auto h-4 w-14 animate-pulse rounded bg-[#f0f0ec]" />
                    </td>
                  </tr>
                ))
              : null}
            {rows.map((row) => (
              <tr
                key={row.key}
                onDoubleClick={(event) => onRowDoubleClick(event, row)}
                title={row.source === "customer" ? undefined : "더블클릭 — 고객 카드 열기"}
                className="transition-colors hover:bg-[#fafaf8]"
              >
                <td className="px-4 py-3">
                  <div className="flex min-w-0 items-center gap-2">
                    <div className="min-w-0 flex-1">
                      {row.source === "customer" ? (
                        // 전환 고객은 360 드로어 미지원 — 파트너 워크스페이스(딜)로 이동.
                        <Link href={row.href} className="group block max-w-full text-left">
                          <p className="truncate text-[13px] font-bold text-[#111110] group-hover:underline">{row.name}</p>
                        </Link>
                      ) : (
                        <button
                          type="button"
                          onClick={() => onOpenDrawer(row.key, row.name)}
                          className="group block max-w-full text-left"
                        >
                          <p className="truncate text-[13px] font-bold text-[#111110] group-hover:underline">{row.name}</p>
                        </button>
                      )}
                      <CrmContactValue value={row.contact} className="mt-0.5" />
                      <p className={`mt-1 inline-flex items-center gap-1 text-[11px] font-semibold ${row.regionLabel ? "text-[#084734]" : "text-[#1a1a1a]/30"}`}>
                        <MapPin className="h-3 w-3" />
                        {row.regionLabel ?? "지역 미지정"}
                      </p>
                      <div className="mt-1 flex flex-wrap items-center gap-1 empty:hidden">
                        <CrmCustomerFlags flags={rowToFlags(row)} max={4} />
                        <LeadRowBadges row={row} />
                      </div>
                      <TagChips tags={row.tags} />
                    </div>
                    <Link
                      href={row.source === "customer" ? row.href : `/admin/crm/customers/${encodeURIComponent(row.key)}`}
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
                  </div>
                </td>
                <td className="px-4 py-3">
                  <p className="text-[12px] font-semibold text-[#111110]">{row.nextActionLabel}</p>
                  <p className="mt-0.5 max-w-[220px] truncate text-[11px] text-[#1a1a1a]/40">{row.priorityReason}</p>
                </td>
                <td className="px-4 py-3">{moneyCell(row)}</td>
                <td className="px-4 py-3">
                  <p className="text-[12px] font-semibold text-[#111110]">{row.ownerName ?? "미배정"}</p>
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
          <div key={row.key} className="relative transition-colors hover:bg-[#fafaf8]">
            {row.source === "customer" ? (
              <Link href={row.href} aria-label={`${row.name} 상세 보기`} className="absolute inset-0 z-0" />
            ) : (
              <button
                type="button"
                onClick={() => onOpenDrawer(row.key, row.name)}
                aria-label={`${row.name} 상세 보기`}
                className="absolute inset-1 z-0 rounded-xl focus-visible:ring-inset"
              />
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
                {/* 점수 숫자 숨김(탐색 전용) — 카드 우측 상단은 최근 업데이트 날짜로 대체. */}
                <span className="shrink-0 text-[11px] font-medium tabular-nums text-[#1a1a1a]/35">
                  {formatDate(row.updatedAt)}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2 text-[12px]">
                <div>
                  <p className="text-[11px] font-semibold text-[#1a1a1a]/35">다음 액션</p>
                  <p className="mt-0.5 font-semibold text-[#111110]">{row.nextActionLabel}</p>
                </div>
                <div>
                  <p className="text-[11px] font-semibold text-[#1a1a1a]/35">담당</p>
                  <p className="mt-0.5 font-semibold text-[#111110]">{row.ownerName ?? "미배정"}</p>
                </div>
              </div>
              <p className="mt-2 text-[12px] text-[#1a1a1a]/45">{row.priorityReason}</p>
            </div>
          </div>
        ))}
      </div>

      {data && data.pagination.total > 0 ? (
        <div className="flex flex-col gap-3 border-t border-[#f0f0ec] px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-[12px] font-medium text-[#1a1a1a]/45 tabular-nums">
            {(data.pagination.offset + 1).toLocaleString("ko-KR")}–
            {(data.pagination.offset + data.rows.length).toLocaleString("ko-KR")} / {data.pagination.total.toLocaleString("ko-KR")}명
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
              ? "고객이나 리드에 메모·콜·문자를 남기면 최근 컨택에 표시됩니다."
              : savedView === "active_deal"
                ? "Portal V2에서 진행 상태인 딜이 연결되면 여기에 표시됩니다."
                : hasActiveFilters
                  ? "필터를 초기화하거나 새 리드를 등록해 시작하세요."
                  : "새 리드를 등록하거나 REV/HW 원장 매칭을 연결해 시작하세요."}
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
