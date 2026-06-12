"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
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

import { adminFetchJsonCached } from "@/lib/admin-client"
import type { NeoCrmGranularity, NeoCrmTeamReport } from "@/lib/admin-crm-neo"

// 매출(SalesPerformance)·수금·잔액·목표는 위안화(CNY). 만 단위 + 소수점 2자리.
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

function formatSignedUSD(value: number) {
  const sign = value > 0 ? "+" : value < 0 ? "-" : ""
  return `${sign}${formatUSD(Math.abs(value))}`
}

function deltaTone(value: number) {
  return value > 0 ? "text-[#084734]" : value < 0 ? "text-[#B85C33]" : "text-[#1a1a1a]/40"
}

export default function NeoCrmTeamPanel({ refreshKey = 0 }: { refreshKey?: number }) {
  const [granularity, setGranularity] = useState<NeoCrmGranularity>("month")
  const [offset, setOffset] = useState(0)
  const [data, setData] = useState<NeoCrmTeamReport | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [ownerQuery, setOwnerQuery] = useState("")
  const [ownerSort, setOwnerSort] = useState<"amount" | "delta">("amount")
  const [ordersExpanded, setOrdersExpanded] = useState(false)

  const load = useCallback(
    async (options?: { force?: boolean }) => {
      setLoading(true)
      setError(null)
      try {
        const next = await adminFetchJsonCached<NeoCrmTeamReport>(
          `/api/admin/crm/neo?granularity=${granularity}&offset=${offset}`,
          undefined,
          { ttlMs: 30_000, force: options?.force }
        )
        setData(next)
        if (!next.ok && next.error) setError(next.error)
      } catch (err) {
        setError(err instanceof Error ? err.message : "Neo CRM 데이터를 불러오지 못했습니다.")
      } finally {
        setLoading(false)
      }
    },
    [granularity, offset]
  )

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

  return (
    <section className="mb-4 rounded-2xl border border-[#e8e8e4] bg-white p-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-[#1a1a1a]/30">Neo CRM · Korea Team</p>
          <h2 className="mt-1 text-[18px] font-bold text-[#111110]">한국팀 매출 · Account · Order</h2>
          <p className="mt-1 text-[12px] text-[#1a1a1a]/40">
            주/월/분기/년 · 직전 동기간 비교 · 매출 SalesPerformance · 오더 Opportunity · sync{" "}
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
          Neo CRM 스냅샷을 읽지 못했습니다: {error}. 매출·정합성 탭에서 외부 CRM 동기화와 운영 준비도를 확인하세요.
        </p>
      ) : null}

      <div className="mt-5 grid gap-3 xl:grid-cols-[1.25fr_0.75fr]">
      <div className="rounded-2xl border border-[#084734]/15 bg-[#ECFDF5] p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#084734]/70">
              한국팀 매출 달성 (SalesPerformance)
            </p>
            <div className="mt-1 flex flex-wrap items-end gap-x-3 gap-y-1">
              <span className="text-4xl font-bold tracking-[-0.045em] text-[#084734] sm:text-[44px]">
                {loading && !data ? "..." : formatCurrency(data?.target.achievement)}
              </span>
              {data?.target.amount != null ? (
                <span className="text-[15px] font-semibold text-[#084734]/55">
                  / 목표 {formatCurrency(data.target.amount)}
                </span>
              ) : (
                <span className="text-[12px] font-medium text-[#084734]/45">주간 목표는 시트에 없음 (월 단위)</span>
              )}
            </div>
            {data ? (
              <p className="mt-2 text-[12px]">
                <span className="text-[#084734]/50">직전 {data.comparison.previousLabel} 대비 </span>
                <span className={`font-semibold ${deltaTone(data.comparison.revenue.delta)}`}>
                  {formatSignedCurrency(data.comparison.revenue.delta)}
                  {data.comparison.revenue.rate != null
                    ? ` (${data.comparison.revenue.rate > 0 ? "+" : ""}${Math.round(data.comparison.revenue.rate * 100)}%)`
                    : ""}
                </span>
              </p>
            ) : null}
          </div>
          {data?.target.rate != null ? (
            <div className="text-left lg:text-right">
              <span
                className={`text-3xl font-bold tracking-[-0.04em] ${
                  data.target.rate >= 1 ? "text-[#084734]" : data.target.rate >= 0.7 ? "text-[#8D6C1F]" : "text-[#B85C33]"
                }`}
              >
                {formatPercent(data.target.rate)}
              </span>
              <p className="text-[11px] text-[#084734]/55">목표 달성률</p>
            </div>
          ) : null}
        </div>
        {data?.target.amount != null ? (
          <div className="mt-4 h-3 overflow-hidden rounded-full bg-white/70">
            <div
              className={`h-full rounded-full ${(data.target.rate ?? 0) >= 1 ? "bg-[#084734]" : "bg-[#0a6b4d]"}`}
              style={{ width: `${Math.min(100, Math.max(2, (data.target.rate ?? 0) * 100))}%` }}
            />
          </div>
        ) : null}
      </div>

      {/* 오더는 거의 확정 매출 — 매출 달성과 같은 급의 co-hero로 노출 (USD 네이티브) */}
      <div className="rounded-2xl border border-[#084734]/15 bg-white p-5">
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#084734]/70">
          오더 · 확정 임박 (Opportunity)
        </p>
        <div className="mt-1 flex flex-wrap items-end gap-x-3 gap-y-1">
          <span className="text-4xl font-bold tracking-[-0.045em] text-[#111110] sm:text-[40px]">
            {loading && !data ? "..." : formatUSD(data?.order.amount)}
          </span>
          <span className="text-[15px] font-semibold text-[#1a1a1a]/45">
            {formatNumber(data?.order.count)}건
          </span>
        </div>
        {data ? (
          <p className="mt-2 text-[12px]">
            <span className="text-[#1a1a1a]/40">직전 {data.comparison.previousLabel} 대비 </span>
            <span className={`font-semibold ${deltaTone(data.order.amount - data.comparison.order.previousAmount)}`}>
              {formatSignedUSD(data.order.amount - data.comparison.order.previousAmount)}
            </span>
          </p>
        ) : null}
        <p className="mt-3 text-[11px] leading-relaxed text-[#1a1a1a]/40">
          USD 기재 · 본사 확정 매출(CNY) 인식 전 단계 — 매출과 같은 우선순위로 관리
        </p>
      </div>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <KpiTile
          icon={<TrendingUp className="h-4 w-4" />}
          label="성과 건수"
          value={loading && !data ? "..." : `${formatNumber(data?.revenue.orderCount)}건`}
          hint={`담당 ${formatNumber(data?.revenue.contributorCount)}명 · SalesPerformance`}
          tone="text-[#084734]"
        />
        <KpiTile
          icon={<ShoppingCart className="h-4 w-4" />}
          label="오더 (확정 임박)"
          value={loading && !data ? "..." : formatUSD(data?.order.amount)}
          hint={`${formatNumber(data?.order.count)}건 · 직전 ${formatUSD(
            data?.comparison.order.previousAmount
          )}`}
          tone="text-[#084734]"
        />
        <KpiTile
          icon={<Building2 className="h-4 w-4" />}
          label="Account"
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

      <div className="mt-5 grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
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
              이 기간 한국팀 매출(SalesPerformance) 레코드가 없습니다.
            </p>
          ) : (
            <div className="space-y-2.5">
              {filteredOwners.map((row) => (
                <div key={row.ownerKey} className="grid grid-cols-[120px_minmax(0,1fr)_120px] items-center gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-[13px] font-semibold text-[#111110]">{row.owner}</p>
                    <p className="text-[11px] text-[#1a1a1a]/40">{formatNumber(row.orderCount)}건</p>
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
                  </div>
                </div>
              ))}
              <div className="mt-3 flex items-center justify-between border-t border-[#f0f0ec] pt-3">
                <span className="text-[12px] font-semibold text-[#1a1a1a]/55">팀 전체</span>
                <span className="text-[15px] font-bold text-[#084734]">{formatCurrency(data?.revenue.teamTotal)}</span>
              </div>
            </div>
          )}
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
                Order·Delivery
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
                      <p className="truncate text-[12px] font-semibold text-[#111110]">{order.customerName}</p>
                      <p className="truncate text-[11px] text-[#1a1a1a]/40">
                        {order.ownerName ?? "담당 미지정"}
                        {order.status ? ` · ${order.status}` : ""}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-[12px] font-semibold text-[#111110]">
                        {order.amount == null ? "-" : formatUSD(order.amount)}
                      </p>
                      <p className="text-[10px] text-[#1a1a1a]/35">{formatDate(order.occurredAt)}</p>
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
