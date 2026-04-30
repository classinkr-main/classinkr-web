"use client"
import type { BranchKpiTeamRow } from "../types"

const numberFormatter = new Intl.NumberFormat("ko-KR", { maximumFractionDigits: 0 })
function fmt(n: number) { return numberFormatter.format(n) }

export default function TeamPacingSection({ rows, loading, error }: { rows: BranchKpiTeamRow[] | null; loading: boolean; error: string | null }) {
  if (error) return <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-[12px] text-rose-700">{error}</div>
  if (loading || !rows) return <div className="h-32 animate-pulse rounded-2xl bg-[#f0f0ec]" />
  if (rows.length === 0) return null
  return (
    <section>
      <h2 className="mb-3 text-[13px] font-semibold text-[#111110]/70">팀 페이싱</h2>
      <div className="grid gap-3 md:grid-cols-3">
        {rows.map((t) => (
          <div key={t.team} className="rounded-2xl border border-[#e8e8e4] bg-white p-4">
            <p className="text-[12px] font-medium text-[#1a1a1a]/60">{t.team}</p>
            <p className="mt-1 text-[20px] font-bold">{t.pacing_pct.toFixed(0)}%</p>
            <p className="mt-1 text-[11px] text-[#1a1a1a]/45">실적 ¥{fmt(t.status)} / 목표 ¥{fmt(t.goal)}</p>
            <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-[#f0f0ec]">
              <div className="h-full bg-emerald-500" style={{ width: `${Math.min(100, t.pacing_pct)}%` }} />
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}
