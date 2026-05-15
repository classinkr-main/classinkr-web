"use client"
import { useEffect, useState } from "react"
import type { Period } from "../types"

async function adminFetch(url: string) {
  const token = (typeof window !== "undefined" ? sessionStorage.getItem("admin_password") : null) ?? ""
  return fetch(url, { headers: { Authorization: `Bearer ${token}` } })
}
function cny(n: number) {
  if (!Number.isFinite(n)) return "-"
  if (n >= 100_000_000) return `${(n / 100_000_000).toFixed(1)}억`
  if (n >= 10_000) return `${(n / 10_000).toFixed(1)}만`
  return n.toLocaleString()
}

interface MixSlice { name: string; goal: number; actual: number; pct: number }
interface DealMix {
  by_category: MixSlice[]
  by_status_type: MixSlice[]
  by_channel: MixSlice[]
  by_segment?: MixSlice[]
}

const LABELS: Record<string, string> = {
  Software: "SW",
  Hardware: "HW",
  New: "New",
  Renew: "Renew",
  Direct: "Direct",
  Channel: "Channel",
  KA: "KA",
  SME: "SME",
}

const COLORS = {
  green: "#084734",
  olive: "#7B8B36",
  amber: "#A8741A",
  red: "#B43E3E",
  blue: "#1E5DA8",
}

function pickPair(rows: MixSlice[], aKey: string, bKey: string): { a: MixSlice; b: MixSlice } | null {
  const a = rows.find((r) => r.name === aKey)
  const b = rows.find((r) => r.name === bKey)
  if (!a || !b) return null
  return { a, b }
}

function CompareCard({ title, desc, a, b, aTone, bTone }: {
  title: string; desc: string; a: MixSlice; b: MixSlice; aTone: string; bTone: string
}) {
  const sum = a.actual + b.actual
  const aPct = sum ? (a.actual / sum) * 100 : 0
  const bPct = 100 - aPct

  // Goal mix marker — where A's share would be if both sides hit goal exactly
  const goalSum = a.goal + b.goal
  const aGoalPct = goalSum ? (a.goal / goalSum) * 100 : 0
  const mixShift = aPct - aGoalPct // %p vs goal mix

  return (
    <div className="rounded-[10px] border border-[rgba(0,0,0,0.08)] bg-[#F6F5F4] p-[14px]">
      <div className="mb-2 flex items-start justify-between">
        <div>
          <p className="text-[12.5px] font-bold tracking-[-0.005em] text-[#111110]">{title}</p>
          <p className="mt-0.5 text-[10.5px] text-[#615D59]">{desc}</p>
        </div>
        <p className="whitespace-nowrap text-[10px] font-bold tracking-[0.04em] text-[#615D59]">
          믹스 {mixShift >= 0 ? "+" : ""}{mixShift.toFixed(1)}%p
        </p>
      </div>

      {/* Stacked compare bar with goal-mix marker */}
      <div className="relative mb-1.5 flex h-[22px] overflow-hidden rounded-md bg-[rgba(0,0,0,0.04)]">
        <div className="flex items-center justify-end pr-1.5 text-[10px] font-bold text-white transition-[width] duration-700"
          style={{ width: `${aPct}%`, background: aTone }}>
          {aPct >= 18 && `${aPct.toFixed(0)}%`}
        </div>
        <div className="flex items-center justify-start pl-1.5 text-[10px] font-bold text-white transition-[width] duration-700"
          style={{ width: `${bPct}%`, background: bTone }}>
          {bPct >= 18 && `${bPct.toFixed(0)}%`}
        </div>
        {/* Goal mix marker — dashed vertical line at goal split */}
        <div title={`목표 믹스 ${aGoalPct.toFixed(0)}% / ${(100 - aGoalPct).toFixed(0)}%`}
          className="pointer-events-none absolute -top-1 -bottom-1 w-px"
          style={{
            left: `${aGoalPct}%`,
            backgroundImage: "linear-gradient(to bottom, rgba(0,0,0,0.5) 50%, transparent 50%)",
            backgroundSize: "1px 3px",
            backgroundRepeat: "repeat-y",
          }} />
      </div>

      {[{ side: a, tone: aTone }, { side: b, tone: bTone }].map((row, idx) => (
        <div key={row.side.name}
          className={`grid grid-cols-[1fr_auto] items-center gap-2.5 py-1.5 ${idx === 0 ? "border-t border-[rgba(0,0,0,0.05)]" : ""}`}>
          <div className="flex min-w-0 items-center gap-2">
            <span className="block h-2 w-2 shrink-0 rounded-sm" style={{ background: row.tone }} />
            <span className="truncate text-[11.5px] font-semibold text-[#111110]">{LABELS[row.side.name] ?? row.side.name}</span>
          </div>
          <div className="text-right">
            <p className="text-[13px] font-bold leading-none tracking-[-0.01em]" style={{ color: COLORS.red }}>
              ¥{cny(row.side.actual)}
            </p>
            <p className="mt-0.5 text-[9.5px] text-[#615D59]">목표 ¥{cny(row.side.goal)}</p>
          </div>
        </div>
      ))}
    </div>
  )
}

