"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { useSearchParams } from "next/navigation"
import {
  AlertTriangle,
  Building2,
  CalendarClock,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  RefreshCw,
  Search,
  Wallet,
  X,
} from "lucide-react"

import { adminFetchJsonCached } from "@/lib/admin-client"
import type {
  NeoCrmCustomerDetail,
  NeoCrmCustomerList,
  NeoCrmCustomerMoneyItem,
  NeoCrmCustomerRow,
} from "@/lib/admin-crm-customers-neo"

type SortKey = "balance" | "expire" | "order" | "lastClass" | "name"

const SORT_OPTIONS: Array<{ key: SortKey; label: string }> = [
  { key: "balance", label: "잔액순" },
  { key: "expire", label: "만료임박" },
  { key: "order", label: "오더순" },
  { key: "lastClass", label: "최근수업" },
  { key: "name", label: "이름순" },
]

const PAGE_SIZE = 50
const DAY_MS = 24 * 60 * 60 * 1000

// 매출·수금·잔액은 위안화(CNY).
function formatCNY(value: number | null | undefined) {
  const num = Number(value ?? 0)
  if (Math.abs(num) >= 10_000) {
    return `¥${(num / 10_000).toLocaleString("ko-KR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}만`
  }
  return `¥${num.toLocaleString("ko-KR")}`
}

// 오더(Opportunity)는 달러($)로 기재된다.
function formatUSD(value: number | null | undefined) {
  return `$${Number(value ?? 0).toLocaleString("en-US", { maximumFractionDigits: 2 })}`
}

function formatNumber(value: number | null | undefined) {
  return new Intl.NumberFormat("ko-KR").format(Number(value ?? 0))
}

function formatDay(value: string | null | undefined) {
  if (!value) return "-"
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return "-"
  return new Intl.DateTimeFormat("ko-KR", { year: "2-digit", month: "2-digit", day: "2-digit" }).format(date)
}

function formatDateTime(value: string | null | undefined) {
  if (!value) return "-"
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return "-"
  return new Intl.DateTimeFormat("ko-KR", {
    year: "2-digit",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date)
}

function formatAgeHours(value: number | null | undefined) {
  if (value == null) return "확인 불가"
  if (value < 1) return "1시간 이내"
  if (value < 48) return `${Math.round(value)}시간 전`
  return `${Math.round(value / 24)}일 전`
}

function daysUntil(value: string | null | undefined) {
  if (!value) return null
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return null
  const today = new Date()
  const todayMs = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime()
  const targetMs = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime()
  return Math.round((targetMs - todayMs) / DAY_MS)
}

function ExpiryBadge({ expireAt }: { expireAt: string | null }) {
  const days = daysUntil(expireAt)
  if (!expireAt || days === null) return <span className="text-[#1a1a1a]/30">-</span>
  if (days < 0)
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-[#F6D5C5] bg-[#FEF3EE] px-2 py-0.5 text-[11px] font-semibold text-[#B85C33]">
        만료 {formatDay(expireAt)}
      </span>
    )
  if (days <= 60)
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-amber-100 bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-700">
        D-{days} · {formatDay(expireAt)}
      </span>
    )
  return <span className="text-[12px] text-[#1a1a1a]/55">{formatDay(expireAt)}</span>
}

