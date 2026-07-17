"use client"

import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react"
import dynamic from "next/dynamic"
import Link from "next/link"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { AlertTriangle, Building2, ChevronLeft, ChevronRight, ExternalLink, Filter, PhoneCall, RefreshCw, Search, Tag, UserPlus, UserRound } from "lucide-react"

import { adminFetchJsonCached, getCachedAdminJson } from "@/lib/admin-client"
import type {
  CrmUnifiedCustomerRow,
  CrmUnifiedCustomerSource,
  CrmUnifiedLifecycle,
  CrmUnifiedSavedView,
} from "@/lib/repositories/crm-unified-customers"
import { buildOwnerSelectOptions, useCrmOwners } from "./useCrmOwners"
import Account360Lens from "./Account360Lens"
import Customer360DrawerSkeleton from "./Customer360DrawerSkeleton"
import CrmCustomerFlags from "./CrmCustomerFlags"
import CrmContactValue from "./CrmContactValue"
import { deriveCustomerFlags, type CustomerFlag } from "@/lib/crm/customer-flags"
import { LEAD_BADGE_TONE_CLASSES, leadBadges } from "@/lib/crm/lead-badges"

// 드로어·리드 등록 모달 코드 스플리팅(41af51a4 패턴) — 목록 첫 로드에서 청크를 제외하고
// 행 클릭/딥링크(?account=)·리드 등록 클릭 시점에만 내려받는다. 열림 상태에서만 렌더하므로
// 로딩 폴백이 닫힌 화면에 노출될 일은 없다. 드로어 폴백은 실제 드로어와 같은 골격의
// 스켈레톤(딥링크 첫 페인트가 빈 화면으로 깜빡이지 않게), props 계약은 그대로다.
const Customer360Drawer = dynamic(() => import("./Customer360Drawer"), {
  loading: () => <Customer360DrawerSkeleton />,
})
const LeadRegisterModal = dynamic(() => import("./LeadRegisterModal"), {
  // 모달 본체는 document.body 포털(조상 transform 대비)이라 폴백도 뷰포트 기준이 안전하지만,
  // 한 프레임짜리 전환이라 골격 없이 딤 배경만 먼저 깔아 클릭 무반응처럼 보이는 것만 막는다.
  loading: () => <div className="fixed inset-0 z-50 bg-black/20" aria-hidden />,
})

type SourceFilter = "all" | CrmUnifiedCustomerSource
type LifecycleFilter = "all" | CrmUnifiedLifecycle
type SavedViewFilter = CrmUnifiedSavedView

