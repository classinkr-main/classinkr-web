"use client"

import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react"
import Link from "next/link"
import { AlertTriangle, Building2, ExternalLink, Filter, PhoneCall, RefreshCw, Search, UserRound } from "lucide-react"

import { adminFetchJsonCached, getCachedAdminJson } from "@/lib/admin-client"
import type {
  CrmUnifiedCustomerRow,
  CrmUnifiedCustomerSource,
  CrmUnifiedLifecycle,
  CrmUnifiedSavedView,
} from "@/lib/repositories/crm-unified-customers"
import { buildOwnerSelectOptions, useCrmOwners } from "./useCrmOwners"

type SourceFilter = "all" | CrmUnifiedCustomerSource
type LifecycleFilter = "all" | CrmUnifiedLifecycle
type SavedViewFilter = CrmUnifiedSavedView

interface CrmUnifiedCustomers {
  generatedAt: string
  sources: {
    leadsOk: boolean
    neoAccountsOk: boolean
    warnings: string[]
    statuses: Array<{
      key: "classin_leads" | "external_crm" | "sheets"
      label: string
      role: "primary" | "reference"
      ok: boolean
      partial: boolean
      latestSyncedAt: string | null
      message: string
    }>
  }
  summary: {
    total: number
    leadCount: number
    accountCount: number
    highPriorityCount: number
    ownerCount: number
  }
  pagination: {
    limit: number
    offset: number
    returned: number
    total: number
    hasMore: boolean
    nextOffset: number | null
  }
  owners: Array<{ ownerName: string; count: number }>
  rows: CrmUnifiedCustomerRow[]
}

const SOURCE_FILTERS: Array<{ key: SourceFilter; label: string }> = [
  { key: "all", label: "전체" },
  { key: "lead", label: "리드" },
  { key: "neo_account", label: "고객" },
]

const LIFECYCLE_FILTERS: Array<{ key: LifecycleFilter; label: string }> = [
  { key: "all", label: "상태 전체" },
  { key: "new_lead", label: "신규 리드" },
  { key: "active_lead", label: "접촉 중" },
  { key: "account_risk", label: "관리 필요" },
  { key: "active_account", label: "활성 고객" },
  { key: "closed", label: "종료" },
]

const SAVED_VIEW_FILTERS: Array<{
  key: SavedViewFilter
  label: string
  description: string
}> = [
  { key: "priority", label: "우선 처리", description: "점수 68점 이상" },
  { key: "new_leads", label: "신규 리드", description: "첫 응답 대상" },
  { key: "needs_care", label: "관리 필요 고객", description: "만료·휴면 위험" },
  { key: "my_owner", label: "내 담당", description: "담당자 선택값" },
]

const CACHE_TTL_MS = 90_000
const PAGE_LIMIT = 100
const OWNER_STORAGE_KEY = "classin_crm_unified_owner"

function listUrl(input: {
  query: string
  source: SourceFilter
  lifecycle: LifecycleFilter
  owner: string
  view: SavedViewFilter
  offset: number
}) {
  const params = new URLSearchParams({ limit: String(PAGE_LIMIT), offset: String(input.offset) })
  if (input.query.trim()) params.set("q", input.query.trim())
  if (input.source !== "all") params.set("source", input.source)
  if (input.lifecycle !== "all") params.set("lifecycle", input.lifecycle)
  if (input.view !== "all") params.set("view", input.view)
  if (input.owner) params.set("owner", input.owner)
  return `/api/admin/crm/customers/unified?${params.toString()}`
}

function formatDate(value: string | null | undefined) {
  if (!value) return "-"
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return "-"
  return new Intl.DateTimeFormat("ko-KR", {
    year: "2-digit",
    month: "2-digit",
    day: "2-digit",
  }).format(date)
}

function scoreTone(score: number) {
  if (score >= 85) return "text-[#B85C33]"
  if (score >= 68) return "text-[#084734]"
  return "text-[#1a1a1a]/50"
}

function normalizeText(value: string | null | undefined) {
  return value?.trim().toLowerCase() ?? ""
}

