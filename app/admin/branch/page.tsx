"use client"

import { useState, useEffect } from "react"
import { Users, TrendingUp, CheckCircle2 } from "lucide-react"
import type { LeadRecord } from "@/lib/db"

function adminFetch(url: string) {
  const token = sessionStorage.getItem("admin_password") ?? ""
  return fetch(url, { headers: { Authorization: `Bearer ${token}` } })
}

const STATUS_LABEL: Record<string, string> = {
  new: "신규", contacted: "연락중", converted: "전환", closed: "종료",
}

const STATUS_COLOR: Record<string, string> = {
  new: "bg-blue-50 text-blue-600",
  contacted: "bg-yellow-50 text-yellow-600",
  converted: "bg-green-50 text-green-600",
  closed: "bg-[#f0f0ec] text-[#1a1a1a]/40",
}

interface BranchStat {
  branch: string
  total: number
  new: number
  contacted: number
  converted: number
  closed: number
  convRate: string
}

function computeStats(leads: LeadRecord[]): BranchStat[] {
  const map: Record<string, LeadRecord[]> = {}
  leads.forEach((l) => {
    const key = l.branch ?? "미배정"
    if (!map[key]) map[key] = []
    map[key].push(l)
  })
  return Object.entries(map).map(([branch, list]) => {
    const total = list.length
    const converted = list.filter((l) => l.status === "converted").length
    return {
      branch, total,
      new: list.filter((l) => l.status === "new").length,
      contacted: list.filter((l) => l.status === "contacted").length,
      converted,
      closed: list.filter((l) => l.status === "closed").length,
      convRate: total > 0 ? ((converted / total) * 100).toFixed(0) + "%" : "0%",
    }
  }).sort((a, b) => b.total - a.total)
}