interface CrmUnifiedCustomers {
  generatedAt: string
  sources: {
    leadsOk: boolean
    neoAccountsOk: boolean
    portalCustomersOk?: boolean
    warnings: string[]
    statuses: Array<{
      key: "classin_leads" | "app_customers" | "external_crm" | "sheets"
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
    customerCount?: number
    highPriorityCount: number
    ownerCount: number
    viewCounts?: Record<string, number>
    availableTags?: string[]
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
  { key: "customer", label: "전환 고객" },
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
  { key: "my_owner", label: "내 리드·고객", description: "내 계정에 배정된 리드와 고객" },
  { key: "priority", label: "우선 처리", description: "점수 68점 이상" },
  { key: "new_leads", label: "신규 리드", description: "첫 응답 대상" },
  { key: "needs_care", label: "관리 필요 고객", description: "만료·휴면 위험" },
  { key: "expiring", label: "만료 임박", description: "만료 14일 이내(지난 것 포함)" },
  { key: "dormant", label: "30일+ 미접촉", description: "마지막 활동 30일 초과" },
  { key: "hot_lead", label: "고전환 리드", description: "점수 상위 리드" },
  { key: "upsell", label: "업셀 후보", description: "활성 고객 · 잔액 보유" },
  { key: "site_leads", label: "홈페이지 유입", description: "홈페이지로 들어와 NEO 미등록" },
  { key: "unanswered", label: "미응답", description: "첫 응답 전 리드 (24h 초과 위험)" },
]

const CACHE_TTL_MS = 90_000
const PAGE_LIMIT = 100

function rowToFlags(row: CrmUnifiedCustomerRow): CustomerFlag[] {
  return deriveCustomerFlags({
    // 전환 고객은 계정 계열 신호(잔액·만료 없음)로 취급 — 리드 규칙(new 등) 오적용 방지.
    source: row.source === "lead" ? "lead" : "neo_account",
    lifecycle: row.lifecycle,
    score: row.score,
    expireAt: row.expireAt,
    balance: row.balance,
    updatedAt: row.updatedAt,
  })
}
const OWNER_STORAGE_KEY = "classin_crm_unified_owner"
const CURRENT_OWNER_VALUE = "__me"

function listUrl(input: {
  query: string
  source: SourceFilter
  lifecycle: LifecycleFilter
  owner: string
  view: SavedViewFilter
  tag: string
  offset: number
}) {
  const params = new URLSearchParams({ limit: String(PAGE_LIMIT), offset: String(input.offset) })
  if (input.query.trim()) params.set("q", input.query.trim())
  if (input.source !== "all") params.set("source", input.source)
  if (input.lifecycle !== "all") params.set("lifecycle", input.lifecycle)
  if (input.view !== "all") params.set("view", input.view)
  if (input.owner) params.set("owner", input.owner)
  if (input.tag) params.set("tag", input.tag)
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

function TagChips({ tags }: { tags: string[] }) {
  if (!tags.length) return null
  return (
    <span className="mt-1 flex flex-wrap gap-1">
      {tags.slice(0, 3).map((tag) => (
        <span
          key={tag}
          className="rounded border border-[#e8e8e4] bg-[#fafaf8] px-1.5 py-0.5 text-[10px] font-medium text-[#1a1a1a]/55"
        >
          {tag}
        </span>
      ))}
      {tags.length > 3 ? <span className="self-center text-[10px] text-[#1a1a1a]/35">+{tags.length - 3}</span> : null}
    </span>
  )
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
  if (row.source === "customer") {
    return (
      <span
        className="inline-flex items-center gap-1 rounded-full border border-[#D7EBDD] bg-white px-2 py-0.5 text-[11px] font-semibold text-[#084734]"
        title="리드 전환으로 생성된 앱 고객"
      >
        <UserRound className="h-3 w-3" />
        전환 고객
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

// 리드 행 배지 — 파생 규칙은 lib/crm/lead-badges.ts(순수 모듈, 단위 테스트 대상) 소유.
function LeadRowBadges({ row, nowMs }: { row: CrmUnifiedCustomerRow; nowMs: number }) {
  const badges = leadBadges(row, nowMs)
  if (!badges) return null
  return (
    <>
      {badges.map((badge) => (
        <span
          key={badge.label}
          className={`rounded-full border px-2 py-0.5 text-[11px] font-bold ${LEAD_BADGE_TONE_CLASSES[badge.tone]}`}
        >
          {badge.label}
        </span>
      ))}
    </>
  )
}

// 검색 패널 — 검색·소스 토글·상태/담당 셀렉트·라벨·요약 타일·소스 상태 타일.
// quickMode(칩 진입)일 때는 렌더되지 않는다. 본체에서 기계적 추출 — 동작 동일.
function CustomerSearchPanel({
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
  return (
    <section className="mb-4 rounded-2xl border border-[#e8e8e4] bg-white p-4">
      <div className="grid gap-3 lg:grid-cols-[minmax(220px,1fr)_auto_auto_auto] lg:items-center">
        <label className="flex h-10 items-center gap-2 rounded-lg border border-[#e8e8e4] bg-[#fafaf8] px-3">
          <Search className="h-4 w-4 text-[#1a1a1a]/35" />
          <input
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
            className="h-full min-w-0 flex-1 bg-transparent text-[13px] font-medium text-[#111110] outline-none placeholder:text-[#1a1a1a]/30"
            placeholder="이름, 연락처, 담당자 검색"
          />
        </label>
        <div className="inline-flex rounded-lg border border-[#e8e8e4] bg-[#fafaf8] p-1">
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
        <label className="flex h-10 items-center gap-1.5 rounded-lg border border-[#e8e8e4] bg-white px-2 text-[12px] text-[#1a1a1a]/50">
          <Filter className="h-3.5 w-3.5" />
          <select
            value={lifecycle}
            onChange={(event) => onLifecycleChange(event.target.value as LifecycleFilter)}
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
            onChange={(event) => onOwnerChange(event.target.value)}
            className="h-full min-w-[128px] bg-transparent text-[12px] font-semibold text-[#111110] outline-none"
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
        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-5">
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
            <p className="text-[11px] font-semibold text-[#1a1a1a]/35">전환 고객</p>
            <p className="mt-1 text-xl font-bold text-[#111110]">
              {(data.summary.customerCount ?? 0).toLocaleString("ko-KR")}
            </p>
          </div>
          <div className="rounded-xl bg-[#fafaf8] p-3">
            <p className="text-[11px] font-semibold text-[#1a1a1a]/35">우선 처리</p>
            <p className="mt-1 text-xl font-bold text-[#B85C33]">
              {data.summary.highPriorityCount.toLocaleString("ko-KR")}
            </p>
          </div>
        </div>
      ) : loading ? (
        // 콜드로드 스켈레톤 — 실제 요약 타일 5칸 그리드와 동일 골격(0 플래시·점프 방지).
        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-5">
          {Array.from({ length: 5 }).map((_, index) => (
            <div key={index} className="rounded-xl bg-[#fafaf8] p-3">
              <div className="h-3 w-14 animate-pulse rounded bg-[#f0f0ec]" />
              <div className="mt-2 h-6 w-16 animate-pulse rounded bg-[#f0f0ec]" />
            </div>
          ))}
        </div>
      ) : null}

      {data?.sources.statuses.length ? (
        <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
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
  const [tagFilter, setTagFilter] = useState("")
  const [data, setData] = useState<CrmUnifiedCustomers | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [drawer, setDrawer] = useState<{ key: string; name: string } | null>(null)
  const [leadModalOpen, setLeadModalOpen] = useState(false)
  const requestSeq = useRef(0)
  // 드로어 컴포저 dirty — 뒤로가기(?account= 소실) 닫기 경로가 드로어 내부 닫기 가드와
  // 같은 확인을 거치게 한다(가드 없이는 뒤로가기가 작성 중 기록을 무음 폐기).
  const drawerDirtyRef = useRef(false)

  // 드로어를 ?account= 에 동기화 — 딥링크/뒤로가기 (C9)
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const setDrawerUrl = useCallback(
    (key: string | null, mode: "push" | "replace") => {
      const params = new URLSearchParams(Array.from(searchParams.entries()))
      if (key) params.set("account", key)
      else params.delete("account")
      const qs = params.toString()
      const href = qs ? `${pathname}?${qs}` : pathname
      if (mode === "push") router.push(href, { scroll: false })
      else router.replace(href, { scroll: false })
    },
    [router, pathname, searchParams]
  )

  // 열 때 push로 히스토리 항목을 남겨 브라우저 '뒤로가기'가 드로어를 닫게 한다.
  const openDrawer = useCallback(
    (key: string, name: string) => {
      setDrawer({ key, name })
      setDrawerUrl(key, "push")
    },
    [setDrawerUrl]
  )

  // 닫을 때는 replace로 account만 제거(불필요한 히스토리 항목을 남기지 않음).
  // dirty 리셋: 드로어가 dynamic 전환으로 닫힘=언마운트가 되면서, 마운트 유지 시절
  // 드로어 내부 리셋 효과가 하던 onDirtyChange(false) 통지가 사라졌다 — 부모가 직접 리셋한다.
  const closeDrawer = useCallback(() => {
    drawerDirtyRef.current = false
    setDrawer(null)
    setDrawerUrl(null, "replace")
  }, [setDrawerUrl])

  // URL ↔ 드로어 상태 양방향 동기화 — 딥링크 복원 + 뒤로/앞으로가기(popstate) 대응.
  // drawerRef: 이 효과는 searchParams 변화에만 반응해야 한다 — 드로어 상태를 deps에 넣으면
  // closeDrawer의 replace가 착지하기 전 중간 렌더(드로어 null·URL은 아직 account 보유)에서
  // 드로어를 되살린다.
  const drawerRef = useRef(drawer)
  useEffect(() => {
    drawerRef.current = drawer
  }, [drawer])

  useEffect(() => {
    const account = searchParams.get("account")
    const current = drawerRef.current
    if (!account) {
      if (!current) return
      // 뒤로가기로 ?account=가 사라질 때: 컴포저에 작성 중 기록이 있으면 확인 후에만 닫는다.
      // 거부 시 라우터 push로 account를 복원(히스토리 한 단계 재적재) — raw history API는
      // useSearchParams와 desync되므로 금지.
      if (drawerDirtyRef.current && !window.confirm("작성 중인 기록이 있습니다. 닫을까요?")) {
        setDrawerUrl(current.key, "push")
        return
      }
      // 언마운트 닫기라 드로어 내부 리셋 효과의 dirty=false 통지가 없다 — 여기서 직접 리셋.
      drawerDirtyRef.current = false
      setDrawer(null)
      return
    }
    if (current?.key === account) return
    setDrawer({ key: account, name: current?.name ?? "" })
  }, [searchParams, setDrawerUrl])

  // 리드 전환 완료 패널 '고객 보기' 딥링크(?q=) → 검색어 1회 복원.
  const restoredQueryRef = useRef(false)
  useEffect(() => {
    if (restoredQueryRef.current) return
    restoredQueryRef.current = true
    const q = searchParams.get("q")?.trim()
    if (q) setQuery(q)
  }, [searchParams])

  // 사이드바 저장된 세그먼트 링크(?view=) → 저장 뷰 동기화.
  // 사이드바 칩 카운트는 전역(검색·담당·라벨 무필터) 기준이므로, 딥링크 착지 시 남아 있는
  // 로컬 필터를 함께 초기화해 목록 건수가 칩 숫자와 일치하게 한다(착지 정합).
  // view 값이 실제로 바뀔 때만 실행 — 드로어(?account=) push 등 다른 쿼리 변경에는 불변.
  const lastViewParamRef = useRef<string | null>(null)
  useEffect(() => {
    const view = searchParams.get("view")
    if (view === lastViewParamRef.current) return
    lastViewParamRef.current = view
    if (!view) return
    const known = SAVED_VIEW_FILTERS.some((filter) => filter.key === view)
    setSavedView(known ? (view as SavedViewFilter) : "all")
    setSource("all")
    setLifecycle("all")
    setTagFilter("")
    setQuery("")
    setOwner(view === "my_owner" ? CURRENT_OWNER_VALUE : "")
  }, [searchParams])

  // 칩 클릭 ↔ URL 동기화 — setDrawerUrl과 동일하게 라우터 경유(router.replace).
  // raw history API는 useSearchParams와 desync되어 드로어 열기/닫기가 ?view=를 유실한다.
  // replace라 히스토리를 오염시키지 않고(뒤로가기 안전), lastViewParamRef를 라우터 호출보다
  // 먼저 갱신해 우리 자신의 URL 변경이 위 착지 effect(필터 초기화)를 재발화시키지 않게 한다.
  const syncViewParam = useCallback(
    (view: SavedViewFilter) => {
      const params = new URLSearchParams(Array.from(searchParams.entries()))
      if (view === "all") params.delete("view")
      else params.set("view", view)
      lastViewParamRef.current = view === "all" ? null : view
      const qs = params.toString()
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false })
    },
    [router, pathname, searchParams]
  )
  const { owners: crmOwners, currentOwner, health: ownerHealth } = useCrmOwners()
  const ownerOptions = useMemo(() => buildOwnerSelectOptions(data?.owners, crmOwners), [crmOwners, data?.owners])

  // 배지 SLA 경과 계산 기준 시각 — 행마다 Date.now() 호출 방지 + 60초 틱으로 경과시간 실시간 갱신.
  const [nowMs, setNowMs] = useState(() => Date.now())
  useEffect(() => {
    const id = window.setInterval(() => setNowMs(Date.now()), 60_000)
    return () => window.clearInterval(id)
  }, [])

  const currentOwnerCount = useMemo(() => {
    const selected = normalizeText(owner === CURRENT_OWNER_VALUE ? currentOwner?.ownerKey : owner)
    if (!selected) return 0
    return ownerOptions.find((option) => normalizeText(option.ownerName) === selected)?.count ?? 0
  }, [currentOwner?.ownerKey, owner, ownerOptions])

  const loadPage = useCallback(
    async (offset: number, options?: { force?: boolean; append?: boolean }) => {
      const append = Boolean(options?.append)
      const url = listUrl({ query: deferredQuery, source, lifecycle, owner, view: savedView, tag: tagFilter, offset })
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
    [deferredQuery, source, lifecycle, owner, savedView, tagFilter]
  )

  useEffect(() => {
    void loadPage(0)
  }, [loadPage])

  useEffect(() => {
    if (typeof window === "undefined") return
    // 세그먼트 딥링크(?view=) 착지 시에는 저장된 담당자 필터를 복원하지 않는다 — 칩 카운트(전역 기준) 정합.
    if (new URLSearchParams(window.location.search).get("view")) return
    const storedOwner = window.localStorage.getItem(OWNER_STORAGE_KEY)
    if (storedOwner) setOwner(storedOwner)
  }, [])

  // 담당자 필터 영속화 — 사용자가 직접 바꿀 때만 기록한다.
  // (딥링크 착지가 프로그램적으로 owner를 비울 때 저장된 선호가 지워지지 않도록 effect 영속화 대신 액션 시점에 호출.)
  const persistOwner = useCallback((next: string) => {
    if (typeof window === "undefined") return
    if (next) window.localStorage.setItem(OWNER_STORAGE_KEY, next)
    else window.localStorage.removeItem(OWNER_STORAGE_KEY)
  }, [])

  const selectSavedView = (view: SavedViewFilter) => {
    if (view === "my_owner") {
      if (!currentOwner) return
      if (savedView === "my_owner") {
        setOwner("")
        persistOwner("")
        setSavedView("all")
        syncViewParam("all")
        return
      }
      setOwner(CURRENT_OWNER_VALUE)
      persistOwner(CURRENT_OWNER_VALUE)
      setSavedView(view)
      syncViewParam(view)
      setSource("all")
      setLifecycle("all")
      return
    }

    const next: SavedViewFilter = savedView === view ? "all" : view
    setSavedView(next)
    syncViewParam(next)
    if (view === "new_leads") {
      setSource("lead")
      setLifecycle("all")
    }
    if (view === "needs_care") {
      setSource("neo_account")
      setLifecycle("all")
    }
    if (view === "priority") {
      setSource("all")
      setLifecycle("all")
    }
  }

  // 빠른 보기 모드 — 칩(저장 뷰) 진입 시 검색 UI를 접고 결과 스트립만 보여준다.
  // 숨김이지 리셋이 아님: query/owner 등 로컬 상태는 메모리에 유지된다.
  const quickMode = savedView !== "all"

  // 스트립의 '전체 보기' 전용 탈출 — selectSavedView와 달리 무조건 해제한다.
  // (?view=my_owner 딥링크 착지 후 currentOwner가 없으면 selectSavedView는 조기 return이라
  // 토글 해제가 막히는 탈출 트랩 방지. my_owner가 걸어둔 owner 필터도 함께 해제.)
  const exitQuickView = useCallback(() => {
    if (savedView === "my_owner") {
      setOwner("")
      persistOwner("")
    }
    setSavedView("all")
    syncViewParam("all")
  }, [persistOwner, savedView, syncViewParam])

  // 빠른 보기 잔존 필터 힌트 — 숨김≠리셋 설계라 접힌 검색 패널의 검색어/담당/라벨이 남아
  // 결과를 조용히 좁힐 수 있다. 남은 필터를 스트립에 명시하고 '해제'로 뷰는 유지한 채 푼다.
  // my_owner 뷰의 담당 필터는 뷰 정의 그 자체라 잔존 필터로 치지 않는다(해제하면 뷰가 0건이 됨).
  const trimmedQuery = query.trim()
  const lingeringOwner = savedView !== "my_owner" ? owner : ""
  const lingeringOwnerLabel = useMemo(() => {
    if (!lingeringOwner) return null
    if (lingeringOwner === CURRENT_OWNER_VALUE) return currentOwner?.displayName ?? "내 담당"
    return ownerOptions.find((option) => option.ownerName === lingeringOwner)?.label ?? lingeringOwner
  }, [currentOwner?.displayName, lingeringOwner, ownerOptions])
  const lingeringParts = [
    trimmedQuery ? `검색 "${trimmedQuery}"` : null,
    lingeringOwnerLabel ? `담당 ${lingeringOwnerLabel}` : null,
    tagFilter ? `라벨 ${tagFilter}` : null,
  ].filter((part): part is string => Boolean(part))

  const clearLingeringFilters = useCallback(() => {
    setQuery("")
    setTagFilter("")
    if (savedView !== "my_owner") {
      setOwner("")
      persistOwner("")
    }
  }, [persistOwner, savedView])

  // 빈 상태 다음 행동 안내 — 필터가 걸려 있으면 초기화를, 아니면 리드 등록/매칭 연결을 권한다.
  const hasActiveFilters =
    Boolean(query.trim()) ||
    source !== "all" ||
    lifecycle !== "all" ||
    Boolean(owner) ||
    savedView !== "all" ||
    Boolean(tagFilter)

  const resetFilters = useCallback(() => {
    setQuery("")
    setSource("all")
    setLifecycle("all")
    setOwner("")
    persistOwner("")
    setSavedView("all")
    syncViewParam("all")
    setTagFilter("")
  }, [persistOwner, syncViewParam])

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
          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={() => setLeadModalOpen(true)}
              className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg bg-[#084734] px-3 text-[12px] font-semibold text-white transition-opacity hover:opacity-90"
            >
              <UserPlus className="h-3.5 w-3.5" />
              리드 등록
            </button>
            <button
              type="button"
              onClick={() => void loadPage(0, { force: true })}
              className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg border border-[#e8e8e4] bg-white px-3 text-[12px] font-semibold text-[#111110] transition-colors hover:bg-[#f5f5f2]"
              disabled={refreshing}
            >
              <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} />
              새로고침
            </button>
          </div>
        </div>

        {/* 빠른 필터 칩 — 검색 섹션과 독립인 항상 노출 행 (칩 진입 시에도 유지). */}
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <span className="inline-flex h-8 items-center gap-1.5 text-[12px] font-semibold text-[#1a1a1a]/45">
            <Filter className="h-3.5 w-3.5" />
            빠른 필터
          </span>
          {SAVED_VIEW_FILTERS.map((filter) => {
            const isActive = savedView === filter.key
            const disabled = filter.key === "my_owner" && !currentOwner
            const segmentCount = data?.summary.viewCounts?.[filter.key]
            const label =
              filter.key === "my_owner" && currentOwner
                ? `${filter.label}${currentOwnerCount ? ` ${currentOwnerCount}` : ""}`
                : segmentCount != null
                  ? `${filter.label} ${segmentCount}`
                  : filter.label
            return (
              <button
                key={filter.key}
                type="button"
                onClick={() => selectSavedView(filter.key)}
                disabled={disabled}
                aria-pressed={isActive}
                title={disabled ? "현재 Admin 계정에 CRM 담당자 매핑이 없습니다." : filter.description}
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

        {quickMode ? (
          // 빠른 보기 스트립 — 활성 뷰 이름 + 결과 건수 + 전체 보기(토글 해제) 복귀 버튼.
          <div className="mb-4 rounded-2xl border border-[#e8e8e4] bg-white px-4 py-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-[13px] font-semibold text-[#111110]">
                {SAVED_VIEW_FILTERS.find((f) => f.key === savedView)?.label}
                <span className="ml-2 text-[12px] font-medium text-[#1a1a1a]/45 tabular-nums">
                  {data ? `${data.summary.total.toLocaleString("ko-KR")}건` : error ? "불러오지 못했습니다" : "불러오는 중"}
                </span>
              </p>
              <button
                type="button"
                onClick={exitQuickView}
                className="inline-flex h-8 items-center gap-1 rounded-lg border border-[#e8e8e4] bg-white px-2.5 text-[12px] font-semibold text-[#1a1a1a]/60 hover:bg-[#fafaf8]"
              >
                전체 보기 (검색·필터)
              </button>
            </div>
            {lingeringParts.length > 0 ? (
              // 잔존 필터 힌트 — 접힌 검색 패널의 필터가 이 뷰 결과를 좁히고 있음을 알린다.
              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                <span className="inline-flex items-center rounded-full border border-[#e8e8e4] bg-[#fafaf8] px-2.5 py-1 text-[11px] font-medium text-[#1a1a1a]/55">
                  {lingeringParts.join(" · ")} 적용 중
                </span>
                <button
                  type="button"
                  onClick={clearLingeringFilters}
                  className="h-6 rounded-md px-1.5 text-[11px] font-semibold text-[#1a1a1a]/45 transition-colors hover:text-[#111110]"
                >
                  해제
                </button>
              </div>
            ) : null}
          </div>
        ) : (
          <CustomerSearchPanel
            query={query}
            onQueryChange={setQuery}
            source={source}
            onSourceChange={setSource}
            lifecycle={lifecycle}
            onLifecycleChange={setLifecycle}
            owner={owner}
            onOwnerChange={(nextOwner) => {
              // 이 패널은 quickMode(savedView !== "all")에서 렌더되지 않으므로
              // 여기 도달 시 savedView는 항상 "all" — my_owner 해제 가드 불필요.
              setOwner(nextOwner)
              persistOwner(nextOwner)
            }}
            currentOwner={currentOwner}
            currentOwnerCount={currentOwnerCount}
            ownerOptions={ownerOptions}
            tagFilter={tagFilter}
            onTagFilterChange={setTagFilter}
            data={data}
            loading={loading}
          />
        )}

        <Account360Lens />

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
                {loading && !data
                  ? // 콜드로드 스켈레톤 — 컬럼(고객/상태/다음 액션/돈흐름/담당/점수) 골격 일치.
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
                          <div className="ml-auto h-5 w-8 animate-pulse rounded bg-[#f0f0ec]" />
                        </td>
                      </tr>
                    ))
                  : null}
                {data?.rows.map((row) => (
                  <tr key={row.key} className="transition-colors hover:bg-[#fafaf8]">
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
                              onClick={() => openDrawer(row.key, row.name)}
                              className="group block max-w-full text-left"
                            >
                              <p className="truncate text-[13px] font-bold text-[#111110] group-hover:underline">{row.name}</p>
                            </button>
                          )}
                          <CrmContactValue value={row.contact} className="mt-0.5" />
                          <div className="mt-1 flex flex-wrap items-center gap-1 empty:hidden">
                            <CrmCustomerFlags flags={rowToFlags(row)} max={4} />
                            <LeadRowBadges row={row} nowMs={nowMs} />
                          </div>
                          <TagChips tags={row.tags} />
                        </div>
                        <Link
                          href={row.source === "customer" ? row.href : `/admin/crm/customers/${encodeURIComponent(row.key)}`}
                          className="shrink-0 text-[#1a1a1a]/25 transition-colors hover:text-[#111110]"
                          aria-label="고객 상세 페이지 열기"
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
            {data?.rows.map((row) => (
              <div key={row.key} className="relative transition-colors hover:bg-[#fafaf8]">
                {row.source === "customer" ? (
                  <Link href={row.href} aria-label={`${row.name} 상세 보기`} className="absolute inset-0 z-0" />
                ) : (
                  <button
                    type="button"
                    onClick={() => openDrawer(row.key, row.name)}
                    aria-label={`${row.name} 상세 보기`}
                    className="absolute inset-0 z-0"
                  />
                )}
                <div className="pointer-events-none relative z-10 p-4">
                  <div className="mb-2 flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="mb-1">{sourceBadge(row)}</div>
                      <p className="truncate text-[14px] font-bold text-[#111110]">{row.name}</p>
                      <CrmContactValue value={row.contact} className="pointer-events-auto mt-0.5" />
                      <div className="mt-1.5 flex flex-wrap items-center gap-1 empty:hidden">
                        <CrmCustomerFlags flags={rowToFlags(row)} max={4} />
                        <LeadRowBadges row={row} nowMs={nowMs} />
                      </div>
                      <TagChips tags={row.tags} />
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
                  onClick={() => void loadPage(Math.max(0, data.pagination.offset - PAGE_LIMIT))}
                  disabled={data.pagination.offset === 0 || loading || loadingMore || refreshing}
                  className="inline-flex h-9 items-center gap-1 rounded-lg border border-[#e8e8e4] bg-white px-2.5 text-[12px] font-semibold text-[#111110] transition-colors hover:bg-[#f5f5f2] disabled:opacity-40"
                >
                  <ChevronLeft className="h-3.5 w-3.5" />
                  이전
                </button>
                <span className="px-1.5 text-[12px] font-semibold tabular-nums text-[#1a1a1a]/55">
                  {Math.floor(data.pagination.offset / PAGE_LIMIT) + 1} /{" "}
                  {Math.max(1, Math.ceil(data.pagination.total / PAGE_LIMIT))}
                </span>
                <button
                  type="button"
                  onClick={() => void loadPage(data.pagination.nextOffset ?? data.pagination.offset + PAGE_LIMIT)}
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
              <p className="text-[13px] font-semibold text-[#111110]">조건에 맞는 고객이 없습니다.</p>
              <p className="mt-1 text-[12px] text-[#1a1a1a]/45">
                {hasActiveFilters
                  ? "필터를 초기화하거나 새 리드를 등록해 시작하세요."
                  : "새 리드를 등록하거나 REV/HW 원장 매칭을 연결해 시작하세요."}
              </p>
              <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
                {hasActiveFilters ? (
                  <button
                    type="button"
                    onClick={resetFilters}
                    className="inline-flex h-8 items-center rounded-lg border border-[#e8e8e4] bg-white px-3 text-[12px] font-semibold text-[#111110] transition-colors hover:bg-[#f5f5f2]"
                  >
                    필터 초기화
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={() => setLeadModalOpen(true)}
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
              </div>
            </div>
          ) : null}
        </section>
      </div>

      {/* 열림 상태에서만 렌더 — 닫힘=null 렌더였던 기존과 동일 화면이면서, dynamic 청크를
          열 때만 내려받고 닫힌 첫 로드에 로딩 폴백이 새어 나오지 않는다. */}
      {drawer ? (
        <Customer360Drawer
          customerKey={drawer.key}
          name={drawer.name}
          onClose={closeDrawer}
          onDirtyChange={(dirty) => {
            drawerDirtyRef.current = dirty
          }}
        />
      ) : null}

      {leadModalOpen ? (
        <LeadRegisterModal
          open
          onClose={() => setLeadModalOpen(false)}
          onDone={() => void loadPage(0, { force: true })}
        />
      ) : null}
    </div>
  )
}
