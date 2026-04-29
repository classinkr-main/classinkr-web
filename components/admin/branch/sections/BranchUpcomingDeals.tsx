"use client"
import Link from "next/link"
import { Calendar, ExternalLink } from "lucide-react"
import type { BranchMonthlySeries } from "../types"

function cny(n: number) {
  if (!Number.isFinite(n)) return "-"
  if (n >= 100_000_000) return `${(n / 100_000_000).toFixed(1).replace(/\.0$/, "")}억`
  if (n >= 10_000) return `${Math.round(n / 10_000)}만`
  return n.toLocaleString()
}

function isFutureOrToday(dateStr: string) {
  const d = new Date(dateStr)
  if (Number.isNaN(d.getTime())) return false
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  return d.getTime() >= today.getTime()
}

interface Item {
  kind: "deal" | "event" | "campaign"
  date: string
  title: string
  amount?: number
}

export interface UpcomingDealClick {
  id: string
  customer: string
  date: string
  amount: number
}

export default function BranchUpcomingDeals({
  data, loading, onDealClick,
}: {
  data: BranchMonthlySeries | null
  loading: boolean
  onDealClick?: (d: UpcomingDealClick) => void
}) {
  if (loading || !data) return <div className="h-64 animate-pulse rounded-xl bg-[#f0f0ec]" />

  const items: Item[] = [
    ...data.deals.map((d): Item => ({ kind: "deal", date: d.date, title: d.customer, amount: d.amount })),
    ...data.events.map((e): Item => ({ kind: "event", date: e.date, title: e.title })),
    ...data.campaigns.map((c): Item => ({ kind: "campaign", date: c.date, title: c.name })),
  ]
    .filter((it) => isFutureOrToday(it.date))
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(0, 8)

  return (
    <section className="rounded-xl border border-[rgba(0,0,0,0.08)] bg-white shadow-[0_1px_2px_rgba(0,0,0,0.02)]">
      <div className="flex items-center justify-between gap-3 border-b border-[rgba(0,0,0,0.08)] px-5 py-3.5">
        <div className="flex items-center gap-2">
          <Calendar className="h-4 w-4 text-[#084734]" />
          <h2 className="text-[14px] font-bold tracking-[-0.01em] text-[#111110]">다가오는 일정</h2>
        </div>
        <Link href="/admin/calendar" className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#615D59] hover:text-[#111110]">
          캘린더 전체 보기 <ExternalLink className="h-3 w-3" />
        </Link>
      </div>
      <div className="p-4">
        {items.length === 0 ? (
          <p className="py-6 text-center text-[11.5px] text-[#615D59]">예정된 일정 없음</p>
        ) : (
          <ul className="flex flex-col gap-1">
            {items.map((it, i) => {
              const d = new Date(it.date)
              const m = d.getMonth() + 1
              const day = d.getDate()
              const tone =
                it.kind === "deal" ? { bg: "#ECFDF5", fg: "#084734", label: "딜" }
                : it.kind === "event" ? { bg: "#FBF1E0", fg: "#A8741A", label: "행사" }
                : { bg: "#E8EFF8", fg: "#1E5DA8", label: "캠페인" }
              const clickable = it.kind === "deal" && typeof it.amount === "number" && onDealClick
              const handleClick = clickable
                ? () => onDealClick({ id: `upcoming-${i}`, customer: it.title, date: it.date, amount: it.amount as number })
                : undefined
              return (
                <li key={`${it.kind}-${i}-${it.date}`}
                  onClick={handleClick}
                  className={`grid items-center gap-3 rounded-lg px-2 py-2 ${clickable ? "cursor-pointer hover:bg-[#F6F5F4]" : "hover:bg-[#FAFAF8]"}`}
                  style={{ gridTemplateColumns: "44px 1fr auto" }}>
                  <div className="rounded-md py-1 text-center" style={{ background: tone.bg, color: tone.fg }}>
                    <p className="text-[9px] font-semibold">{m}월</p>
                    <p className="text-[14px] font-bold leading-none">{day}</p>
                  </div>
                  <div className="min-w-0">
                    <span className="inline-block rounded-full px-2 py-0.5 text-[9.5px] font-bold"
                      style={{ background: tone.bg, color: tone.fg }}>{tone.label}</span>
                    <p className="mt-1 truncate text-[12.5px] font-semibold text-[#111110]">{it.title}</p>
                  </div>
                  <div className="text-right">
                    {typeof it.amount === "number" ? (
                      <p className="text-[12.5px] font-bold tracking-[-0.01em]" style={{ color: "#1E5DA8" }}>
                        ¥{cny(it.amount)}
                      </p>
                    ) : <span className="text-[10.5px] text-[#615D59]">—</span>}
                    <p className="text-[9.5px] text-[#615D59]">{typeof it.amount === "number" ? "예상" : ""}</p>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </section>
  )
}
