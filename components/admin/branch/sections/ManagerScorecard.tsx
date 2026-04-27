"use client"
import { useEffect, useState } from "react"
import type { Team, Period } from "../BranchDashboardClient"

async function adminFetch(url: string) {
  const token = (typeof window !== "undefined" ? sessionStorage.getItem("admin_password") : null) ?? ""
  return fetch(url, { headers: { Authorization: `Bearer ${token}` } })
}
function fmt(n: number) { return new Intl.NumberFormat("ko-KR", { maximumFractionDigits: 0 }).format(n) }
interface MemberRow {
  member: string; team: string|null
  goal: number; status: number; achievement_pct: number
  confirmed: number; deals_total: number; deals_confirmed: number
  new_renew: { new: number; renew: number }
  kpi: Record<string, { goal: number; actual: number }>
}

export default function ManagerScorecard({ team, period, refreshKey }: { team: Team; period: Period; refreshKey: number }) {
  const [rows, setRows] = useState<MemberRow[] | null>(null)
  useEffect(() => {
    adminFetch(`/api/admin/branch/kpi?team=${team}&period=${period}`)
      .then((r) => r.json()).then((d) => setRows(d.members ?? [])).catch(() => setRows([]))
  }, [team, period, refreshKey])
  if (!rows) return <div className="h-48 animate-pulse rounded-2xl bg-[#f0f0ec]" />
  if (rows.length === 0) return null
  return (
    <section>
      <h2 className="mb-3 text-[13px] font-semibold text-[#111110]/70">매니저 스코어카드</h2>
      <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
        {rows.map((m) => (
          <div key={m.member} className="rounded-2xl border border-[#e8e8e4] bg-white p-4">
            <div className="flex items-baseline justify-between">
              <p className="text-[14px] font-semibold">{m.member}</p>
              <span className="rounded-full bg-[#f0f0ec] px-2 py-0.5 text-[10px]">{m.team ?? "?"}</span>
            </div>
            <p className="mt-2 text-[18px] font-bold">{m.achievement_pct.toFixed(0)}%</p>
            <p className="mt-1 text-[11px] text-[#1a1a1a]/45">실적 ₩{fmt(m.confirmed)} / 목표 ₩{fmt(m.goal)}</p>
            <p className="mt-2 text-[11px] text-[#1a1a1a]/55">딜 {m.deals_total}건 (확정 {m.deals_confirmed}) · 신규 {m.new_renew.new} · 갱신 {m.new_renew.renew}</p>
            <div className="mt-2 grid grid-cols-5 gap-1 text-[10px]">
              {Object.entries(m.kpi).map(([k, v]) => {
                const pct = v.goal > 0 ? (v.actual / v.goal) * 100 : 0
                return (
                  <div key={k} className="rounded bg-[#fafaf8] px-1.5 py-1 text-center">
                    <div className="text-[#1a1a1a]/55">{k}</div>
                    <div className="font-medium">{pct.toFixed(0)}%</div>
                  </div>
                )
              })}
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}
