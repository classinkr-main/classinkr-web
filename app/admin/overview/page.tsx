"use client"

import { useState, useEffect } from "react"
import { Users, TrendingUp, PhoneCall, CheckCircle2 } from "lucide-react"
import type { LeadRecord } from "@/lib/db"

function adminFetch(url: string) {
  const token = sessionStorage.getItem("admin_password") ?? ""
  return fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  })
}

function KpiCard({
  icon,
  label,
  value,
  sub,
  accent,
}: {
  icon: React.ReactNode
  label: string
  value: string | number
  sub?: string
  accent?: string
}) {
  return (
    <div className="bg-white rounded-xl border border-[#e8e8e4] p-5">
      <div className={`inline-flex p-2 rounded-lg mb-3 ${accent ?? "bg-[#f0f0ec]"}`}>
        {icon}
      </div>
      <p className="text-[12px] text-[#1a1a1a]/40 mb-1">{label}</p>
      <p className="text-2xl font-bold text-[#111110]">{value}</p>
      {sub && <p className="text-[12px] text-[#1a1a1a]/40 mt-1">{sub}</p>}
    </div>
  )
}

export default function OverviewPage() {
  const [leads, setLeads] = useState<LeadRecord[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    adminFetch("/api/admin/leads")
      .then((r) => r.json())
      .then((d) => setLeads(d.leads ?? []))
      .finally(() => setLoading(false))
  }, [])

  const total = leads.length
  const newLeads = leads.filter((l) => l.status === "new").length
  const contacted = leads.filter((l) => l.status === "contacted").length
  const converted = leads.filter((l) => l.status === "converted").length
  const convRate = total > 0 ? Math.round((converted / total) * 100) : 0

  const today = new Date().toDateString()
  const todayLeads = leads.filter((l) => new Date(l.timestamp).toDateString() === today).length

  const recent = leads.slice(0, 5)

  const SOURCE_LABEL: Record<string, string> = {
    demo_modal: "데모 신청",
    contact_page: "문의",
    newsletter: "뉴스레터",
  }

  return (
    <div className="px-8 pt-12 pb-20">
      <div className="mb-8">
        <p className="text-[11px] font-medium text-[#1a1a1a]/30 uppercase tracking-widest mb-1">Admin</p>
        <h1 className="text-2xl font-bold text-[#111110] tracking-[-0.02em]">Overview</h1>
      </div>

      {loading ? (
        <p className="text-[13px] text-[#1a1a1a]/30">불러오는 중...</p>
      ) : (
        <>
          <div className="grid grid-cols-4 gap-4 mb-8">
            <KpiCard
              icon={<Users className="w-4 h-4 text-[#1a1a1a]/60" />}
              label="전체 리드"
              value={total}
              sub={`오늘 +${todayLeads}`}
            />
            <KpiCard
              icon={<TrendingUp className="w-4 h-4 text-blue-500" />}
              label="신규"
              value={newLeads}
              accent="bg-blue-50"
            />
            <KpiCard
              icon={<PhoneCall className="w-4 h-4 text-yellow-500" />}
              label="연락중"
              value={contacted}
              accent="bg-yellow-50"
            />
            <KpiCard
              icon={<CheckCircle2 className="w-4 h-4 text-green-500" />}
              label="전환율"
              value={`${convRate}%`}
              sub={`전환 ${converted}건`}
              accent="bg-green-50"
            />
          </div>

          <div className="bg-white rounded-xl border border-[#e8e8e4] overflow-hidden">
            <div className="px-5 py-4 border-b border-[#e8e8e4]">
              <h2 className="text-[14px] font-semibold text-[#111110]">최근 리드</h2>
            </div>
            {recent.length === 0 ? (
              <p className="text-center py-12 text-[13px] text-[#1a1a1a]/30">아직 리드가 없습니다.</p>
            ) : (
              <ul>
                {recent.map((lead) => (
                  <li key={lead.id} className="flex items-center gap-4 px-5 py-3.5 border-b border-[#e8e8e4] last:border-0 hover:bg-[#fafaf8] transition-colors">
                    <div className="w-8 h-8 rounded-full bg-[#f0f0ec] flex items-center justify-center text-[12px] font-semibold text-[#1a1a1a]/50 shrink-0">
                      {(lead.name ?? lead.email ?? "?")[0]?.toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[13px] font-medium text-[#111110] truncate">
                        {lead.name ?? lead.email ?? "이름 없음"}
                        {lead.org && <span className="font-normal text-[#1a1a1a]/40"> · {lead.org}</span>}
                      </p>
                      <p className="text-[12px] text-[#1a1a1a]/40">
                        {SOURCE_LABEL[lead.source] ?? lead.source}
                      </p>
                    </div>
                    <span className={`text-[11px] px-2 py-0.5 rounded-md font-medium shrink-0 ${
                      lead.status === "new" ? "bg-blue-50 text-blue-600"
                      : lead.status === "contacted" ? "bg-yellow-50 text-yellow-600"
                      : lead.status === "converted" ? "bg-green-50 text-green-600"
                      : "bg-[#f0f0ec] text-[#1a1a1a]/40"
                    }`}>
                      {{ new: "신규", contacted: "연락중", converted: "전환", closed: "종료" }[lead.status]}
                    </span>
                    <p className="text-[11px] text-[#1a1a1a]/30 shrink-0">
                      {new Date(lead.timestamp).toLocaleDateString("ko-KR", { month: "2-digit", day: "2-digit" })}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      )}
    </div>
  )
}