// 슬라이드오버 내부 돈 흐름 섹션 — 기본 5건, 더보기로 확장.
// 오더는 USD, 수금/성과는 CNY라 섹션별 통화 포맷을 받는다.
function MoneySection({
  title,
  items,
  emptyLabel,
  format,
}: {
  title: string
  items: NeoCrmCustomerMoneyItem[]
  emptyLabel: string
  format: (value: number | null | undefined) => string
}) {
  const [expanded, setExpanded] = useState(false)
  const visible = expanded ? items : items.slice(0, 5)

  return (
    <div className="rounded-xl border border-[#f0f0ec] p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h4 className="text-[13px] font-semibold text-[#111110]">{title}</h4>
        <span className="text-[11px] text-[#1a1a1a]/35">{formatNumber(items.length)}건</span>
      </div>
      {items.length === 0 ? (
        <p className="py-3 text-center text-[12px] text-[#1a1a1a]/30">{emptyLabel}</p>
      ) : (
        <div className="divide-y divide-[#f0f0ec]">
          {visible.map((item) => (
            <div key={item.id} className="grid grid-cols-[minmax(0,1fr)_96px] gap-2 py-2">
              <div className="min-w-0">
                <p className="truncate text-[12px] font-medium text-[#111110]">{item.title}</p>
                <p className="truncate text-[11px] text-[#1a1a1a]/40">
                  {item.ownerName}
                  {item.status ? ` · ${item.status}` : ""}
                </p>
              </div>
              <div className="text-right">
                <p className="text-[12px] font-semibold text-[#111110]">
                  {item.amount == null ? "-" : format(item.amount)}
                </p>
                <p className="text-[10px] text-[#1a1a1a]/35">{formatDay(item.occurredAt)}</p>
              </div>
            </div>
          ))}
          {items.length > 5 ? (
            <button
              type="button"
              onClick={() => setExpanded((prev) => !prev)}
              className="flex w-full items-center justify-center gap-1 pt-2 text-[12px] font-semibold text-[#1a1a1a]/45 transition-colors hover:text-[#111110]"
            >
              {expanded ? "접기" : `더보기 (${formatNumber(items.length - 5)})`}
              {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
            </button>
          ) : null}
        </div>
      )}
    </div>
  )
}

type DetailTab = "eeo" | "orders" | "collections" | "performances"

function SummaryChip({ label, value, tone = "text-[#111110]" }: { label: string; value: string; tone?: string }) {
  return (
    <div className="rounded-lg bg-[#fafaf8] px-2.5 py-1.5">
      <p className="text-[10px] text-[#1a1a1a]/40">{label}</p>
      <p className={`mt-0.5 text-[13px] font-bold tracking-[-0.02em] ${tone}`}>{value}</p>
    </div>
  )
}

function CustomerDetailPanel({
  accountId,
  onClose,
}: {
  accountId: string
  onClose: () => void
}) {
  const [detail, setDetail] = useState<NeoCrmCustomerDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [tab, setTab] = useState<DetailTab>("eeo")

  // 패널은 accountId를 key로 리마운트되므로 초기 상태가 곧 리셋이다.
  useEffect(() => {
    let cancelled = false
    adminFetchJsonCached<NeoCrmCustomerDetail>(`/api/admin/crm/customers-neo/${accountId}`, undefined, {
      ttlMs: 60_000,
    })
      .then((next) => {
        if (cancelled) return
        setDetail(next)
        if (!next.ok && next.error) setError(next.error)
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "고객 상세를 불러오지 못했습니다.")
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [accountId])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [onClose])

  const account = detail?.account
  const eeoAccounts = detail?.eeoAccounts ?? []
  const totalBalance = eeoAccounts.reduce((sum, eeo) => sum + (eeo.balance ?? 0), 0)
  const totalOrder = (detail?.orders ?? []).reduce((sum, item) => sum + (item.amount ?? 0), 0)
  const totalPerformance = (detail?.performances ?? []).reduce((sum, item) => sum + (item.amount ?? 0), 0)
  const earliestExpiry = eeoAccounts
    .map((eeo) => eeo.expireAt)
    .filter((value): value is string => Boolean(value))
    .sort()[0]
  const latestClass = eeoAccounts
    .map((eeo) => eeo.lastClassAt)
    .filter((value): value is string => Boolean(value))
    .sort()
    .at(-1)

  const tabs: Array<{ key: DetailTab; label: string; count: number }> = [
    { key: "eeo", label: "EEO", count: eeoAccounts.length },
    { key: "orders", label: "오더", count: detail?.orders.length ?? 0 },
    { key: "collections", label: "수금", count: detail?.collections.length ?? 0 },
    { key: "performances", label: "성과", count: detail?.performances.length ?? 0 },
  ]

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <button type="button" aria-label="닫기" onClick={onClose} className="absolute inset-0 bg-black/25" />
      <aside className="relative flex h-full w-full max-w-[480px] flex-col overflow-y-auto bg-white shadow-2xl">
        <div className="sticky top-0 z-10 border-b border-[#f0f0ec] bg-white px-5 py-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-[#1a1a1a]/30">Customer Sync Source</p>
              <h3 className="mt-1 truncate text-[18px] font-bold text-[#111110]">
                {account?.name ?? (loading ? "불러오는 중..." : "고객")}
              </h3>
              <p className="mt-1 text-[12px] text-[#1a1a1a]/45">
                {account ? `${account.ownerName}${account.phone ? ` · ${account.phone}` : ""}` : ""}
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-[#e8e8e4] text-[#111110] transition-colors hover:bg-[#f5f5f2]"
              aria-label="닫기"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="flex flex-1 flex-col gap-3 px-5 py-4">
          {error ? (
            <p className="rounded-xl bg-[#FEF3EE] px-3 py-2 text-[12px] leading-relaxed text-[#B85C33]">{error}</p>
          ) : null}

          {loading && !detail ? (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="h-12 animate-pulse rounded-lg bg-[#f0f0ec]" />
                ))}
              </div>
              <div className="h-9 animate-pulse rounded-lg bg-[#f0f0ec]" />
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="h-12 animate-pulse rounded-xl bg-[#f5f5f2]" />
              ))}
            </div>
          ) : detail ? (
            <>
              {/* 요약 칩 — 항상 노출 */}
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                <SummaryChip label="잔액" value={formatCNY(totalBalance)} tone="text-[#084734]" />
                <SummaryChip label="오더" value={formatUSD(totalOrder)} />
                <SummaryChip label="성과" value={formatCNY(totalPerformance)} tone="text-[#084734]" />
                <SummaryChip
                  label="만료 / 최근수업"
                  value={`${earliestExpiry ? formatDay(earliestExpiry) : "-"} / ${
                    latestClass ? formatDay(latestClass) : "-"
                  }`}
                />
              </div>

              {/* 탭 — 한 번에 한 섹션만 */}
              <div className="flex gap-1 rounded-lg bg-[#fafaf8] p-1">
                {tabs.map((item) => (
                  <button
                    key={item.key}
                    type="button"
                    onClick={() => setTab(item.key)}
                    className={`flex-1 rounded-md px-2 py-1.5 text-[12px] font-semibold transition-colors ${
                      tab === item.key ? "bg-white text-[#111110] shadow-sm" : "text-[#1a1a1a]/50 hover:text-[#111110]"
                    }`}
                  >
                    {item.label}
                    <span className="ml-1 text-[11px] text-[#1a1a1a]/35">{item.count}</span>
                  </button>
                ))}
              </div>

              {tab === "eeo" ? (
                eeoAccounts.length === 0 ? (
                  <p className="rounded-xl border border-[#f0f0ec] py-8 text-center text-[12px] text-[#1a1a1a]/30">
                    연결된 EEO 계정이 없습니다.
                  </p>
                ) : (
                  <div className="divide-y divide-[#f0f0ec] rounded-xl border border-[#f0f0ec] px-3">
                    {eeoAccounts.map((eeo) => (
                      <div key={eeo.id} className="grid grid-cols-[minmax(0,1fr)_110px] gap-2 py-2.5">
                        <div className="min-w-0">
                          <p className="truncate text-[12px] font-medium text-[#111110]">{eeo.name}</p>
                          <p className="truncate text-[11px] text-[#1a1a1a]/40">
                            {eeo.uid ? `UID ${eeo.uid}` : "-"}
                            {eeo.lastClassAt ? ` · 최근수업 ${formatDay(eeo.lastClassAt)}` : ""}
                          </p>
                        </div>
                        <div className="flex flex-col items-end gap-1">
                          <p className="text-[12px] font-semibold text-[#084734]">
                            {eeo.balance == null ? "-" : formatCNY(eeo.balance)}
                          </p>
                          <ExpiryBadge expireAt={eeo.expireAt} />
                        </div>
                      </div>
                    ))}
                  </div>
                )
              ) : tab === "orders" ? (
                <MoneySection title="오더 (USD)" items={detail.orders} emptyLabel="오더가 없습니다." format={formatUSD} />
              ) : tab === "collections" ? (
                <MoneySection title="수금 (CNY)" items={detail.collections} emptyLabel="수금 기록이 없습니다." format={formatCNY} />
              ) : (
                <MoneySection title="성과 (CNY)" items={detail.performances} emptyLabel="성과 기록이 없습니다." format={formatCNY} />
              )}
            </>
          ) : null}
        </div>
      </aside>
    </div>
  )
}

