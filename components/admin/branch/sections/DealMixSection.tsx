"use client"
import { useEffect, useState } from "react"
import type { Period } from "../types"

async function adminFetch(url: string) {
  const token = (typeof window !== "undefined" ? sessionStorage.getItem("admin_password") : null) ?? ""
  return fetch(url, { headers: { Authorization: `Bearer ${token}` } })
}
function fmt(n: number) { return new Intl.NumberFormat("ko-KR", { maximumFractionDigits: 0 }).format(n) }

interface MixSlice { name: string; goal: number; actual: number; pct: number }
interface DealMix {
  by_category: MixSlice[]
  by_status_type: MixSlice[]
  by_channel: MixSlice[]
}

const LABELS: Record<string, string> = {
  Software: "소프트웨어",
  Hardware: "하드웨어",
  New: "신규",
  Renew: "갱신",
  Direct: "직접",
  Channel: "채널",
}

function MixCard({ title, rows }: { title: string; rows: MixSlice[] }) {
  if (rows.length === 0) return null
  return (
    <div className="rounded-2xl border border-[#e8e8e4] bg-white p-4">
      <p className="mb-3 text-[12px] font-medium text-[#1a1a1a]/60">{title}</p>
      <div className="space-y-3">
        {rows.map((r) => {
          const tone = r.pct >= 95 ? "bg-emerald-500" : r.pct >= 75 ? "bg-amber-500" : "bg-rose-500"
          return (
            <div key={r.name}>
              <div className="flex items-baseline justify-between text-[12px]">
                <span className="font-medium text-[#111110]">{LABELS[r.name] ?? r.name}</span>
                <span className="text-[#1a1a1a]/55">{r.pct.toFixed(0)}%</span>
              </div>
              <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-[#f0f0ec]">
                <div className={`h-full ${tone}`} style={{ width: `${Math.min(100, r.pct)}%` }} />
              </div>
              <p className="mt-1 text-[11px] text-[#1a1a1a]/40">실적 ₩{fmt(r.actual)} / 목표 ₩{fmt(r.goal)}</p>
            </div>
          )
        })}
      </div>
    </div>
  )
}

export default function DealMixSection({ period, refreshKey }: { period: Period; refreshKey: number }) {
  const [data, setData] = useState<DealMix | null>(null)
  useEffect(() => {
    let cancelled = false
    void adminFetch(`/api/admin/branch/summary?team=ALL&period=${period}`)
      .then((r) => r.json())
      .then((d) => {
        if (cancelled) return
        setData((d.deal_mix as DealMix) ?? null)
      })
      .catch(() => { if (!cancelled) setData(null) })
    return () => { cancelled = true }
  }, [period, refreshKey])
  if (!data) return <div className="h-32 animate-pulse rounded-2xl bg-[#f0f0ec]" />
  const noData = data.by_category.length === 0 && data.by_status_type.length === 0 && data.by_channel.length === 0
  if (noData) return null
  return (
    <section>
      <div className="mb-3 flex items-end justify-between">
        <h2 className="text-[13px] font-semibold text-[#111110]/70">딜 믹스 (DSH 기준)</h2>
        <p className="text-[11px] text-[#1a1a1a]/40">목표 대비 실적</p>
      </div>
      <div className="grid gap-3 md:grid-cols-3">
        <MixCard title="제품" rows={data.by_category} />
        <MixCard title="상태" rows={data.by_status_type} />
        <MixCard title="채널" rows={data.by_channel} />
      </div>
    </section>
  )
}
