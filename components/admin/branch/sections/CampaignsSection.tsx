"use client"
import type { BranchCampaignRow } from "../types"

export default function CampaignsSection({ rows, loading, error }: { rows: BranchCampaignRow[] | null; loading: boolean; error: string | null }) {
  if (error && !rows) return (
    <div role="alert" className="rounded-xl border border-[#F2B8B8] bg-[#FCE9E9] p-4 text-[12px] font-semibold text-[#8F2C2C]">
      {error}
    </div>
  )
  if (loading && !rows) return <div className="h-32 animate-pulse rounded-xl bg-[#f0f0ec]" />
  if (!rows) return (
    <div role="status" className="rounded-xl border border-[rgba(0,0,0,0.08)] bg-white p-4 text-[12px] text-[#615D59]">
      캠페인 원천 데이터가 없습니다.
    </div>
  )
  return (
    <section className="rounded-xl border border-[rgba(0,0,0,0.08)] bg-white shadow-[0_1px_2px_rgba(0,0,0,0.02)]">
      <div className="flex items-center justify-between gap-3 border-b border-[rgba(0,0,0,0.08)] px-5 py-3.5">
        <h2 className="text-[14px] font-bold tracking-[-0.01em] text-[#111110]">캠페인 성과 (최근 30일)</h2>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-[12px]">
          <thead className="bg-[#fafaf8] text-[#1a1a1a]/60">
            <tr>
              <th className="px-3 py-2 text-left">캠페인</th>
              <th className="px-3 py-2">발송일</th>
              <th className="px-3 py-2 text-right">발송</th>
              <th className="px-3 py-2 text-right">오픈</th>
              <th className="px-3 py-2 text-right">오픈율</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr><td colSpan={5} className="px-3 py-6 text-center text-[#1a1a1a]/40">최근 30일 발송된 캠페인 없음</td></tr>
            )}
            {rows.map((r) => (
              <tr key={String(r.id)} className="border-t border-[#f0f0ec]">
                <td className="px-3 py-2 font-medium">{r.subject}</td>
                <td className="px-3 py-2 text-center">{r.sentAt?.slice(0,10) ?? "-"}</td>
                <td className="px-3 py-2 text-right">{r.recipientCount}</td>
                <td className="px-3 py-2 text-right">{r.openCount}</td>
                <td className="px-3 py-2 text-right">{r.openPct.toFixed(0)}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}