export default function BranchPage() {
  const [leads, setLeads] = useState<LeadRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [role, setRole] = useState<string>("admin")
  const [myBranch, setMyBranch] = useState<string | null>(null)
  const [selected, setSelected] = useState<string | null>(null)

  useEffect(() => {
    const r = sessionStorage.getItem("admin_role") ?? "admin"
    const b = sessionStorage.getItem("admin_branch")
    setRole(r)
    setMyBranch(b)
    if (r === "branch" && b) setSelected(b)
  }, [])

  useEffect(() => {
    adminFetch("/api/admin/leads")
      .then((res) => res.json())
      .then((d) => setLeads(d.leads ?? []))
      .finally(() => setLoading(false))
  }, [])

  const visibleLeads = role === "branch" && myBranch
    ? leads.filter((l) => l.branch === myBranch)
    : leads

  const stats = computeStats(visibleLeads)
  const selectedLeads = selected ? visibleLeads.filter((l) => (l.branch ?? "미배정") === selected) : []
  const selectedStat = stats.find((s) => s.branch === selected)

  return (
    <div className="px-8 pt-12 pb-20">
      <div className="mb-8">
        <p className="text-[11px] font-medium text-[#1a1a1a]/30 uppercase tracking-widest mb-1">Admin</p>
        <h1 className="text-2xl font-bold text-[#111110] tracking-[-0.02em]">지사 관리</h1>
      </div>

      {loading ? (
        <p className="text-[13px] text-[#1a1a1a]/30">불러오는 중...</p>
      ) : stats.length === 0 ? (
        <div className="bg-white rounded-xl border border-[#e8e8e4] border-dashed py-24 text-center text-[13px] text-[#1a1a1a]/30">
          지사 데이터가 없습니다.
        </div>
      ) : (
        <div className="flex gap-5">
          <div className="w-56 shrink-0 space-y-2">
            {stats.map((s) => {
              const active = selected === s.branch
              return (
                <button
                  key={s.branch}
                  onClick={() => setSelected(active ? null : s.branch)}
                  className={`w-full text-left px-4 py-3 rounded-xl border transition-all ${
                    active ? "border-[#111110] bg-[#111110] text-white" : "border-[#e8e8e4] bg-white hover:border-[#c8c8c4]"
                  }`}
                >
                  <p className={`text-[13px] font-semibold mb-0.5 ${active ? "text-white" : "text-[#111110]"}`}>{s.branch}</p>
                  <p className={`text-[12px] ${active ? "text-white/60" : "text-[#1a1a1a]/40"}`}>전체 {s.total}건 · 전환 {s.convRate}</p>
                </button>
              )
            })}
          </div>

          <div className="flex-1 min-w-0">
            {!selected ? (
              <div className="bg-white rounded-xl border border-[#e8e8e4] overflow-hidden">
                <table className="w-full text-[13px]">
                  <thead>
                    <tr className="border-b border-[#e8e8e4] bg-[#fafaf8]">
                      {["지사", "전체", "신규", "연락중", "전환", "종료", "전환율"].map((h) => (
                        <th key={h} className="text-left px-4 py-3 font-medium text-[#1a1a1a]/40">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {stats.map((s) => (
                      <tr key={s.branch} onClick={() => setSelected(s.branch)} className="border-b border-[#e8e8e4] last:border-0 hover:bg-[#fafaf8] cursor-pointer transition-colors">
                        <td className="px-4 py-3 font-medium text-[#111110]">{s.branch}</td>
                        <td className="px-4 py-3 font-semibold">{s.total}</td>
                        <td className="px-4 py-3 text-blue-600">{s.new}</td>
                        <td className="px-4 py-3 text-yellow-600">{s.contacted}</td>
                        <td className="px-4 py-3 text-green-600">{s.converted}</td>
                        <td className="px-4 py-3 text-[#1a1a1a]/40">{s.closed}</td>
                        <td className="px-4 py-3"><span className="px-2 py-0.5 rounded-md bg-green-50 text-green-700 text-[11px] font-medium">{s.convRate}</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="grid grid-cols-3 gap-4">
                  {[
                    { icon: <Users className="w-4 h-4 text-[#1a1a1a]/40" />, label: "전체 리드", value: selectedStat?.total ?? 0, accent: "" },
                    { icon: <TrendingUp className="w-4 h-4 text-blue-500" />, label: "신규", value: selectedStat?.new ?? 0, accent: "bg-blue-50" },
                    { icon: <CheckCircle2 className="w-4 h-4 text-green-500" />, label: "전환율", value: selectedStat?.convRate ?? "0%", accent: "bg-green-50" },
                  ].map((card) => (
                    <div key={card.label} className="bg-white rounded-xl border border-[#e8e8e4] p-5">
                      <div className={`inline-flex p-2 rounded-lg mb-1 ${card.accent || "bg-[#f0f0ec]"}`}>{card.icon}</div>
                      <p className="text-[12px] text-[#1a1a1a]/40 mb-0.5">{card.label}</p>
                      <p className="text-2xl font-bold text-[#111110]">{card.value}</p>
                    </div>
                  ))}
                </div>

                <div className="bg-white rounded-xl border border-[#e8e8e4] overflow-hidden">
                  <div className="px-5 py-3.5 border-b border-[#e8e8e4] flex items-center justify-between">
                    <h2 className="text-[13px] font-semibold text-[#111110]">{selected} 리드</h2>
                    <span className="text-[12px] text-[#1a1a1a]/40">{selectedLeads.length}건</span>
                  </div>
                  {selectedLeads.length === 0 ? (
                    <p className="text-center py-10 text-[13px] text-[#1a1a1a]/30">리드 없음</p>
                  ) : (
                    <table className="w-full text-[13px]">
                      <thead>
                        <tr className="border-b border-[#e8e8e4] bg-[#fafaf8]">
                          {["시간", "이름", "기관", "연락처", "상태"].map((h) => (
                            <th key={h} className="text-left px-4 py-2.5 font-medium text-[#1a1a1a]/40">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {selectedLeads.map((lead) => (
                          <tr key={lead.id} className="border-b border-[#e8e8e4] last:border-0 hover:bg-[#fafaf8] transition-colors">
                            <td className="px-4 py-3 text-[#1a1a1a]/40 whitespace-nowrap">
                              {new Date(lead.timestamp).toLocaleDateString("ko-KR", { month: "2-digit", day: "2-digit" })}
                            </td>
                            <td className="px-4 py-3 font-medium text-[#111110]">{lead.name ?? "—"}</td>
                            <td className="px-4 py-3 text-[#1a1a1a]/60">{lead.org ?? "—"}</td>
                            <td className="px-4 py-3 text-[#1a1a1a]/60">{lead.phone ?? lead.email ?? "—"}</td>
                            <td className="px-4 py-3">
                              <span className={`text-[11px] px-2 py-0.5 rounded-md font-medium ${STATUS_COLOR[lead.status]}`}>
                                {STATUS_LABEL[lead.status]}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
