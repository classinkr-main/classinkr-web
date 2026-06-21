"use client"

import { useState } from "react"
import { Trophy } from "lucide-react"

const KRW_CURRENCY = new Intl.NumberFormat("ko-KR", {
  style: "currency",
  currency: "KRW",
  maximumFractionDigits: 0,
})
const KRW = new Intl.NumberFormat("ko-KR")

const won = (n: number | null | undefined) => (n == null ? "—" : KRW_CURRENCY.format(Math.round(n)))
const count = (n: number | null | undefined) => (n == null ? "—" : KRW.format(Math.round(n)))
const pct = (n: number | null | undefined) => (n == null ? "—" : `${n}%`)

export interface PerformerRow {
  id: string
  title: string
  leads: number
  deals: number
  revenue: number
  spend: number
  roi: number | null
  cpl: number | null
}

export interface TopPerformersTableProps {
  rows: PerformerRow[]
}

type Metric = "roi" | "cpl" | "deals" | "leads" | "revenue"

const METRICS: Array<{ key: Metric; label: string }> = [
  { key: "roi", label: "ROI" },
  { key: "cpl", label: "CPL" },
  { key: "deals", label: "딜" },
  { key: "leads", label: "리드" },
  { key: "revenue", label: "매출" },
]

// cpl is "lower is better" → ascending; all others descending. nulls always last.
function sortByMetric(rows: PerformerRow[], metric: Metric): PerformerRow[] {
  const ascending = metric === "cpl"
  return [...rows].sort((a, b) => {
    const av = a[metric]
    const bv = b[metric]
    if (av == null && bv == null) return 0
    if (av == null) return 1
    if (bv == null) return -1
    return ascending ? av - bv : bv - av
  })
}

function formatMetric(row: PerformerRow, metric: Metric): string {
  switch (metric) {
    case "roi":
      return pct(row.roi)
    case "cpl":
      return won(row.cpl)
    case "revenue":
      return won(row.revenue)
    case "deals":
      return count(row.deals)
    case "leads":
      return count(row.leads)
  }
}

// One muted secondary stat per row for context, chosen to complement the active metric.
function secondaryStat(row: PerformerRow, metric: Metric): string {
  switch (metric) {
    case "roi":
      return `매출 ${won(row.revenue)} · 광고비 ${won(row.spend)}`
    case "cpl":
      return `리드 ${count(row.leads)} · 광고비 ${won(row.spend)}`
    case "revenue":
      return `딜 ${count(row.deals)} · ROI ${pct(row.roi)}`
    case "deals":
      return `리드 ${count(row.leads)} · 매출 ${won(row.revenue)}`
    case "leads":
      return `딜 ${count(row.deals)} · CPL ${won(row.cpl)}`
  }
}

const RANK_STYLE: Record<number, string> = {
  0: "bg-[#FEF3C7] text-[#B8860B]",
  1: "bg-[#F1F0EE] text-[#615D59]",
  2: "bg-[#FEF3EE] text-[#B85C33]",
}

function RankBadge({ index }: { index: number }) {
  const medal = RANK_STYLE[index]
  if (medal) {
    return (
      <span
        className={`inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-lg text-[12px] font-bold tabular-nums ${medal}`}
      >
        {index + 1}
      </span>
    )
  }
  return (
    <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center text-[12px] font-semibold tabular-nums text-[#1a1a1a]/35">
      {index + 1}
    </span>
  )
}

export function TopPerformersTable({ rows }: TopPerformersTableProps) {
  const [metric, setMetric] = useState<Metric>("roi")

  const ranked = sortByMetric(rows, metric).slice(0, 8)
  const isEmpty = rows.length === 0

  return (
    <div className="rounded-2xl border border-[#e8e8e4] bg-white p-4 sm:p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="inline-flex rounded-xl bg-[#ECFDF5] p-1.5 text-[#084734]">
            <Trophy className="h-4 w-4" />
          </span>
          <h2 className="text-[14px] font-semibold text-[#111110]">성과 리더보드</h2>
        </div>
        <div className="inline-flex items-center gap-0.5 rounded-xl bg-[#F6F5F4] p-0.5">
          {METRICS.map((m) => {
            const active = m.key === metric
            return (
              <button
                key={m.key}
                type="button"
                onClick={() => setMetric(m.key)}
                aria-pressed={active}
                className={`rounded-lg px-2.5 py-1 text-[11px] font-medium transition-colors ${
                  active
                    ? "bg-white text-[#111110] shadow-sm"
                    : "text-[#1a1a1a]/45 hover:text-[#1a1a1a]/70"
                }`}
              >
                {m.label}
              </button>
            )
          })}
        </div>
      </div>

      {isEmpty ? (
        <p className="py-10 text-center text-[12px] text-[#1a1a1a]/30">표시할 데이터가 없습니다.</p>
      ) : (
        <ul className="divide-y divide-[#f0f0ec]">
          {ranked.map((row, index) => (
            <li key={row.id} className="flex items-center gap-3 py-2.5">
              <RankBadge index={index} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[12px] font-medium text-[#111110]">{row.title}</p>
                <p className="truncate text-[11px] text-[#1a1a1a]/40">{secondaryStat(row, metric)}</p>
              </div>
              <p className="shrink-0 text-right text-[14px] font-bold tabular-nums tracking-[-0.01em] text-[#111110]">
                {formatMetric(row, metric)}
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
