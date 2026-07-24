"use client"

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react"
import Link from "next/link"
import {
  Building2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  CircleDollarSign,
  ExternalLink,
  Loader2,
  ShoppingCart,
  TrendingUp,
  Users,
  Wallet,
} from "lucide-react"

import { adminFetchJsonCached, getCachedAdminJson } from "@/lib/admin-client"
import type { NeoCrmGranularity, NeoCrmTeamReport } from "@/lib/admin-crm-neo"

const NEO_CRM_CACHE_TTL_MS = 120_000
const NEO_CRM_STALE_WHILE_REVALIDATE_MS = 10 * 60_000

function getNeoCrmUrl(granularity: NeoCrmGranularity, offset: number) {
  return `/api/admin/crm/neo?granularity=${granularity}&offset=${offset}`
}

// 매출(SalesPerformance)·수금·잔액은 위안화(CNY). 만 단위 + 소수점 2자리.
function formatCurrency(value: number | null | undefined) {
  const num = Number(value ?? 0)
  if (Math.abs(num) >= 10_000) {
    return `¥${(num / 10_000).toLocaleString("ko-KR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}만`
  }
  return `¥${num.toLocaleString("ko-KR")}`
}

// 오더(Opportunity)는 달러($)로 기재된다 — 본사가 USD 주문을 위안화 매출로 인식.
function formatUSD(value: number | null | undefined) {
  return `$${Number(value ?? 0).toLocaleString("en-US", { maximumFractionDigits: 2 })}`
}

// USD → CNY 변환 표시 (위안 주 표기). rate = usdCnyRate (e.g. 7.3)
function formatCNYFromUSD(usdAmount: number | null | undefined, rate: number | undefined) {
  return formatCurrency(Number(usdAmount ?? 0) * (rate ?? 7.3))
}

function formatSignedCNYFromUSD(usdDelta: number, rate: number | undefined) {
  return formatSignedCurrency(usdDelta * (rate ?? 7.3))
}

function formatNumber(value: number | null | undefined) {
  return new Intl.NumberFormat("ko-KR").format(Number(value ?? 0))
}

function formatDate(value: string | null | undefined) {
  if (!value) return "-"
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat("ko-KR", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).format(
    date
  )
}

function formatPercent(value: number) {
  return `${Math.round(value * 100)}%`
}