export default function DealMixSection({ period, selectedMonth, refreshKey }: { period: Period; selectedMonth: string; refreshKey: number }) {
  const requestKey = `${refreshKey}:${period}:${selectedMonth}`
  const [state, setState] = useState<{ key: string; data: DealMix | null; loaded: boolean }>({ key: requestKey, data: null, loaded: false })
  const data = state.key === requestKey ? state.data : null
  const loading = state.key !== requestKey || !state.loaded
  useEffect(() => {
    let cancelled = false
    const monthQuery = period === "M" ? `&month=${encodeURIComponent(selectedMonth)}` : ""
    void adminFetch(`/api/admin/branch/summary?team=ALL&period=${period}${monthQuery}`)
      .then((r) => r.json())
      .then((d) => {
        if (cancelled) return
        setState({ key: requestKey, data: (d.deal_mix as DealMix) ?? null, loaded: true })
      })
      .catch(() => { if (!cancelled) setState({ key: requestKey, data: null, loaded: true }) })
    return () => { cancelled = true }
  }, [requestKey, period, selectedMonth])

  if (loading) return <div className="h-40 animate-pulse rounded-xl bg-[#f0f0ec]" />
  if (!data) return null

  const hwSw = pickPair(data.by_category, "Hardware", "Software")
  const newRenew = pickPair(data.by_status_type, "New", "Renew")
  const channel = pickPair(data.by_channel, "Direct", "Channel")
  const kaSme = data.by_segment ? pickPair(data.by_segment, "KA", "SME") : null

  const slices = [hwSw, newRenew, channel].filter(Boolean) as Array<{ a: MixSlice; b: MixSlice }>
  if (slices.length === 0) return null

  const totalActual = slices.reduce((s, p) => s + p.a.actual + p.b.actual, 0) / slices.length
  const totalGoal = slices.reduce((s, p) => s + p.a.goal + p.b.goal, 0) / slices.length
  const gap = Math.max(0, totalGoal - totalActual)

  const cardCount = slices.length + (kaSme ? 1 : 0)

  return (
    <section className="rounded-xl border border-[rgba(0,0,0,0.08)] bg-white shadow-[0_1px_2px_rgba(0,0,0,0.02)]">
      <div className="flex items-center justify-between gap-3 border-b border-[rgba(0,0,0,0.08)] px-5 py-3.5">
        <div>
          <h2 className="text-[14px] font-bold tracking-[-0.01em] text-[#111110]">매출 분해 · 전체팀</h2>
          <p className="mt-0.5 text-[11px] font-medium text-[#615D59]">제품 · 신규/갱신 · 채널 · 고객규모 — <span className="font-semibold text-[#B43E3E]">빨강 = 확정 매출</span></p>
        </div>
        <div className="text-right">
          <p className="text-[18px] font-bold leading-none tracking-[-0.01em] text-[#111110]">¥{cny(totalActual)}</p>
          <p className="mt-1 text-[10.5px] text-[#615D59]">확정 평균 · 잔량 ¥{cny(gap)}</p>
        </div>
      </div>
      <div className={`grid gap-[18px] p-5 md:grid-cols-2 ${cardCount >= 4 ? "xl:grid-cols-4" : "lg:grid-cols-3"}`}>
        {hwSw && <CompareCard title="HW / SW" desc="제품 라인 구분" a={hwSw.a} b={hwSw.b} aTone={COLORS.green} bTone={COLORS.olive} />}
        {newRenew && <CompareCard title="New / Renew" desc="신규 계약 vs 갱신" a={newRenew.a} b={newRenew.b} aTone={COLORS.green} bTone={COLORS.olive} />}
        {channel && <CompareCard title="Direct / Channel" desc="직판 vs 파트너 경유" a={channel.a} b={channel.b} aTone={COLORS.green} bTone={COLORS.amber} />}
        {kaSme && <CompareCard title="KA / SME" desc="고객 규모별 매출" a={kaSme.a} b={kaSme.b} aTone={COLORS.blue} bTone={COLORS.olive} />}
      </div>
    </section>
  )
}