function sourceBadge(row: CrmUnifiedCustomerRow) {
  if (row.source === "lead") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-[#e8e8e4] bg-white px-2 py-0.5 text-[11px] font-semibold text-[#1a1a1a]/60">
        <PhoneCall className="h-3 w-3" />
        리드
      </span>
    )
  }
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full border border-[#D7EBDD] bg-[#ECFDF5] px-2 py-0.5 text-[11px] font-semibold text-[#084734]"
      title="본사 CRM 동기화 원천"
    >
      <Building2 className="h-3 w-3" />
      고객
    </span>
  )
}

function mergePage(
  current: CrmUnifiedCustomers | null,
  next: CrmUnifiedCustomers,
  append: boolean
): CrmUnifiedCustomers {
  if (!append || !current) return next
  const seen = new Set(current.rows.map((row) => row.key))
  const rows = [...current.rows, ...next.rows.filter((row) => !seen.has(row.key))]
  return {
    ...next,
    rows,
    pagination: {
      ...next.pagination,
      offset: 0,
      returned: rows.length,
    },
  }
}

export default function CrmUnifiedCustomersClient() {
  const [query, setQuery] = useState("")
  const deferredQuery = useDeferredValue(query)
  const [source, setSource] = useState<SourceFilter>("all")
  const [lifecycle, setLifecycle] = useState<LifecycleFilter>("all")
  const [owner, setOwner] = useState("")
  const [savedView, setSavedView] = useState<SavedViewFilter>("all")
  const [data, setData] = useState<CrmUnifiedCustomers | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const requestSeq = useRef(0)
  const { owners: crmOwners, health: ownerHealth } = useCrmOwners()
  const ownerOptions = useMemo(() => buildOwnerSelectOptions(data?.owners, crmOwners), [crmOwners, data?.owners])

  const currentOwnerCount = useMemo(() => {
    const selected = normalizeText(owner)
    if (!selected) return 0
    return ownerOptions.find((option) => normalizeText(option.ownerName) === selected)?.count ?? 0
  }, [owner, ownerOptions])

  const loadPage = useCallback(
    async (offset: number, options?: { force?: boolean; append?: boolean }) => {
      const append = Boolean(options?.append)
      const url = listUrl({ query: deferredQuery, source, lifecycle, owner, view: savedView, offset })
      const cached = !append && !options?.force ? getCachedAdminJson<CrmUnifiedCustomers>(url, { cacheKey: url }) : null
      const requestId = ++requestSeq.current

      if (cached) setData(cached)

      setLoading(!append && !cached)
      setLoadingMore(append)
      setRefreshing(Boolean(options?.force))
      setError(null)
      try {
        const next = await adminFetchJsonCached<CrmUnifiedCustomers>(
          options?.force ? `${url}&force=1` : url,
          undefined,
          {
            cacheKey: url,
            ttlMs: CACHE_TTL_MS,
            staleWhileRevalidateMs: 5 * 60_000,
            force: options?.force,
          }
        )
        if (requestId !== requestSeq.current) return
        setData((current) => mergePage(current, next, append))
      } catch (err) {
        if (requestId !== requestSeq.current) return
        setError(err instanceof Error ? err.message : "통합 고객 목록을 불러오지 못했습니다.")
      } finally {
        if (requestId === requestSeq.current) {
          setLoading(false)
          setLoadingMore(false)
          setRefreshing(false)
        }
      }
    },
    [deferredQuery, source, lifecycle, owner, savedView]
  )

  useEffect(() => {
    void loadPage(0)
  }, [loadPage])

  useEffect(() => {
    if (typeof window === "undefined") return
    const storedOwner = window.localStorage.getItem(OWNER_STORAGE_KEY)
    if (storedOwner) setOwner(storedOwner)
  }, [])

  useEffect(() => {
    if (typeof window === "undefined") return
    if (owner) {
      window.localStorage.setItem(OWNER_STORAGE_KEY, owner)
    } else {
      window.localStorage.removeItem(OWNER_STORAGE_KEY)
    }
  }, [owner])

  const selectSavedView = (view: SavedViewFilter) => {
    setSavedView((current) => (current === view ? "all" : view))
    if (view === "new_leads") {
      setSource("lead")
      setLifecycle("all")
    }
    if (view === "needs_care") {
      setSource("neo_account")
      setLifecycle("all")
    }
    if (view === "priority" || view === "my_owner") {
      setSource("all")
      setLifecycle("all")
    }
  }

  return (
    <div className="min-h-screen bg-[#F6F5F4] px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl">
        <div className="mb-5 flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="mb-1 text-[11px] font-medium uppercase tracking-widest text-[#1a1a1a]/30">
              Admin · CRM · Customers
            </p>
            <h1 className="text-2xl font-bold tracking-[-0.02em] text-[#111110]">ClassIn 고객 DB</h1>
            <p className="mt-1 text-[13px] text-[#1a1a1a]/42">
              ClassIn 고객을 기준으로 운영하고, 리드·외부 CRM 데이터는 동기화 참고자료로 표시합니다.
            </p>
          </div>
          <button
            type="button"
            onClick={() => void loadPage(0, { force: true })}
            className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg border border-[#e8e8e4] bg-white px-3 text-[12px] font-semibold text-[#111110] transition-colors hover:bg-[#f5f5f2] lg:w-auto"
            disabled={refreshing}
          >
            <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} />
            새로고침
          </button>
        </div>

        <section className="mb-4 rounded-2xl border border-[#e8e8e4] bg-white p-4">
          <div className="grid gap-3 lg:grid-cols-[minmax(220px,1fr)_auto_auto_auto] lg:items-center">
            <label className="flex h-10 items-center gap-2 rounded-lg border border-[#e8e8e4] bg-[#fafaf8] px-3">
              <Search className="h-4 w-4 text-[#1a1a1a]/35" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                className="h-full min-w-0 flex-1 bg-transparent text-[13px] font-medium text-[#111110] outline-none placeholder:text-[#1a1a1a]/30"
                placeholder="이름, 연락처, 담당자 검색"
              />
            </label>
            <div className="inline-flex rounded-lg border border-[#e8e8e4] bg-[#fafaf8] p-1">
              {SOURCE_FILTERS.map((filter) => (
                <button
                  key={filter.key}
                  type="button"
                  onClick={() => setSource(filter.key)}
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
            <label className="flex h-10 items-center gap-1.5 rounded-lg border border-[#e8e8e4] bg-white px-2 text-[12px] text-[#1a1a1a]/50">
              <Filter className="h-3.5 w-3.5" />
              <select
                value={lifecycle}
                onChange={(event) => setLifecycle(event.target.value as LifecycleFilter)}
                className="h-full bg-transparent text-[12px] font-semibold text-[#111110] outline-none"
                aria-label="상태 필터"
              >
                {LIFECYCLE_FILTERS.map((filter) => (
                  <option key={filter.key} value={filter.key}>
                    {filter.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex h-10 items-center gap-1.5 rounded-lg border border-[#e8e8e4] bg-white px-2 text-[12px] text-[#1a1a1a]/50">
              <Filter className="h-3.5 w-3.5" />
              <select
                value={owner}
                onChange={(event) => {
                  const nextOwner = event.target.value
                  setOwner(nextOwner)
                  if (!nextOwner && savedView === "my_owner") setSavedView("all")
                }}
                className="h-full min-w-[128px] bg-transparent text-[12px] font-semibold text-[#111110] outline-none"
                aria-label="담당자 필터"
              >
                <option value="">담당 전체</option>
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

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <span className="inline-flex h-8 items-center gap-1.5 text-[12px] font-semibold text-[#1a1a1a]/45">
              <UserRound className="h-3.5 w-3.5" />
              저장 뷰
            </span>
            {SAVED_VIEW_FILTERS.map((filter) => {
              const isActive = savedView === filter.key
              const disabled = filter.key === "my_owner" && !owner
              const label =
                filter.key === "my_owner" && owner
                  ? `${filter.label} · ${owner}${currentOwnerCount ? ` ${currentOwnerCount}` : ""}`
                  : filter.label
              return (
                <button
                  key={filter.key}
                  type="button"
                  onClick={() => selectSavedView(filter.key)}
                  disabled={disabled}
                  title={disabled ? "담당자를 먼저 선택하세요." : filter.description}
                  className={`h-8 rounded-full border px-3 text-[12px] font-semibold transition-colors ${
                    isActive
                      ? "border-[#084734] bg-[#084734] text-white"
                      : disabled
                        ? "border-[#e8e8e4] bg-[#fafaf8] text-[#1a1a1a]/28"
                        : "border-[#e8e8e4] bg-white text-[#1a1a1a]/58 hover:border-[#D1FAE5] hover:bg-[#ECFDF5] hover:text-[#084734]"
                  }`}
                >
                  {label}
                </button>
              )
            })}
          </div>

          {data ? (
            <div className="mt-4 grid gap-2 sm:grid-cols-4">
              <div className="rounded-xl bg-[#fafaf8] p-3">
                <p className="text-[11px] font-semibold text-[#1a1a1a]/35">검색 결과</p>
                <p className="mt-1 text-xl font-bold text-[#111110]">{data.summary.total.toLocaleString("ko-KR")}</p>
              </div>
              <div className="rounded-xl bg-[#fafaf8] p-3">
                <p className="text-[11px] font-semibold text-[#1a1a1a]/35">리드</p>
                <p className="mt-1 text-xl font-bold text-[#111110]">{data.summary.leadCount.toLocaleString("ko-KR")}</p>
              </div>
              <div className="rounded-xl bg-[#fafaf8] p-3">
                <p className="text-[11px] font-semibold text-[#1a1a1a]/35">고객</p>
                <p className="mt-1 text-xl font-bold text-[#111110]">
                  {data.summary.accountCount.toLocaleString("ko-KR")}
                </p>
              </div>
              <div className="rounded-xl bg-[#fafaf8] p-3">
                <p className="text-[11px] font-semibold text-[#1a1a1a]/35">우선 처리</p>
                <p className="mt-1 text-xl font-bold text-[#B85C33]">
                  {data.summary.highPriorityCount.toLocaleString("ko-KR")}
                </p>
              </div>
            </div>
          ) : null}

          {data?.sources.statuses.length ? (
            <div className="mt-3 grid gap-2 lg:grid-cols-3">
              {data.sources.statuses.map((status) => (
                <div
                  key={status.key}
                  className={`rounded-xl border px-3 py-2 ${
                    status.ok && !status.partial
                      ? "border-[#D7EBDD] bg-[#ECFDF5]"
                      : "border-[#F6D5C5] bg-[#FEF3EE]"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <p
                      className={`text-[12px] font-bold ${
                        status.ok && !status.partial ? "text-[#084734]" : "text-[#B85C33]"
                      }`}
                    >
                      {status.label}
                    </p>
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
              ))}
            </div>
          ) : null}
        </section>

        {error ? (
          <div className="mb-4 rounded-xl border border-[#F6D5C5] bg-[#FEF3EE] px-3 py-2 text-[12px] font-medium text-[#B85C33]">
            {error}
          </div>
        ) : null}

        {data?.sources.warnings.length ? (
          <div className="mb-4 flex items-start gap-2 rounded-xl border border-[#F6D5C5] bg-[#FEF3EE] px-3 py-2 text-[12px] text-[#B85C33]">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>{data.sources.warnings.join(" ")}</span>
          </div>
        ) : null}

        {ownerHealth?.ok === false && ownerHealth.message ? (
          <div className="mb-4 flex items-start gap-2 rounded-xl border border-[#F6D5C5] bg-[#FEF3EE] px-3 py-2 text-[12px] text-[#B85C33]">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>{ownerHealth.message}</span>
          </div>
        ) : null}

        <section className="rounded-2xl border border-[#e8e8e4] bg-white">
          <div className="hidden overflow-hidden lg:block">
            <table className="w-full border-collapse text-left">
              <thead className="bg-[#fafaf8] text-[11px] font-semibold uppercase tracking-[0.12em] text-[#1a1a1a]/35">
                <tr>
                  <th className="px-4 py-3">고객</th>
                  <th className="px-4 py-3">상태</th>
                  <th className="px-4 py-3">다음 액션</th>
                  <th className="px-4 py-3">돈흐름</th>
                  <th className="px-4 py-3">담당</th>
                  <th className="px-4 py-3 text-right">점수</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#f0f0ec]">
                {data?.rows.map((row) => (
                  <tr key={row.key} className="transition-colors hover:bg-[#fafaf8]">
                    <td className="px-4 py-3">
                      <Link href={row.href} className="group flex min-w-0 items-center gap-2">
                        <div className="min-w-0">
                          <p className="truncate text-[13px] font-bold text-[#111110]">{row.name}</p>
                          <p className="truncate text-[12px] text-[#1a1a1a]/42">{row.contact ?? "-"}</p>
                        </div>
                        <ExternalLink className="h-3.5 w-3.5 shrink-0 text-[#1a1a1a]/25 group-hover:text-[#111110]" />
                      </Link>
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
                    <td className="px-4 py-3 text-[12px] font-medium text-[#1a1a1a]/55">{row.moneyLabel ?? "-"}</td>
                    <td className="px-4 py-3">
                      <p className="text-[12px] font-semibold text-[#111110]">{row.ownerName ?? "미배정"}</p>
                      <p className="text-[11px] text-[#1a1a1a]/35">{formatDate(row.updatedAt)}</p>
                    </td>
                    <td className={`px-4 py-3 text-right text-[18px] font-bold tabular-nums ${scoreTone(row.score)}`}>
                      {row.score}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="divide-y divide-[#f0f0ec] lg:hidden">
            {data?.rows.map((row) => (
              <Link key={row.key} href={row.href} className="block p-4 transition-colors hover:bg-[#fafaf8]">
                <div className="mb-2 flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="mb-1">{sourceBadge(row)}</div>
                    <p className="truncate text-[14px] font-bold text-[#111110]">{row.name}</p>
                    <p className="truncate text-[12px] text-[#1a1a1a]/42">{row.contact ?? "-"}</p>
                  </div>
                  <span className={`text-[20px] font-bold tabular-nums ${scoreTone(row.score)}`}>{row.score}</span>
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
              </Link>
            ))}
          </div>

          {data && data.rows.length > 0 ? (
            <div className="flex flex-col gap-3 border-t border-[#f0f0ec] px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-[12px] font-medium text-[#1a1a1a]/45">
                {data.rows.length.toLocaleString("ko-KR")} / {data.pagination.total.toLocaleString("ko-KR")}명 표시
              </p>
              {data.pagination.hasMore && data.pagination.nextOffset !== null ? (
                <button
                  type="button"
                  onClick={() => void loadPage(data.pagination.nextOffset ?? data.rows.length, { append: true })}
                  disabled={loadingMore || refreshing}
                  className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg border border-[#e8e8e4] bg-white px-3 text-[12px] font-semibold text-[#111110] transition-colors hover:bg-[#f5f5f2] disabled:text-[#1a1a1a]/30"
                >
                  <RefreshCw className={`h-3.5 w-3.5 ${loadingMore ? "animate-spin" : ""}`} />
                  더 보기
                </button>
              ) : (
                <span className="text-[12px] font-semibold text-[#1a1a1a]/35">전체 결과를 표시 중입니다.</span>
              )}
            </div>
          ) : null}

          {loading && !data ? (
            <div className="p-8 text-center text-[13px] text-[#1a1a1a]/40">통합 고객 목록을 불러오는 중입니다...</div>
          ) : data && data.rows.length === 0 ? (
            <div className="p-8 text-center text-[13px] text-[#1a1a1a]/40">조건에 맞는 고객이 없습니다.</div>
          ) : null}
        </section>
      </div>
    </div>
  )
}
