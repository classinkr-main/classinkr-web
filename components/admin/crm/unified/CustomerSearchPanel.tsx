"use client"

// 검색 패널 — 검색·소스 토글·상태/담당 셀렉트·라벨·요약 타일·소스 상태 타일.
// quickMode(칩 진입)일 때는 렌더되지 않는다. 본체에서 기계적 추출 — 동작 동일.
// CrmUnifiedCustomersClient.tsx 분해(2026-08-28)로 이동 — 로직 무변경.

import { Filter, Search, Tag } from "lucide-react"
import { buildOwnerSelectOptions, useCrmOwners } from "../useCrmOwners"
import {
  CURRENT_OWNER_VALUE,
  LIFECYCLE_FILTERS,
  SOURCE_FILTERS,
  customerSourceTone,
  formatDate,
  summarizeCustomerSources,
  type CrmUnifiedCustomers,
  type CustomerSourceStatus,
  type LifecycleFilter,
  type SourceFilter,
} from "./shared"

function CustomerSourceStatusGrid({
  statuses,
  className = "",
}: {
  statuses: CustomerSourceStatus[]
  className?: string
}) {
  return (
    <div className={`grid gap-2 sm:grid-cols-2 lg:grid-cols-4 ${className}`}>
      {statuses.map((status) => {
        const tone = customerSourceTone(status)
        return (
          <div key={status.key} className={`rounded-xl border px-3 py-2 ${tone.surface}`}>
            <div className="flex items-center justify-between gap-2">
              <p className={`text-[12px] font-bold ${tone.text}`}>{status.label}</p>
              <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[#1a1a1a]/35">
                {status.role === "primary" ? "DB" : "SYNC"}
              </span>
            </div>
            <p className="mt-1 text-[11px] leading-4 text-[#1a1a1a]/52">{status.message}</p>
            {status.latestSyncedAt ? (
              <p className="mt-1 text-[11px] font-medium text-[#1a1a1a]/35">
                마지막 동기화 {formatDate(status.latestSyncedAt)}
              </p>
            ) : null}
          </div>
        )
      })}
    </div>
  )
}

export default function CustomerSearchPanel({
  query,
  onQueryChange,
  source,
  onSourceChange,
  lifecycle,
  onLifecycleChange,
  owner,
  onOwnerChange,
  currentOwner,
  currentOwnerCount,
  ownerOptions,
  tagFilter,
  onTagFilterChange,
  data,
  loading,
}: {
  query: string
  onQueryChange: (value: string) => void
  source: SourceFilter
  onSourceChange: (value: SourceFilter) => void
  lifecycle: LifecycleFilter
  onLifecycleChange: (value: LifecycleFilter) => void
  owner: string
  onOwnerChange: (value: string) => void
  currentOwner: ReturnType<typeof useCrmOwners>["currentOwner"]
  currentOwnerCount: number
  ownerOptions: ReturnType<typeof buildOwnerSelectOptions>
  tagFilter: string
  onTagFilterChange: (value: string) => void
  data: CrmUnifiedCustomers | null
  loading: boolean
}) {
  const sourceSummary = summarizeCustomerSources(data?.sources.statuses ?? [])

  return (
    <section className="mb-4 rounded-2xl border border-[#e8e8e4] bg-white p-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-[minmax(220px,1fr)_auto_auto_auto] lg:items-center">
        <label className="col-span-2 flex h-11 items-center gap-2 rounded-lg border border-[#e8e8e4] bg-[#fafaf8] px-3 lg:col-span-1 lg:h-10">
          <Search className="h-4 w-4 text-[#1a1a1a]/35" />
          <input
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
            className="h-full min-w-0 flex-1 bg-transparent text-[13px] font-medium text-[#111110] outline-none placeholder:text-[#1a1a1a]/30"
            placeholder="이름, 연락처, 지역, 담당자 검색"
            aria-label="통합 고객 검색"
          />
        </label>
        <div
          className="col-span-2 inline-flex rounded-lg border border-[#e8e8e4] bg-[#fafaf8] p-1 lg:col-span-1"
          role="group"
          aria-label="고객 원천 필터"
        >
          {SOURCE_FILTERS.map((filter) => (
            <button
              key={filter.key}
              type="button"
              onClick={() => onSourceChange(filter.key)}
              aria-pressed={source === filter.key}
              className={`h-7 rounded-md px-3 text-[12px] font-semibold transition-colors ${
                source === filter.key
                  ? "bg-[#111110] text-white"
                  : "text-[#1a1a1a]/55 hover:bg-white hover:text-[#111110]"
              }`}
            >
              {filter.label}
            </button>
          ))}
        </div>
        <label className="flex h-11 min-w-0 items-center gap-1.5 rounded-lg border border-[#e8e8e4] bg-white px-2 text-[12px] text-[#1a1a1a]/50 lg:h-10">
          <Filter className="h-3.5 w-3.5" />
          <select
            value={lifecycle}
            onChange={(event) => onLifecycleChange(event.target.value as LifecycleFilter)}
            className="h-full min-w-0 flex-1 bg-transparent text-[12px] font-semibold text-[#111110] outline-none"
            aria-label="상태 필터"
          >
            {LIFECYCLE_FILTERS.map((filter) => (
              <option key={filter.key} value={filter.key}>
                {filter.label}
              </option>
            ))}
          </select>
        </label>
        <label className="flex h-11 min-w-0 items-center gap-1.5 rounded-lg border border-[#e8e8e4] bg-white px-2 text-[12px] text-[#1a1a1a]/50 lg:h-10">
          <Filter className="h-3.5 w-3.5" />
          <select
            value={owner}
            onChange={(event) => onOwnerChange(event.target.value)}
            className="h-full min-w-0 flex-1 bg-transparent text-[12px] font-semibold text-[#111110] outline-none lg:min-w-[128px]"
            aria-label="담당자 필터"
          >
            <option value="">담당 전체</option>
            {currentOwner ? (
              <option value={CURRENT_OWNER_VALUE}>
                내 담당 · {currentOwner.displayName}
                {currentOwnerCount > 0 ? ` (${currentOwnerCount})` : ""}
              </option>
            ) : null}
            {ownerOptions.map((option) => (
              <option key={option.ownerName} value={option.ownerName}>
                {option.label}
                {option.teamRoleLabel ? ` · ${option.teamRoleLabel}` : ""}
                {option.count > 0 ? ` (${option.count})` : ""}
              </option>
            ))}
          </select>
        </label>
      </div>

      {data?.summary.availableTags?.length ? (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <span className="inline-flex h-8 items-center gap-1.5 text-[12px] font-semibold text-[#1a1a1a]/45">
            <Tag className="h-3.5 w-3.5" />
            라벨
          </span>
          {data.summary.availableTags.map((tag) => {
            const isActive = tagFilter === tag
            return (
              <button
                key={tag}
                type="button"
                onClick={() => onTagFilterChange(tagFilter === tag ? "" : tag)}
                aria-pressed={isActive}
                className={`h-8 rounded-full border px-3 text-[12px] font-semibold transition-colors ${
                  isActive
                    ? "border-[#111110] bg-[#111110] text-white"
                    : "border-[#e8e8e4] bg-white text-[#1a1a1a]/58 hover:border-[#c8c8c4] hover:text-[#111110]"
                }`}
              >
                {tag}
              </button>
            )
          })}
          {tagFilter ? (
            <button
              type="button"
              onClick={() => onTagFilterChange("")}
              className="h-8 px-2 text-[12px] font-medium text-[#1a1a1a]/45 transition-colors hover:text-[#111110]"
            >
              초기화
            </button>
          ) : null}
        </div>
      ) : null}

      {data ? (
        // 탐색 전용 화면 — "우선 처리" 타일은 실행 지표라 CRM 홈으로 이관, 여기는 규모 파악 4칸만 남긴다.
        <div className="no-scrollbar mt-4 flex gap-2 overflow-x-auto pb-1 sm:grid sm:grid-cols-4 sm:overflow-visible sm:pb-0">
          <div className="min-w-[116px] shrink-0 rounded-xl bg-[#fafaf8] p-3 sm:min-w-0">
            <p className="text-[11px] font-semibold text-[#1a1a1a]/35">검색 결과</p>
            <p className="mt-1 text-xl font-bold text-[#111110]">{data.summary.total.toLocaleString("ko-KR")}</p>
          </div>
          <div className="min-w-[116px] shrink-0 rounded-xl bg-[#fafaf8] p-3 sm:min-w-0">
            <p className="text-[11px] font-semibold text-[#1a1a1a]/35">리드</p>
            <p className="mt-1 text-xl font-bold text-[#111110]">{data.summary.leadCount.toLocaleString("ko-KR")}</p>
          </div>
          <div className="min-w-[116px] shrink-0 rounded-xl bg-[#fafaf8] p-3 sm:min-w-0">
            <p className="text-[11px] font-semibold text-[#1a1a1a]/35">고객</p>
            <p className="mt-1 text-xl font-bold text-[#111110]">
              {data.summary.accountCount.toLocaleString("ko-KR")}
            </p>
          </div>
          <div className="min-w-[116px] shrink-0 rounded-xl bg-[#fafaf8] p-3 sm:min-w-0">
            <p className="text-[11px] font-semibold text-[#1a1a1a]/35">전환 고객</p>
            <p className="mt-1 text-xl font-bold text-[#111110]">
              {(data.summary.customerCount ?? 0).toLocaleString("ko-KR")}
            </p>
          </div>
        </div>
      ) : loading ? (
        // 콜드로드 스켈레톤 — 실제 요약 타일 4칸 그리드와 동일 골격(0 플래시·점프 방지).
        <div className="no-scrollbar mt-4 flex gap-2 overflow-x-auto pb-1 sm:grid sm:grid-cols-4 sm:overflow-visible sm:pb-0">
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className="min-w-[116px] shrink-0 rounded-xl bg-[#fafaf8] p-3 sm:min-w-0">
              <div className="h-3 w-14 animate-pulse rounded bg-[#f0f0ec]" />
              <div className="mt-2 h-6 w-16 animate-pulse rounded bg-[#f0f0ec]" />
            </div>
          ))}
        </div>
      ) : null}

      {data?.sources.statuses.length ? (
        <details className="group mt-3 rounded-xl border border-[#e8e8e4] bg-[#fafaf8]">
          <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 px-3 py-2.5 text-[12px] font-semibold text-[#111110] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#084734] lg:min-h-0">
            <span>
              데이터 원천 · 기준 DB {sourceSummary.primaryReady}/{sourceSummary.primaryTotal} 정상
              <span className="ml-2 font-medium text-[#1a1a1a]/40">
                참고 원천 {sourceSummary.referenceTotal}개 · 상태는 상세에서 확인
              </span>
            </span>
            <span className="text-[11px] font-medium text-[#1a1a1a]/40 group-open:hidden">상세 보기</span>
            <span className="hidden text-[11px] font-medium text-[#1a1a1a]/40 group-open:inline">접기</span>
          </summary>
          <CustomerSourceStatusGrid statuses={data.sources.statuses} className="border-t border-[#e8e8e4] p-2" />
        </details>
      ) : null}
    </section>
  )
}
