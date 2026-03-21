"use client"

import { useState, useEffect, useCallback } from "react"
import { RefreshCw, Trash2, ChevronDown } from "lucide-react"
import { Button } from "@/components/ui/button"
import type { LeadRecord, LeadStatus } from "@/lib/db"

const STATUS_LABEL: Record<LeadStatus, string> = {
  new: "신규",
  contacted: "연락중",
  converted: "전환",
  closed: "종료",
}

const STATUS_COLOR: Record<LeadStatus, string> = {
  new: "bg-blue-50 text-blue-600",
  contacted: "bg-yellow-50 text-yellow-600",
  converted: "bg-green-50 text-green-600",
  closed: "bg-[#f0f0ec] text-[#1a1a1a]/40",
}

const SOURCE_LABEL: Record<string, string> = {
  demo_modal: "데모 신청",
  contact_page: "문의",
  newsletter: "뉴스레터",
}

function adminFetch(url: string, options?: RequestInit) {
  const token = sessionStorage.getItem("admin_password") ?? ""
  return fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...options?.headers,
    },
  })
}

export default function CrmPage() {
  const [leads, setLeads] = useState<LeadRecord[]>([])
  const [loading, setLoading] = useState(false)
  const [filter, setFilter] = useState<LeadStatus | "all">("all")

  const fetchLeads = useCallback(async () => {
    setLoading(true)
    try {
      const res = await adminFetch("/api/admin/leads")
      if (res.ok) {
        const data = await res.json()
        setLeads(data.leads)
      }
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchLeads() }, [fetchLeads])

  const handleStatus = async (id: string, status: LeadStatus) => {
    await adminFetch(`/api/admin/leads/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ status }),
    })
    setLeads((prev) => prev.map((l) => l.id === id ? { ...l, status } : l))
  }

  const handleDelete = async (id: string) => {
    if (!confirm("이 리드를 삭제하시겠습니까?")) return
    await adminFetch(`/api/admin/leads/${id}`, { method: "DELETE" })
    setLeads((prev) => prev.filter((l) => l.id !== id))
  }

  const filtered = filter === "all" ? leads : leads.filter((l) => l.status === filter)

  const counts = leads.reduce((acc, l) => {
    acc[l.status] = (acc[l.status] ?? 0) + 1
    return acc
  }, {} as Record<string, number>)

  return (
    <div className="px-8 pt-12 pb-20">
      <div className="flex items-center justify-between mb-8">
        <div>
          <p className="text-[11px] font-medium text-[#1a1a1a]/30 uppercase tracking-widest mb-1">Admin</p>
          <h1 className="text-2xl font-bold text-[#111110] tracking-[-0.02em]">CRM / 리드</h1>
        </div>
        <Button variant="outline" size="sm" onClick={fetchLeads} disabled={loading}>
          <RefreshCw className={`w-4 h-4 mr-1.5 ${loading ? "animate-spin" : ""}`} />
          새로고침
        </Button>
      </div>

      <div className="grid grid-cols-5 gap-3 mb-6">
        {([["all", "전체", leads.length], ["new", "신규", counts.new ?? 0], ["contacted", "연락중", counts.contacted ?? 0], ["converted", "전환", counts.converted ?? 0], ["closed", "종료", counts.closed ?? 0]] as const).map(
          ([key, label, count]) => (
            <button
              key={key}
              onClick={() => setFilter(key)}
              className={`text-left p-4 rounded-xl border transition-all ${
                filter === key
                  ? "border-[#111110] bg-[#111110] text-white"
                  : "border-[#e8e8e4] bg-white hover:border-[#c8c8c4]"
              }`}
            >
              <p className={`text-[11px] font-medium mb-1 ${filter === key ? "text-white/60" : "text-[#1a1a1a]/40"}`}>
                {label}
              </p>
              <p className="text-2xl font-bold">{count}</p>
            </button>
          )
        )}
      </div>

      <div className="bg-white rounded-xl border border-[#e8e8e4] overflow-hidden">
        {filtered.length === 0 ? (
          <div className="text-center py-16 text-[13px] text-[#1a1a1a]/30">
            {loading ? "불러오는 중..." : "리드가 없습니다."}
          </div>
        ) : (
          <table className="w-full text-[13px]">
            <thead>
              <tr className="border-b border-[#e8e8e4] bg-[#fafaf8]">
                {["시간", "소스", "이름", "기관", "이메일", "연락처", "상태", ""].map((h) => (
                  <th key={h} className="text-left px-4 py-3 font-medium text-[#1a1a1a]/40 whitespace-nowrap">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((lead) => (
                <tr key={lead.id} className="border-b border-[#e8e8e4] last:border-0 hover:bg-[#fafaf8] transition-colors">
                  <td className="px-4 py-3 text-[#1a1a1a]/40 whitespace-nowrap">
                    {new Date(lead.timestamp).toLocaleDateString("ko-KR", {
                      month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit",
                    })}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <span className="px-2 py-0.5 rounded-md bg-[#f0f0ec] text-[#1a1a1a]/60 text-[11px]">
                      {SOURCE_LABEL[lead.source] ?? lead.source}
                    </span>
                  </td>
                  <td className="px-4 py-3 font-medium text-[#111110]">{lead.name ?? "—"}</td>
                  <td className="px-4 py-3 text-[#1a1a1a]/60">{lead.org ?? "—"}</td>
                  <td className="px-4 py-3 text-[#1a1a1a]/60">{lead.email ?? "—"}</td>
                  <td className="px-4 py-3 text-[#1a1a1a]/60">{lead.phone ?? "—"}</td>
                  <td className="px-4 py-3">
                    <div className="relative inline-block">
                      <select
                        value={lead.status}
                        onChange={(e) => handleStatus(lead.id, e.target.value as LeadStatus)}
                        className={`appearance-none pl-2.5 pr-6 py-1 rounded-lg text-[12px] font-medium cursor-pointer border-0 outline-none ${STATUS_COLOR[lead.status]}`}
                      >
                        {(Object.keys(STATUS_LABEL) as LeadStatus[]).map((s) => (
                          <option key={s} value={s}>{STATUS_LABEL[s]}</option>
                        ))}
                      </select>
                      <ChevronDown className="absolute right-1.5 top-1/2 -translate-y-1/2 w-3 h-3 pointer-events-none opacity-60" />
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => handleDelete(lead.id)}
                      className="text-[#1a1a1a]/20 hover:text-red-400 transition-colors"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
