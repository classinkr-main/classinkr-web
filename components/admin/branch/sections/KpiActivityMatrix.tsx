"use client"
import { useEffect, useState } from "react"
import type { Team, Period } from "../BranchDashboardClient"

async function adminFetch(url: string) {
  const token = (typeof window !== "undefined" ? sessionStorage.getItem("admin_password") : null) ?? ""
  return fetch(url, { headers: { Authorization: `Bearer ${token}` } })
}
const METRICS = ["LD","ACC","OPP","SOL","VST"] as const
interface MemberRow { member: string; kpi: Record<string, { goal: number; actual: number }> }

export default function KpiActivityMatrix({ team, period, refreshKey }: { team: Team; period: Period; refreshKey: number }) {
  const [rows, setRows] = useState<MemberRow[] | null>(null)
  useEffect(() => {
    adminFetch(`/api/admin/branch/kpi?team=${team}&period=${period}`)
      .then((r) => r.json()).then((d) => setRows(d.members ?? [])).catch(() => setRows([]))
  }, [team, period, refreshKey])
  if (!rows) return <div className="h-48 animate-pulse rounded-2xl bg-[#f0f0ec]" />
  if (rows.length === 0) return null
  return (
    <section>
      <h2 className="mb-3 text-[13px] font-semibold text-[#111110]/70">활동 KPI 매트릭스</h2>
      <div className="overflow-x-auto rounded-2xl border border-[#e8e8e4] bg-white">
        <table className="w-full text-[12px]">
          <thead className="bg-[#fafaf8] text-[#1a1a1a]/60">
            <tr>
              <th className="px-3 py-2 text-left">멤버</th>
              {METRICS.map((m) => <th key={m} className="px-3 py-2 text-right">{m}</th>)}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.member} className="border-t border-[#f0f0ec]">
                <td className="px-3 py-2 font-medium">{r.member}</td>
                {METRICS.map((m) => {
                  const v = r.kpi[m]
                  const pct = v?.goal > 0 ? (v.actual / v.goal) * 100 : 0
                  const tone = pct >= 95 ? "text-emerald-700" : pct >= 75 ? "text-amber-700" : "text-rose-700"
                  return <td key={m} className={`px-3 py-2 text-right ${tone}`}>{v?.actual ?? 0}/{v?.goal ?? 0} ({pct.toFixed(0)}%)</td>
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}
