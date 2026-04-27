"use client"
import type { BranchKpiMemberRow } from "../types"

const METRICS = ["LD","ACC","OPP","SOL","VST"] as const

export default function KpiActivityMatrix({ rows, loading, error }: { rows: BranchKpiMemberRow[] | null; loading: boolean; error: string | null }) {
  if (error) return <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-[12px] text-rose-700">{error}</div>
  if (loading || !rows) return <div className="h-48 animate-pulse rounded-2xl bg-[#f0f0ec]" />
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
            {rows.map((r, index) => (
              <tr key={`${r.member}-${index}`} className="border-t border-[#f0f0ec]">
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
