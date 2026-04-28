"use client"
import { useEffect, useState } from "react"
import type { Period } from "../types"

async function adminFetch(url: string) {
  const token = (typeof window !== "undefined" ? sessionStorage.getItem("admin_password") : null) ?? ""
  return fetch(url, { headers: { Authorization: `Bearer ${token}` } })
}
function krw(n: number) {
  if (!Number.isFinite(n)) return "-"
  if (n >= 100_000_000) return `${(n / 100_000_000).toFixed(1).replace(/\.0$/, "")}억`
  if (n >= 10_000) return `${Math.round(n / 10_000)}만`
  return n.toLocaleString()
}

interface MixSlice { name: string; goal: number; actual: number; pct: number }
interface DealMix {
  by_category: MixSlice[]
  by_status_type: MixSlice[]
  by_channel: MixSlice[]
}

const LABELS: Record<string, string> = {
  Software: "소프트웨어 SW",
  Hardware: "하드웨어 HW",
  New: "New · 신규",
  Renew: "Renew · 갱신",
  Direct: "Direct · 직접",
  Channel: "Channel · 파트너",
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
        {/* Goal mix marker */}
        <div title={`목표 믹스 ${aGoalPct.toFixed(0)}% / ${(100 - aGoalPct).toFixed(0)}%`}
          className="absolute -top-0.5 -bottom-0.5 w-0.5 bg-[rgba(0,0,0,0.55)]"
          style={{ left: `${aGoalPct}%` }} />
      </div>

      {/* Legend marker */}
      <p className="mb-2 flex items-center gap-1 text-[9px] text-[#615D59]">
        <span className="inline-block h-0.5 w-2 bg-[rgba(0,0,0,0.55)]" />
        목표 믹스 ({aGoalPct.toFixed(0)}% / {(100 - aGoalPct).toFixed(0)}%)
      </p>

      {[{ side: a, tone: aTone }, { side: b, tone: bTone }].map((row, idx) => {
        const deltaPct = row.side.goal ? ((row.side.actual - row.side.goal) / row.side.goal) * 100 : 0
        return (
          <div key={row.side.name}
            className={`grid grid-cols-[1fr_auto_auto] items-center gap-2.5 py-1.5 ${idx === 0 ? "border-t border-[rgba(0,0,0,0.05)]" : ""}`}>
            <div className="flex min-w-0 items-center gap-2">
              <span className="block h-2 w-2 shrink-0 rounded-sm" style={{ background: row.tone }} />
              <span className="truncate text-[11.5px] font-semibold text-[#111110]">{LABELS[row.side.name] ?? row.side.name}</span>
            </div>
            <div className="text-right">
              <p className="text-[13px] font-bold leading-none tracking-[-0.01em]" style={{ color: COLORS.red }}>
                ₩{krw(row.side.actual)}
              </p>
              <p className="mt-0.5 text-[9.5px] text-[#615D59]">목표 ₩{krw(row.side.goal)}</p>
            </div>
            <div className="min-w-[60px] text-right">
              <p className="text-[10.5px] font-bold leading-none"
                style={{ color: deltaPct >= 0 ? COLORS.green : COLORS.red }}>
                {deltaPct >= 0 ? "↑" : "↓"} {Math.abs(deltaPct).toFixed(1)}%
              </p>
              <p className="mt-0.5 text-[9.5px] text-[#615D59]">vs 목표</p>
            </div>
          </div>
        )
      })}
    </div>
  )
}

export default function DealMixSection({ period, refreshKey }: { period: Period; refreshKey: number }) {
  const requestKey = `${refreshKey}:${period}`
  const [state, setState] = useState<{ key: string; data: DealMix | null; loaded: boolean }>({ key: requestKey, data: null, loaded: false })
  const data = state.key === requestKey ? state.data : null
  const loading = state.key !== requestKey || !state.loaded
  useEffect(() => {
    let cancelled = false
    void adminFetch(`/api/admin/branch/summary?team=ALL&period=${period}`)
      .then((r) => r.json())
      .then((d) => {
        if (cancelled) return
        setState({ key: requestKey, data: (d.deal_mix as DealMix) ?? null, loaded: true })
      })
      .catch(() => { if (!cancelled) setState({ key: requestKey, data: null, loaded: true }) })
    return () => { cancelled = true }
  }, [requestKey, period])

  if (loading) return <div className="h-40 animate-pulse rounded-xl bg-[#f0f0ec]" />
  if (!data) return null

  const hwSw = pickPair(data.by_category, "Hardware", "Software")
  const newRenew = pickPair(data.by_status_type, "New", "Renew")
  const channel = pickPair(data.by_channel, "Direct", "Channel")
  const slices = [hwSw, newRenew, channel].filter(Boolean) as Array<{ a: MixSlice; b: MixSlice }>
  if (slices.length === 0) return null

  const totalActual = slices.reduce((s, p) => s + p.a.actual + p.b.actual, 0) / slices.length
  const totalGoal = slices.reduce((s, p) => s + p.a.goal + p.b.goal, 0) / slices.length
  const gap = Math.max(0, totalGoal - totalActual)

  return (
    <section className="rounded-xl border border-[rgba(0,0,0,0.08)] bg-white shadow-[0_1px_2px_rgba(0,0,0,0.02)]">
      <div className="flex items-center justify-between gap-3 border-b border-[rgba(0,0,0,0.08)] px-5 py-3.5">
        <div>
          <h2 className="text-[14px] font-bold tracking-[-0.01em] text-[#111110]">매출 분해 · 전체팀</h2>
          <p className="mt-0.5 text-[11px] font-medium text-[#615D59]">제품 · 신규/갱신 · 채널 — <span className="font-semibold text-[#B43E3E]">빨강 = 확정 매출</span> · 검정 마커 = 목표 믹스 위치</p>
        </div>
        <div className="text-right">
          <p className="text-[18px] font-bold leading-none tracking-[-0.01em] text-[#111110]">₩{krw(totalActual)}</p>
          <p className="mt-1 text-[10.5px] text-[#615D59]">확정 평균 · 잔량 ₩{krw(gap)}</p>
        </div>
      </div>
      <div className="grid gap-[18px] p-5 md:grid-cols-2 lg:grid-cols-3">
        {hwSw && <CompareCard title="하드웨어 / 소프트웨어" desc="제품 라인 구분" a={hwSw.a} b={hwSw.b} aTone={COLORS.green} bTone={COLORS.olive} />}
        {newRenew && <CompareCard title="신규 / 갱신" desc="New 계약 vs Renew 갱신" a={newRenew.a} b={newRenew.b} aTone={COLORS.green} bTone={COLORS.olive} />}
        {channel && <CompareCard title="직접 / 채널" desc="직판 vs 파트너 경유" a={channel.a} b={channel.b} aTone={COLORS.green} bTone={COLORS.amber} />}
      </div>
    </section>
  )
}
