"use client"
import { useEffect, useState } from "react"
import type { Team, Period } from "../BranchDashboardClient"

async function adminFetch(url: string) {
  const token = (typeof window !== "undefined" ? sessionStorage.getItem("admin_password") : null) ?? ""
  return fetch(url, { headers: { Authorization: `Bearer ${token}` } })
}
function fmt(n: number) { return new Intl.NumberFormat("ko-KR", { maximumFractionDigits: 0 }).format(n) }
interface TeamRow { team: string; goal: number; status: number; pacing_pct: number }

export default function TeamPacingSection({ team, period, refreshKey }: { team: Team; period: Period; refreshKey: number }) {
  const [rows, setRows] = useState<TeamRow[] | null>(null)
  useEffect(() => {
    adminFetch(`/api/admin/branch/kpi?team=${team}&period=${period}`)
      .then((r) => r.json()).then((d) => setRows(d.teams ?? [])).catch(() => setRows([]))
  }, [team, period, refreshKey])
  if (!rows) return <div className="h-32 animate-pulse rounded-2xl bg-[#f0f0ec]" />
  if (rows.length === 0) return null
  return (
    <section>
      <h2 className="mb-3 text-[13px] font-semibold text-[#111110]/70">팀 페이싱</h2>
      <div className="grid gap-3 md:grid-cols-3">
        {rows.map((t) => (
          <div key={t.team} className="rounded-2xl border border-[#e8e8e4] bg-white p-4">
            <p className="text-[12px] font-medium text-[#1a1a1a]/60">{t.team}</p>
            <p className="mt-1 text-[20px] font-bold">{t.pacing_pct.toFixed(0)}%</p>
            <p className="mt-1 text-[11px] text-[#1a1a1a]/45">실적 ₩{fmt(t.status)} / 목표 ₩{fmt(t.goal)}</p>
            <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-[#f0f0ec]">
              <div className="h-full bg-emerald-500" style={{ width: `${Math.min(100, t.pacing_pct)}%` }} />
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}
