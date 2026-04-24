"use client"

import { useState, useEffect } from "react"
import { Users, TrendingUp, CheckCircle2 } from "lucide-react"
import type { LeadRecord } from "@/lib/db"

function adminFetch(url: string) {
  const token = (typeof window !== "undefined" ? sessionStorage.getItem("admin_password") : null) ?? ""
  return fetch(url, { headers: { Authorization: `Bearer ${token}` } })
}

const STATUS_LABEL: Record<string, string> = {
  new: "신규", contacted: "연락중", converted: "전환", closed: "종료",
}

const STATUS_COLOR: Record<string, string> = {
  new: "bg-[#ECFDF5] text-[#084734]",
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
  const [error, setError] = useState("")
  const [role, setRole] = useState<string>("admin")
  const [myBranch, setMyBranch] = useState<string | null>(null)
  const [selected, setSelected] = useState<string | null>(null)

  useEffect(() => {
    const r = sessionStorage.getItem("admin_role") ?? "admin"
    const b = sessionStorage.getItem("admin_branch")
    queueMicrotask(() => {
      setRole(r)
      setMyBranch(b)
      if (r === "branch" && b) setSelected(b)
    })
  }, [])

  useEffect(() => {
    adminFetch("/api/admin/leads")
      .then(async (res) => {
        const data = await res.json().catch(() => null)
        if (!res.ok) {
          throw new Error(data?.error || "지사 데이터를 불러오지 못했습니다.")
        }
        return data
      })
      .then((d) => {
        setLeads(d.leads ?? [])
        setError("")
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : "지사 데이터를 불러오지 못했습니다.")
      })
      .finally(() => setLoading(false))
  }, [])

  const visibleLeads = role === "branch" && myBranch
    ? leads.filter((l) => l.branch === myBranch)
    : leads

  const stats = computeStats(visibleLeads)
  const selectedLeads = selected ? visibleLeads.filter((l) => (l.branch ?? "미배정") === selected) : []
  const selectedStat = stats.find((s) => s.branch === selected)

  return (
    <div className="px-4 pt-6 pb-24 sm:px-6 sm:pt-8 lg:px-8 lg:pt-10 lg:pb-20">
      <div className="mb-6 sm:mb-8">
        <p className="text-[11px] font-medium text-[#1a1a1a]/30 uppercase tracking-widest mb-1">Admin</p>
        <h1 className="text-2xl font-bold text-[#111110] tracking-[-0.02em]">지사 관리</h1>
      </div>

      {loading ? (
        <p className="text-[13px] text-[#1a1a1a]/30">불러오는 중...</p>
      ) : error ? (
        <div className="bg-white rounded-xl border border-[#F6D5C5] py-10 text-center text-[13px] text-[#B85C33]">
          {error}
        </div>
      ) : stats.length === 0 ? (
        <div className="bg-white rounded-xl border border-[#e8e8e4] border-dashed py-24 text-center text-[13px] text-[#1a1a1a]/30">
          지사 데이터가 없습니다.
        </div>
      ) : (
        <div className="flex flex-col gap-5 lg:flex-row">
          <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-2 sm:mx-0 sm:px-0 lg:block lg:w-56 lg:shrink-0 lg:space-y-2 lg:overflow-visible lg:pb-0">
            {stats.map((s) => {
              const active = selected === s.branch
              return (
                <button
                  key={s.branch}
                  onClick={() => setSelected(active ? null : s.branch)}
                  className={`min-w-[180px] rounded-xl border px-4 py-3 text-left transition-all lg:w-full ${
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
              <div className="overflow-hidden rounded-xl border border-[#e8e8e4] bg-white">
                <div className="overflow-x-auto">
                <table className="min-w-[680px] w-full text-[13px]">
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
                        <td className="px-4 py-3 text-[#084734]">{s.new}</td>
                        <td className="px-4 py-3 text-yellow-600">{s.contacted}</td>
                        <td className="px-4 py-3 text-green-600">{s.converted}</td>
                        <td className="px-4 py-3 text-[#1a1a1a]/40">{s.closed}</td>
                        <td className="px-4 py-3"><span className="px-2 py-0.5 rounded-md bg-green-50 text-green-700 text-[11px] font-medium">{s.convRate}</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="grid gap-3 sm:grid-cols-3 sm:gap-4">
                  {[
                    { icon: <Users className="w-4 h-4 text-[#1a1a1a]/40" />, label: "전체 리드", value: selectedStat?.total ?? 0, accent: "" },
                    { icon: <TrendingUp className="w-4 h-4 text-[#084734]" />, label: "신규", value: selectedStat?.new ?? 0, accent: "bg-[#ECFDF5]" },
                    { icon: <CheckCircle2 className="w-4 h-4 text-green-500" />, label: "전환율", value: selectedStat?.convRate ?? "0%", accent: "bg-green-50" },
                  ].map((card) => (
                    <div key={card.label} className="rounded-xl border border-[#e8e8e4] bg-white p-4 sm:p-5">
                      <div className={`inline-flex p-2 rounded-lg mb-1 ${card.accent || "bg-[#f0f0ec]"}`}>{card.icon}</div>
                      <p className="text-[12px] text-[#1a1a1a]/40 mb-0.5">{card.label}</p>
                      <p className="text-2xl font-bold text-[#111110]">{card.value}</p>
                    </div>
                  ))}
                </div>

                <div className="overflow-hidden rounded-xl border border-[#e8e8e4] bg-white">
                  <div className="flex items-center justify-between border-b border-[#e8e8e4] px-4 py-3.5 sm:px-5">
                    <h2 className="text-[13px] font-semibold text-[#111110]">{selected} 리드</h2>
                    <span className="text-[12px] text-[#1a1a1a]/40">{selectedLeads.length}건</span>
                  </div>
                  {selectedLeads.length === 0 ? (
                    <p className="text-center py-10 text-[13px] text-[#1a1a1a]/30">리드 없음</p>
                  ) : (
                    <div className="overflow-x-auto">
                    <table className="min-w-[640px] w-full text-[13px]">
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
                    </div>
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