function KpiTile({
  icon,
  label,
  value,
  hint,
  tone = "text-[#111110]",
}: {
  icon: React.ReactNode
  label: string
  value: string
  hint: string
  tone?: string
}) {
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

const GRANULARITY_OPTIONS: Array<{ key: NeoCrmGranularity; label: string }> = [
  { key: "week", label: "주" },
  { key: "month", label: "월" },
  { key: "quarter", label: "분기" },
  { key: "year", label: "년" },
]

function formatSignedCurrency(value: number) {
  const sign = value > 0 ? "+" : value < 0 ? "-" : ""
  return `${sign}${formatCurrency(Math.abs(value))}`
}

function deltaTone(value: number) {
  return value > 0 ? "text-[#084734]" : value < 0 ? "text-[#B85C33]" : "text-[#1a1a1a]/40"
}

export default function NeoCrmTeamPanel({
  refreshKey = 0,
  topKpiSlot,
}: {
  refreshKey?: number
  topKpiSlot?: ReactNode
}) {
  const [granularity, setGranularity] = useState<NeoCrmGranularity>("month")
  const [offset, setOffset] = useState(0)
  const [data, setData] = useState<NeoCrmTeamReport | null>(null)
  const dataRef = useRef<NeoCrmTeamReport | null>(data)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [ownerQuery, setOwnerQuery] = useState("")
  const [ownerSort, setOwnerSort] = useState<"amount" | "delta">("amount")
  const [ordersExpanded, setOrdersExpanded] = useState(false)

  const load = useCallback(
    async (options?: { force?: boolean }) => {
      const baseUrl = getNeoCrmUrl(granularity, offset)
      const requestUrl = options?.force ? `${baseUrl}&force=1` : baseUrl
      const cachedReport = getCachedAdminJson<NeoCrmTeamReport>(baseUrl, {
        cacheKey: baseUrl,
      })
      if (cachedReport && !options?.force) {
        setData(cachedReport)
        dataRef.current = cachedReport
      }
      const showingRequestedPeriod =
        dataRef.current?.granularity === granularity && dataRef.current?.offset === offset
      if (!cachedReport && !showingRequestedPeriod) {
        setData(null)
        dataRef.current = null
      }
      setLoading(Boolean(options?.force || (!cachedReport && !showingRequestedPeriod)))
      setError(null)
      try {
        const next = await adminFetchJsonCached<NeoCrmTeamReport>(
          requestUrl,
          undefined,
          {
            cacheKey: baseUrl,
            ttlMs: NEO_CRM_CACHE_TTL_MS,
            force: options?.force,
            staleWhileRevalidateMs: NEO_CRM_STALE_WHILE_REVALIDATE_MS,
          }
        )
        setData(next)
        dataRef.current = next
        if (!next.ok && next.error) setError(next.error)
      } catch (err) {
        setError(err instanceof Error ? err.message : "외부 CRM 동기화 데이터를 불러오지 못했습니다.")
      } finally {
        setLoading(false)
      }
    },
    [granularity, offset]
  )

  useEffect(() => {
    dataRef.current = data
  }, [data])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    if (refreshKey <= 0) return
    void load({ force: true })
  }, [load, refreshKey])

  const filteredOwners = useMemo(() => {
    const rows = (data?.revenue.byOwner ?? []).slice()
    const query = ownerQuery.trim().toLowerCase()
    const filtered = query ? rows.filter((row) => row.owner.toLowerCase().includes(query)) : rows
    return filtered.sort((a, b) => (ownerSort === "delta" ? b.delta - a.delta : b.amount - a.amount))
  }, [data, ownerQuery, ownerSort])

  const leadDelta = (data?.leads.periodCount ?? 0) - (data?.leads.previousCount ?? 0)
  const maxOwnerAmount = Math.max(1, ...(data?.revenue.byOwner ?? []).map((row) => row.amount))

  // 담당자별 오더(USD)·수금(CNY)을 ownerKey로 빠르게 찾기 위한 룩업.
  const orderByOwner = useMemo(() => {
    const map = new Map<string, { amount: number; count: number }>()
    for (const row of data?.order.byOwner ?? []) map.set(row.ownerKey, { amount: row.amount, count: row.count })
    return map
  }, [data])
  const collectionByOwner = useMemo(() => {
    const map = new Map<string, { amount: number; count: number }>()
    for (const row of data?.collection.byOwner ?? []) map.set(row.ownerKey, { amount: row.amount, count: row.count })
    return map
  }, [data])

  return (
    <section className="mb-4 rounded-2xl border border-[#e8e8e4] bg-white p-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-[#1a1a1a]/30">External CRM Sync · Korea Team</p>
          <h2 className="mt-1 text-[18px] font-bold text-[#111110]">고객 매출 · 오더 흐름</h2>
          <p className="mt-1 text-[12px] text-[#1a1a1a]/40">
            주/월/분기/년 · 직전 동기간 비교 · 본사 CRM 동기화 매출·오더 · sync{" "}
            {formatDate(data?.latestSyncedAt)}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex rounded-lg border border-[#e8e8e4] p-0.5">
            {GRANULARITY_OPTIONS.map((option) => (
              <button
                key={option.key}
                type="button"
                onClick={() => {
                  setGranularity(option.key)
                  setOffset(0)
                }}
                className={`h-8 rounded-md px-3 text-[12px] font-semibold transition-colors ${
                  granularity === option.key ? "bg-[#111110] text-white" : "text-[#111110] hover:bg-[#f5f5f2]"
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>

          <div className="inline-flex items-center gap-1">
            <button
              type="button"
              onClick={() => setOffset((current) => current - 1)}
              className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-[#e8e8e4] text-[#111110] transition-colors hover:bg-[#f5f5f2]"
              aria-label="이전 기간"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="min-w-[120px] text-center text-[13px] font-semibold text-[#111110]">
              {data?.period.label ?? "..."}
            </span>
            <button
              type="button"
              onClick={() => setOffset((current) => Math.min(0, current + 1))}
              disabled={offset >= 0}
              className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-[#e8e8e4] text-[#111110] transition-colors hover:bg-[#f5f5f2] disabled:opacity-40"
              aria-label="다음 기간"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      {error ? (
        <p className="mt-4 rounded-xl bg-[#FEF3EE] px-3 py-2 text-[12px] leading-relaxed text-[#B85C33]">
          외부 CRM 동기화 데이터를 읽지 못했습니다: {error}. 매출·연동 탭에서 동기화 상태를 확인하세요.
        </p>
      ) : null}

      <div className="mt-5 grid gap-3 xl:grid-cols-[1.25fr_0.75fr]">
      <div className="rounded-2xl border border-[#084734]/15 bg-[#ECFDF5] p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#084734]/70">
              한국팀 매출 실적
            </p>
            <div className="mt-1 flex flex-wrap items-end gap-x-3 gap-y-1">
              <span className="text-4xl font-bold tracking-[-0.045em] text-[#084734] sm:text-[44px]">
                {loading && !data ? "..." : formatCurrency(data?.revenue.teamTotal)}
              </span>
              <span className="text-[15px] font-semibold text-[#084734]/55">
                {loading && !data ? "" : `${formatNumber(data?.revenue.orderCount)}건`}
              </span>
            </div>
            {data ? (
              <p className="mt-2 text-[12px]">
                <span className="text-[#084734]/50">
                  직전 {data.comparison.previousLabel}
                  {data.comparison.paceAdjusted ? " 같은 일수" : ""} 대비{" "}
                </span>
                <span className={`font-semibold ${deltaTone(data.comparison.revenue.delta)}`}>
                  {formatSignedCurrency(data.comparison.revenue.delta)}
                  {data.comparison.revenue.rate != null
                    ? ` (${data.comparison.revenue.rate > 0 ? "+" : ""}${Math.round(data.comparison.revenue.rate * 100)}%)`
                    : ""}
                </span>
              </p>
            ) : null}
          </div>
          <div className="text-left lg:text-right">
            <span className="text-3xl font-bold tracking-[-0.04em] text-[#084734]">
              {loading && !data ? "..." : formatNumber(data?.revenue.contributorCount)}
            </span>
            <p className="text-[11px] text-[#084734]/55">담당자</p>
          </div>
        </div>
      </div>

      {/* 오더는 거의 확정 매출 — 매출 달성과 같은 급의 co-hero로 노출 (CNY 환산 주 표기) */}
      <div className="rounded-2xl border border-[#084734]/15 bg-white p-5">
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#084734]/70">
          오더 · 확정 임박
        </p>
        <div className="mt-1 flex flex-wrap items-end gap-x-3 gap-y-1">
          <span className="text-4xl font-bold tracking-[-0.045em] text-[#111110] sm:text-[40px]">
            {loading && !data ? "..." : formatCNYFromUSD(data?.order.amount, data?.usdCnyRate)}
          </span>
          <span className="text-[15px] font-semibold text-[#1a1a1a]/45">
            {formatNumber(data?.order.count)}건
          </span>
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5">
          {data ? (
            <p className="text-[12px]">
              <span className="text-[#1a1a1a]/40">직전 {data.comparison.previousLabel} 대비 </span>
              <span className={`font-semibold ${deltaTone(data.order.amount - data.comparison.order.previousAmount)}`}>
                {formatSignedCNYFromUSD(data.order.amount - data.comparison.order.previousAmount, data.usdCnyRate)}
              </span>
            </p>
          ) : null}
          {data ? (
            <span className="text-[11px] text-[#1a1a1a]/35">
              {formatUSD(data.order.amount)}
            </span>
          ) : null}
        </div>
        <p className="mt-3 text-[11px] leading-relaxed text-[#1a1a1a]/40">
          USD 기재 → CNY 환산 표시 · 본사 확정 매출 인식 전 단계 — 매출과 같은 우선순위로 관리
        </p>
      </div>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <KpiTile
          icon={<TrendingUp className="h-4 w-4" />}
          label="성과 건수"
          value={loading && !data ? "..." : `${formatNumber(data?.revenue.orderCount)}건`}
          hint={`담당 ${formatNumber(data?.revenue.contributorCount)}명 · 외부 CRM 원천`}
          tone="text-[#084734]"
        />
        <KpiTile
          icon={<ShoppingCart className="h-4 w-4" />}
          label="오더 (확정 임박)"
          value={loading && !data ? "..." : formatCNYFromUSD(data?.order.amount, data?.usdCnyRate)}
          hint={`${formatNumber(data?.order.count)}건 · ${formatUSD(data?.order.amount)} · 직전 ${formatCNYFromUSD(data?.comparison.order.previousAmount, data?.usdCnyRate)}`}
          tone="text-[#084734]"
        />
        <KpiTile
          icon={<Building2 className="h-4 w-4" />}
          label="동기화 고객"
          value={loading && !data ? "..." : formatNumber(data?.account.totalCount)}
          hint={`기간 활동 ${formatNumber(data?.account.activeInPeriodCount)} · 직전 ${formatNumber(
            data?.comparison.account.previousActiveCount
          )}`}
        />
        <KpiTile
          icon={<Wallet className="h-4 w-4" />}
          label="수금 (후순위)"
          value={loading && !data ? "..." : formatCurrency(data?.collection.amount)}
          hint={`${formatNumber(data?.collection.count)}건 · 직전 ${formatCurrency(
            data?.comparison.collection.previousAmount
          )}`}
          tone="text-[#1a1a1a]/55"
        />
      </div>

      {topKpiSlot}

      <div className="mt-5 grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
        <div className="flex flex-col gap-4">
        <div className="rounded-xl border border-[#f0f0ec] p-4">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <CircleDollarSign className="h-4 w-4 text-[#084734]" />
              <h3 className="text-[14px] font-semibold text-[#111110]">담당자별 매출 (개인)</h3>
            </div>
            <div className="flex items-center gap-2">
              <div className="inline-flex rounded-lg border border-[#e8e8e4] p-0.5">
                {(["amount", "delta"] as const).map((key) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setOwnerSort(key)}
                    className={`h-7 rounded-md px-2 text-[11px] font-semibold transition-colors ${
                      ownerSort === key ? "bg-[#111110] text-white" : "text-[#111110] hover:bg-[#f5f5f2]"
                    }`}
                  >
                    {key === "amount" ? "매출순" : "증감순"}
                  </button>
                ))}
              </div>
              <input
                type="search"
                value={ownerQuery}
                onChange={(event) => setOwnerQuery(event.target.value)}
                placeholder="담당자"
                className="h-8 w-[110px] rounded-lg border border-[#e8e8e4] bg-white px-2 text-[12px] text-[#111110] outline-none transition-colors focus:border-[#111110]"
              />
            </div>
          </div>

          {loading && !data ? (
            <p className="py-10 text-center text-[13px] text-[#1a1a1a]/35">
              <Loader2 className="mr-2 inline h-4 w-4 animate-spin" />
              집계 중입니다.
            </p>
          ) : filteredOwners.length === 0 ? (
            <p className="py-10 text-center text-[13px] text-[#1a1a1a]/35">
              이 기간 한국팀 매출 레코드가 없습니다.
            </p>
          ) : (
            <div className="space-y-2.5">
              {filteredOwners.map((row) => {
                const ownerOrder = orderByOwner.get(row.ownerKey)
                const ownerCollection = collectionByOwner.get(row.ownerKey)
                return (
                <div key={row.ownerKey} className="grid grid-cols-[120px_minmax(0,1fr)_120px] items-center gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-[13px] font-semibold text-[#111110]">{row.owner}</p>
                    <p className="text-[11px] text-[#1a1a1a]/40">
                      성과 {formatNumber(row.orderCount)}건
                      {ownerOrder ? ` · 오더 ${formatNumber(ownerOrder.count)}` : ""}
                    </p>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-[#f0f0ec]">
                    <div
                      className="h-full rounded-full bg-[#084734]"
                      style={{ width: `${Math.max(2, (row.amount / maxOwnerAmount) * 100)}%` }}
                    />
                  </div>
                  <div className="text-right">
                    <p className="text-[13px] font-bold text-[#111110]">{formatCurrency(row.amount)}</p>
                    <p className="text-[11px] text-[#1a1a1a]/40">
                      {formatPercent(row.share)} ·{" "}
                      <span className={deltaTone(row.delta)}>{formatSignedCurrency(row.delta)}</span>
                    </p>
                    {ownerOrder || ownerCollection ? (
                      <p className="mt-0.5 text-[10px] text-[#1a1a1a]/35">
                        {ownerOrder ? `오더 ${formatCNYFromUSD(ownerOrder.amount, data?.usdCnyRate)}` : ""}
                        {ownerOrder && ownerCollection ? " · " : ""}
                        {ownerCollection ? `수금 ${formatCurrency(ownerCollection.amount)}` : ""}
                      </p>
                    ) : null}
                  </div>
                </div>
                )
              })}
              <div className="mt-3 flex items-center justify-between border-t border-[#f0f0ec] pt-3">
                <span className="text-[12px] font-semibold text-[#1a1a1a]/55">팀 전체</span>
                <span className="text-[15px] font-bold text-[#084734]">{formatCurrency(data?.revenue.teamTotal)}</span>
              </div>
            </div>
          )}
        </div>
        </div>

        <div className="flex flex-col gap-4">
          <div className="rounded-xl border border-[#f0f0ec] p-4">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <ShoppingCart className="h-4 w-4 text-[#1a1a1a]/45" />
                <h3 className="text-[14px] font-semibold text-[#111110]">최근 오더</h3>
              </div>
              <Link
                href="/admin/crm/deals/orders"
                className="inline-flex items-center gap-1 text-[12px] font-semibold text-[#1a1a1a]/45 transition-colors hover:text-[#111110]"
              >
                오더 상세
                <ExternalLink className="h-3 w-3" />
              </Link>
            </div>
            {(data?.order.recent.length ?? 0) === 0 ? (
              <p className="py-6 text-center text-[12px] text-[#1a1a1a]/30">이 기간 오더가 없습니다.</p>
            ) : (
              <div className="divide-y divide-[#f0f0ec]">
                {(ordersExpanded ? data?.order.recent ?? [] : (data?.order.recent ?? []).slice(0, 5)).map((order) => (
                  <div key={order.key} className="grid grid-cols-[minmax(0,1fr)_92px] gap-2 py-2">
                    <div className="min-w-0">
                      {/* 거래 행 → 계정 상세 딥링크(?account= — 고객 화면 빠른 보기, 오더 탭에 이 거래가
                          있다). 오더 자체 상세 라우트는 없어 계정 착지가 정확한 최소 경로.
                          accountId 없는(또는 캐시 스큐) 행은 기존 텍스트 그대로. */}
                      {order.accountId ? (
                        <Link
                          href={`/admin/crm/customers/accounts?account=${encodeURIComponent(order.accountId)}`}
                          title="고객 상세(오더 내역) 열기"
                          className="block truncate text-[12px] font-semibold text-[#111110] underline-offset-2 hover:text-[#084734] hover:underline"
                        >
                          {order.customerName}
                        </Link>
                      ) : (
                        <p className="truncate text-[12px] font-semibold text-[#111110]">{order.customerName}</p>
                      )}
                      <p className="truncate text-[11px] text-[#1a1a1a]/40">
                        {order.ownerName ?? "담당 미지정"}
                        {order.status ? ` · ${order.status}` : ""}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-[12px] font-semibold text-[#111110]">
                        {order.amount == null ? "-" : formatCNYFromUSD(order.amount, data?.usdCnyRate)}
                      </p>
                      <p className="text-[10px] text-[#1a1a1a]/35">
                        {order.amount != null ? formatUSD(order.amount) + " · " : ""}{formatDate(order.occurredAt)}
                      </p>
                    </div>
                  </div>
                ))}
                {(data?.order.recent.length ?? 0) > 5 ? (
                  <button
                    type="button"
                    onClick={() => setOrdersExpanded((prev) => !prev)}
                    className="flex w-full items-center justify-center gap-1 pt-2 text-[12px] font-semibold text-[#1a1a1a]/45 transition-colors hover:text-[#111110]"
                  >
                    {ordersExpanded
                      ? "접기"
                      : `더보기 (${formatNumber((data?.order.recent.length ?? 0) - 5)})`}
                    {ordersExpanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                  </button>
                ) : null}
              </div>
            )}
          </div>

          <div className="rounded-xl border border-[#f0f0ec] p-4">
            <div className="mb-2 flex items-center gap-2">
              <Users className="h-4 w-4 text-[#1a1a1a]/45" />
              <h3 className="text-[14px] font-semibold text-[#111110]">리드 흐름</h3>
            </div>
            <div className="flex items-end justify-between gap-3">
              <div>
                <p className="text-2xl font-bold text-[#111110]">{formatNumber(data?.leads.periodCount)}</p>
                <p className="text-[11px] text-[#1a1a1a]/40">이 기간 신규 리드</p>
              </div>
              <div className="text-right">
                <p
                  className={`text-[13px] font-semibold ${
                    leadDelta > 0 ? "text-[#084734]" : leadDelta < 0 ? "text-[#B85C33]" : "text-[#1a1a1a]/45"
                  }`}
                >
                  {leadDelta > 0 ? `+${formatNumber(leadDelta)}` : formatNumber(leadDelta)}
                </p>
                <p className="text-[11px] text-[#1a1a1a]/40">직전 대비 · 누적 {formatNumber(data?.leads.totalCount)}</p>
              </div>
            </div>
            <Link
              href="#lead-queue"
              className="mt-3 inline-flex items-center gap-1 text-[12px] font-semibold text-[#1a1a1a]/45 transition-colors hover:text-[#111110]"
            >
              리드 응대 큐로 이동
              <ExternalLink className="h-3 w-3" />
            </Link>
          </div>
        </div>
      </div>
    </section>
  )
}
