"use client"
import { useEffect, useState } from "react"

async function adminFetch(url: string) {
  const token = (typeof window !== "undefined" ? sessionStorage.getItem("admin_password") : null) ?? ""
  return fetch(url, { headers: { Authorization: `Bearer ${token}` } })
}

interface Row { id: string|number; subject: string; sentAt?: string; recipientCount: number; openCount: number; openPct: number }

export default function CampaignsSection({ refreshKey }: { refreshKey: number }) {
  const [rows, setRows] = useState<Row[] | null>(null)
  useEffect(() => {
    adminFetch("/api/admin/branch/summary?team=ALL&period=Q")
      .then((r) => r.json())
      .then((d) => setRows((d.campaigns_recent as Row[]) ?? []))
      .catch(() => setRows([]))
  }, [refreshKey])
  if (!rows) return <div className="h-32 animate-pulse rounded-2xl bg-[#f0f0ec]" />
  return (
    <section>
      <h2 className="mb-3 text-[13px] font-semibold text-[#111110]/70">캠페인 성과 (최근 30일)</h2>
      <div className="overflow-x-auto rounded-2xl border border-[#e8e8e4] bg-white">
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
