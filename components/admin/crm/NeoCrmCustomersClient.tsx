"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import {
  AlertTriangle,
  Building2,
  CalendarClock,
  Loader2,
  RefreshCw,
  Search,
  Wallet,
} from "lucide-react"

import { adminFetchJsonCached } from "@/lib/admin-client"
import type { NeoCrmCustomerList, NeoCrmCustomerRow } from "@/lib/admin-crm-customers-neo"

type SortKey = "balance" | "expire" | "order" | "lastClass" | "name"

const SORT_OPTIONS: Array<{ key: SortKey; label: string }> = [
  { key: "balance", label: "잔액순" },
  { key: "expire", label: "만료임박" },
  { key: "order", label: "오더순" },
  { key: "lastClass", label: "최근수업" },
  { key: "name", label: "이름순" },
]

const PAGE_SIZE = 50

function formatCNY(value: number | null | undefined) {
  const num = Number(value ?? 0)
  if (Math.abs(num) >= 10_000) {
    return `¥${(num / 10_000).toLocaleString("ko-KR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}만`
  }
  return `¥${num.toLocaleString("ko-KR")}`
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

function daysUntil(value: string | null | undefined) {
  if (!value) return null
  const ms = new Date(value).getTime()
  if (Number.isNaN(ms)) return null
  return Math.round((ms - Date.now()) / (24 * 60 * 60 * 1000))
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
  const [data, setData] = useState<NeoCrmCustomerList | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [query, setQuery] = useState("")
  const [ownerFilter, setOwnerFilter] = useState<string>("all")
  const [sortKey, setSortKey] = useState<SortKey>("balance")
  const [expiringOnly, setExpiringOnly] = useState(false)
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE)

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

  return (
    <div>
      <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-[11px] font-medium uppercase tracking-widest text-[#1a1a1a]/30">Neo CRM · Customers</p>
          <h1 className="mt-2 text-2xl font-bold tracking-[-0.02em] text-[#111110]">고객 (학원)</h1>
          <p className="mt-2 max-w-2xl text-[13px] leading-relaxed text-[#1a1a1a]/45">
            본사 Neo CRM account 기준 한국팀 고객. EEO 계정의 잔액·만료·최근 수업과 오더를 함께 봅니다.
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

      <section className="mb-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <KpiTile
          icon={<Building2 className="h-4 w-4" />}
          label="고객 (account)"
          value={loading && !data ? "..." : formatNumber(summary?.totalCount)}
          hint={`EEO 연결 ${formatNumber(summary?.withEeoCount)}`}
        />
        <KpiTile
          icon={<CalendarClock className="h-4 w-4" />}
          label="만료 임박"
          value={loading && !data ? "..." : formatNumber(summary?.expiringSoonCount)}
          hint="60일 이내 만료 EEO 계정"
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
          value={loading && !data ? "..." : formatCNY(summary?.totalOrderAmount)}
          hint="Opportunity 금액 합 (CNY)"
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
              <tr>
                <td colSpan={6} className="py-16 text-center text-[13px] text-[#1a1a1a]/35">
                  <Loader2 className="mr-2 inline h-4 w-4 animate-spin" />
                  고객을 불러오는 중입니다.
                </td>
              </tr>
            ) : visibleRows.length === 0 ? (
              <tr>
                <td colSpan={6} className="py-16 text-center text-[13px] text-[#1a1a1a]/35">
                  조건에 맞는 고객이 없습니다.
                </td>
              </tr>
            ) : (
              visibleRows.map((row: NeoCrmCustomerRow) => (
                <tr key={row.accountId} className="align-top">
                  <td className="py-4 pr-4">
                    <p className="text-[13px] font-semibold text-[#111110]">{row.name}</p>
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
                    <p className="text-[12px] font-semibold text-[#111110]">{formatCNY(row.orderAmount)}</p>
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
    </div>
  )
}
