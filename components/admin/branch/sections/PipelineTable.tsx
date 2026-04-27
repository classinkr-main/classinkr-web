"use client"
import { useEffect, useState } from "react"
import type { Team, Period } from "../BranchDashboardClient"

async function adminFetch(url: string) {
  const token = (typeof window !== "undefined" ? sessionStorage.getItem("admin_password") : null) ?? ""
  return fetch(url, { headers: { Authorization: `Bearer ${token}` } })
}
function fmt(n: number) { return new Intl.NumberFormat("ko-KR", { maximumFractionDigits: 0 }).format(n) }

interface Row {
  id: string; customer: string; manager: string|null; team: string|null
  region: string|null; importance: string|null; stage: string
  probability: number; target: number; confirmed_revenue: number; pipeline_value: number
}

export default function PipelineTable({ team, refreshKey }: { team: Team; period: Period; refreshKey: number }) {
  const [rows, setRows] = useState<Row[] | null>(null)
  useEffect(() => {
    adminFetch(`/api/admin/branch/pipeline?team=${team}`)
      .then((r) => r.json()).then((d) => setRows(d.rows ?? [])).catch(() => setRows([]))
  }, [team, refreshKey])
  if (!rows) return <div className="h-64 animate-pulse rounded-2xl bg-[#f0f0ec]" />
  if (rows.length === 0) return (
    <section>
      <h2 className="mb-3 text-[13px] font-semibold text-[#111110]/70">파이프라인</h2>
      <div className="rounded-2xl border border-[#e8e8e4] bg-white p-6 text-[12px] text-[#1a1a1a]/40">표시할 딜이 없습니다.</div>
    </section>
  )
  return (
    <section>
      <div className="mb-3 flex items-end justify-between">
        <h2 className="text-[13px] font-semibold text-[#111110]/70">파이프라인</h2>
        <p className="text-[11px] text-[#1a1a1a]/40" title="M열 = 계약 목표/잠재 (실매출 아님)">M열 = 목표 금액. 실매출 = 빨간 셀 합</p>
      </div>
      <div className="overflow-x-auto rounded-2xl border border-[#e8e8e4] bg-white">
        <table className="w-full text-[12px]">
          <thead className="bg-[#fafaf8] text-[#1a1a1a]/60">
            <tr>
              <th className="px-3 py-2 text-left">고객사</th>
              <th className="px-3 py-2">매니저</th>
              <th className="px-3 py-2">지역</th>
              <th className="px-3 py-2">중요도</th>
              <th className="px-3 py-2">단계</th>
              <th className="px-3 py-2 text-right">목표 (M)</th>
              <th className="px-3 py-2 text-right">확정매출</th>
              <th className="px-3 py-2 text-right">파이프라인 가치</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-t border-[#f0f0ec]">
                <td className="px-3 py-2 font-medium">{r.customer}</td>
                <td className="px-3 py-2 text-center">{r.manager ?? "-"}</td>
                <td className="px-3 py-2 text-center">{r.region ?? "-"}</td>
                <td className="px-3 py-2 text-center">{r.importance ?? "-"}</td>
                <td className="px-3 py-2 text-center">{r.stage} ({(r.probability * 100).toFixed(0)}%)</td>
                <td className="px-3 py-2 text-right text-[#1a1a1a]/60">₩{fmt(r.target)}</td>
                <td className="px-3 py-2 text-right font-medium">₩{fmt(r.confirmed_revenue)}</td>
                <td className="px-3 py-2 text-right">₩{fmt(r.pipeline_value)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}