function KpiTile({ icon, label, value, hint, tone = "text-[#111110]" }: { icon: React.ReactNode; label: string; value: string; hint: string; tone?: string }) {
  return (
    <div className="rounded-xl bg-[#fafaf8] px-3 py-3">
      <div className="flex items-center gap-1.5 text-[#1a1a1a]/40">
        {icon}
        <p className="text-[11px] font-semibold uppercase tracking-[0.1em]">{label}</p>
      </div>
      <p className={`mt-2 text-2xl font-bold tracking-[-0.04em] ${tone}`}>{value}</p>
      <p className="mt-1 text-[11px] leading-relaxed text-[#1a1a1a]/40">{hint}</p>
    </div>
  )
}

export default function NeoCrmCustomersClient() {
  const searchParams = useSearchParams()
  const deepLinkedAccountId = searchParams.get("account")?.trim() ?? ""
  const [data, setData] = useState<NeoCrmCustomerList | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [query, setQuery] = useState("")
  const [ownerFilter, setOwnerFilter] = useState<string>("all")
  const [sortKey, setSortKey] = useState<SortKey>("balance")
  const [expiringOnly, setExpiringOnly] = useState(false)
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE)
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null)
  const [dismissedDeepLinkedAccountId, setDismissedDeepLinkedAccountId] = useState<string | null>(null)

  const load = useCallback(async (options?: { force?: boolean }) => {
    setLoading(true)
    setError(null)
    try {
      const next = await adminFetchJsonCached<NeoCrmCustomerList>(`/api/admin/crm/customers-neo`, undefined, {
        ttlMs: 60_000,
        force: options?.force,
      })
      setData(next)
      if (!next.ok && next.error) setError(next.error)
    } catch (err) {
      setError(err instanceof Error ? err.message : "고객 데이터를 불러오지 못했습니다.")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    if (
      !deepLinkedAccountId ||
      selectedAccountId === deepLinkedAccountId ||
      dismissedDeepLinkedAccountId === deepLinkedAccountId
    )
      return
    setSelectedAccountId(deepLinkedAccountId)
  }, [deepLinkedAccountId, dismissedDeepLinkedAccountId, selectedAccountId])

  const closeSelectedAccount = useCallback(() => {
    setSelectedAccountId(null)
    if (deepLinkedAccountId) setDismissedDeepLinkedAccountId(deepLinkedAccountId)
    const url = new URL(window.location.href)
    if (!url.searchParams.has("account")) return
    url.searchParams.delete("account")
    window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`)
  }, [deepLinkedAccountId])

  useEffect(() => {
    setVisibleCount(PAGE_SIZE)
  }, [query, ownerFilter, sortKey, expiringOnly])

  const filtered = useMemo(() => {
    const rows = data?.rows ?? []
    const q = query.trim().toLowerCase()
    const result = rows.filter((row) => {
      if (ownerFilter !== "all" && row.ownerId !== ownerFilter) return false
      if (expiringOnly) {
        const d = daysUntil(row.expireAt)
        if (d === null || d > 60) return false
      }
      if (!q) return true
      return (
        row.name.toLowerCase().includes(q) ||
        (row.uid ?? "").toLowerCase().includes(q) ||
        (row.phone ?? "").toLowerCase().includes(q) ||
        row.ownerName.toLowerCase().includes(q)
      )
    })
    const sorted = result.slice().sort((a, b) => {
      switch (sortKey) {
        case "balance":
          return (b.balance ?? 0) - (a.balance ?? 0)
        case "order":
          return b.orderAmount - a.orderAmount
        case "lastClass":
          return (b.lastClassAt ?? "").localeCompare(a.lastClassAt ?? "")
        case "name":
          return a.name.localeCompare(b.name, "ko-KR")
        case "expire": {
          // 만료일 빠른 순, 없는 건 뒤로.
          const av = a.expireAt ?? "9999"
          const bv = b.expireAt ?? "9999"
          return av.localeCompare(bv)
        }
        default:
          return 0
      }
    })
    return sorted
  }, [data, query, ownerFilter, sortKey, expiringOnly])

  const visibleRows = filtered.slice(0, visibleCount)
  const summary = data?.summary
  const syncHealth = data?.syncHealth

  return (
    <div>
      <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-[11px] font-medium uppercase tracking-widest text-[#1a1a1a]/30">Customer Sync · 외부 CRM</p>
          <h1 className="mt-2 text-2xl font-bold tracking-[-0.02em] text-[#111110]">고객 원천 데이터</h1>
          <p className="mt-2 max-w-2xl text-[13px] leading-relaxed text-[#1a1a1a]/45">
            외부 CRM에서 동기화된 고객 참고자료입니다. ClassIn 고객 DB의 보조 원천으로 사용합니다.
          </p>
          <p className="mt-1 text-[11px] text-[#1a1a1a]/35">
            잔액·만료 원천 sync {formatDateTime(syncHealth?.shroffAccountSyncedAt)}
            {syncHealth ? ` · ${formatAgeHours(syncHealth.shroffAccountAgeHours)}` : ""}
          </p>
        </div>
        <button
          type="button"
          onClick={() => void load({ force: true })}
          disabled={loading}
          className="inline-flex h-9 items-center gap-2 rounded-lg border border-[#e8e8e4] bg-white px-3 text-[13px] font-semibold text-[#111110] transition-colors hover:bg-[#f5f5f2] disabled:opacity-50"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          새로고침
        </button>
      </div>

      {error ? <div className="mb-6 border-l-2 border-[#F6D5C5] pl-3 text-[13px] text-[#B85C33]">{error}</div> : null}
      {syncHealth?.isShroffAccountStale ? (
        <div className="mb-6 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] leading-relaxed text-amber-800">
          잔액·만료 원천 데이터가 {formatAgeHours(syncHealth.shroffAccountAgeHours)} 데이터입니다. 만료일·잔액이 외부 CRM과
          다를 수 있으니 외부 CRM 동기화 후 확인하세요.
        </div>
      ) : null}

      <section className="mb-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <KpiTile
          icon={<Building2 className="h-4 w-4" />}
          label="동기화 고객"
          value={loading && !data ? "..." : formatNumber(summary?.totalCount)}
          hint={`EEO 연결 ${formatNumber(summary?.withEeoCount)}`}
        />
        <KpiTile
          icon={<CalendarClock className="h-4 w-4" />}
          label="만료 임박"
          value={loading && !data ? "..." : formatNumber(summary?.expiringSoonCount)}
          hint="60일 이내 만료 고객"
          tone={(summary?.expiringSoonCount ?? 0) > 0 ? "text-[#B85C33]" : "text-[#111110]"}
        />
        <KpiTile
          icon={<Wallet className="h-4 w-4" />}
          label="총 잔액"
          value={loading && !data ? "..." : formatCNY(summary?.totalBalance)}
          hint="EEO 계정 잔액 합 (CNY)"
          tone="text-[#084734]"
        />
        <KpiTile
          icon={<Wallet className="h-4 w-4" />}
          label="총 오더"
          value={loading && !data ? "..." : formatUSD(summary?.totalOrderAmount)}
          hint="외부 CRM 오더 금액 합 (USD)"
        />
      </section>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#1a1a1a]/35" />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="학원명·UID·전화·담당자"
            className="h-9 w-[220px] rounded-lg border border-[#e8e8e4] bg-white pl-8 pr-2 text-[13px] text-[#111110] outline-none transition-colors focus:border-[#111110]"
          />
        </div>
        <select
          value={ownerFilter}
          onChange={(event) => setOwnerFilter(event.target.value)}
          className="h-9 rounded-lg border border-[#e8e8e4] bg-white px-2 text-[13px] text-[#111110] outline-none transition-colors focus:border-[#111110]"
        >
          <option value="all">담당자 전체</option>
          {(data?.owners ?? []).map((owner) => (
            <option key={owner.ownerId} value={owner.ownerId}>
              {owner.ownerName} ({owner.count})
            </option>
          ))}
        </select>
        <select
          value={sortKey}
          onChange={(event) => setSortKey(event.target.value as SortKey)}
          className="h-9 rounded-lg border border-[#e8e8e4] bg-white px-2 text-[13px] text-[#111110] outline-none transition-colors focus:border-[#111110]"
        >
          {SORT_OPTIONS.map((option) => (
            <option key={option.key} value={option.key}>
              {option.label}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={() => setExpiringOnly((prev) => !prev)}
          className={`inline-flex h-9 items-center gap-1.5 rounded-lg border px-3 text-[12px] font-semibold transition-colors ${
            expiringOnly
              ? "border-amber-200 bg-amber-50 text-amber-700"
              : "border-[#e8e8e4] bg-white text-[#111110] hover:bg-[#f5f5f2]"
          }`}
        >
          <AlertTriangle className="h-3.5 w-3.5" />
          만료 임박만
        </button>
        <span className="ml-auto text-[11px] text-[#1a1a1a]/35">{formatNumber(filtered.length)}곳 표시</span>
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-[920px] w-full text-left">
          <thead className="text-[11px] uppercase tracking-[0.12em] text-[#1a1a1a]/35">
            <tr>
              <th className="py-3 pr-4 font-semibold">학원</th>
              <th className="py-3 pr-4 font-semibold">담당자</th>
              <th className="py-3 pr-4 text-right font-semibold">잔액</th>
              <th className="py-3 pr-4 font-semibold">만료</th>
              <th className="py-3 pr-4 font-semibold">최근수업</th>
              <th className="py-3 pl-4 text-right font-semibold">오더</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#f0f0ec]">
            {loading && !data ? (
              Array.from({ length: 8 }).map((_, i) => (
                <tr key={`sk-${i}`}>
                  {Array.from({ length: 6 }).map((__, j) => (
                    <td key={j} className="py-4 pr-4">
                      <div className="h-4 animate-pulse rounded bg-[#f0f0ec]" />
                    </td>
                  ))}
                </tr>
              ))
            ) : visibleRows.length === 0 ? (
              <tr>
                <td colSpan={6} className="py-16 text-center text-[13px] text-[#1a1a1a]/35">
                  <Building2 className="mx-auto mb-2 h-5 w-5 text-[#1a1a1a]/20" />
                  조건에 맞는 고객이 없습니다.
                </td>
              </tr>
            ) : (
              visibleRows.map((row: NeoCrmCustomerRow) => (
                <tr
                  key={row.accountId}
                  onClick={() => setSelectedAccountId(row.accountId)}
                  className="cursor-pointer align-top transition-colors hover:bg-[#fafaf8]"
                >
                  <td className="py-4 pr-4">
                    <p className="flex items-center gap-1 text-[13px] font-semibold text-[#111110]">
                      {row.name}
                      <ChevronRight className="h-3.5 w-3.5 shrink-0 text-[#1a1a1a]/25" />
                    </p>
                    <p className="mt-1 text-[11px] text-[#1a1a1a]/35">
                      {row.uid ? `UID ${row.uid}` : "EEO 미연결"}
                      {row.phone ? ` · ${row.phone}` : ""}
                    </p>
                  </td>
                  <td className="py-4 pr-4 text-[12px] text-[#1a1a1a]/55">{row.ownerName}</td>
                  <td className="py-4 pr-4 text-right text-[13px] font-semibold text-[#084734]">
                    {row.balance == null ? "-" : formatCNY(row.balance)}
                  </td>
                  <td className="py-4 pr-4">
                    <ExpiryBadge expireAt={row.expireAt} />
                  </td>
                  <td className="py-4 pr-4 text-[12px] text-[#1a1a1a]/45">{formatDay(row.lastClassAt)}</td>
                  <td className="py-4 pl-4 text-right">
                    <p className="text-[12px] font-semibold text-[#111110]">{formatUSD(row.orderAmount)}</p>
                    <p className="text-[11px] text-[#1a1a1a]/35">{formatNumber(row.orderCount)}건</p>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {filtered.length > visibleRows.length ? (
        <button
          type="button"
          onClick={() => setVisibleCount((prev) => prev + PAGE_SIZE)}
          className="mt-4 w-full rounded-lg border border-[#e8e8e4] bg-white py-2.5 text-[13px] font-semibold text-[#111110] transition-colors hover:bg-[#f5f5f2]"
        >
          더보기 ({formatNumber(filtered.length - visibleRows.length)})
        </button>
      ) : null}

      {selectedAccountId ? (
          <CustomerDetailPanel
            key={selectedAccountId}
            accountId={selectedAccountId}
            onClose={closeSelectedAccount}
          />
      ) : null}
    </div>
  )
}
