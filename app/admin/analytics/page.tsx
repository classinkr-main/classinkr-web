"use client"

import { useState, useEffect } from "react"
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from "recharts"
import type { LeadRecord } from "@/lib/db"

function adminFetch(url: string) {
  const token = (typeof window !== "undefined" ? sessionStorage.getItem("admin_password") : null) ?? ""
  return fetch(url, { headers: { Authorization: `Bearer ${token}` } })
}

const SOURCE_LABEL: Record<string, string> = {
  demo_modal: "데모 신청",
  contact_page: "문의",
  newsletter: "뉴스레터",
}

const STATUS_LABEL: Record<string, string> = {
  new: "신규",
  contacted: "연락중",
  converted: "전환",
  closed: "종료",
}

const COLORS = ["#111110", "#4b8cf7", "#22c55e", "#f59e0b", "#e11d48"]

function lastNDays(n: number) {
  return Array.from({ length: n }, (_, i) => {
    const d = new Date()
    d.setDate(d.getDate() - (n - 1 - i))
    return d.toISOString().slice(0, 10)
  })
}

export default function AnalyticsPage() {
  const [leads, setLeads] = useState<LeadRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [range, setRange] = useState<7 | 14 | 30>(30)

  useEffect(() => {
    adminFetch("/api/admin/leads")
      .then((r) => r.json())
      .then((d) => setLeads(d.leads ?? []))
      .finally(() => setLoading(false))
  }, [])

  const days = lastNDays(range)
  const byDay = days.map((date) => ({
    date: date.slice(5),
    count: leads.filter((l) => l.timestamp.slice(0, 10) === date).length,
  }))

  const bySource = Object.entries(
    leads.reduce((acc, l) => {
      acc[l.source] = (acc[l.source] ?? 0) + 1
      return acc
    }, {} as Record<string, number>)
  ).map(([source, count]) => ({ name: SOURCE_LABEL[source] ?? source, count }))
    .sort((a, b) => b.count - a.count)

  const byStatus = Object.entries(
    leads.reduce((acc, l) => {
      acc[l.status] = (acc[l.status] ?? 0) + 1
      return acc
    }, {} as Record<string, number>)
  ).map(([status, value]) => ({ name: STATUS_LABEL[status] ?? status, value }))

  const total = leads.length
  const converted = leads.filter((l) => l.status === "converted").length
  const convRate = total > 0 ? ((converted / total) * 100).toFixed(1) : "0.0"

  if (loading) {
    return <div className="px-8 pt-12 text-[13px] text-[#1a1a1a]/30">불러오는 중...</div>
  }

  return (
    <div className="px-8 pt-12 pb-20">
      <div className="flex items-center justify-between mb-8">
        <div>
          <p className="text-[11px] font-medium text-[#1a1a1a]/30 uppercase tracking-widest mb-1">Admin</p>
          <h1 className="text-2xl font-bold text-[#111110] tracking-[-0.02em]">Analytics</h1>
        </div>
        <div className="flex gap-1 bg-[#f0f0ec] p-1 rounded-lg">
          {([7, 14, 30] as const).map((d) => (
            <button
              key={d}
              onClick={() => setRange(d)}
              className={`px-3 py-1 text-[12px] font-medium rounded-md transition-colors ${
                range === d ? "bg-white text-[#111110] shadow-sm" : "text-[#1a1a1a]/50"
              }`}
            >
              {d}일
            </button>
          ))}
        </div>
      </div>

      {total === 0 ? (
        <div className="bg-white rounded-xl border border-[#e8e8e4] border-dashed py-24 text-center text-[13px] text-[#1a1a1a]/30">
          아직 리드 데이터가 없습니다.
        </div>
      ) : (
        <div className="space-y-5">
          <div className="bg-white rounded-xl border border-[#e8e8e4] p-6">
            <h2 className="text-[13px] font-semibold text-[#111110] mb-5">
              일별 신규 리드 <span className="font-normal text-[#1a1a1a]/40">(최근 {range}일)</span>
            </h2>
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={byDay} margin={{ top: 4, right: 4, bottom: 0, left: -24 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0ec" />
                <XAxis dataKey="date" tick={{ fontSize: 11, fill: "#1a1a1a60" }} tickLine={false} axisLine={false} interval={range === 7 ? 0 : range === 14 ? 1 : 4} />
                <YAxis tick={{ fontSize: 11, fill: "#1a1a1a60" }} tickLine={false} axisLine={false} allowDecimals={false} />
                <Tooltip
                  contentStyle={{ fontSize: 12, border: "1px solid #e8e8e4", borderRadius: 8, boxShadow: "none" }}
                  formatter={(v) => [`${v}건`, "리드"]}
                />
                <Line type="monotone" dataKey="count" stroke="#111110" strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>

          <div className="grid grid-cols-2 gap-5">
            <div className="bg-white rounded-xl border border-[#e8e8e4] p-6">
              <h2 className="text-[13px] font-semibold text-[#111110] mb-5">소스별 리드</h2>
              {bySource.length === 0 ? (
                <p className="text-[12px] text-[#1a1a1a]/30 text-center py-8">데이터 없음</p>
              ) : (
                <ResponsiveContainer width="100%" height={180}>
                  <BarChart data={bySource} margin={{ top: 4, right: 4, bottom: 0, left: -24 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0ec" vertical={false} />
                    <XAxis dataKey="name" tick={{ fontSize: 11, fill: "#1a1a1a60" }} tickLine={false} axisLine={false} />
                    <YAxis tick={{ fontSize: 11, fill: "#1a1a1a60" }} tickLine={false} axisLine={false} allowDecimals={false} />
                    <Tooltip
                      contentStyle={{ fontSize: 12, border: "1px solid #e8e8e4", borderRadius: 8, boxShadow: "none" }}
                      formatter={(v) => [`${v}건`, "리드"]}
                    />
                    <Bar dataKey="count" fill="#111110" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>

            <div className="bg-white rounded-xl border border-[#e8e8e4] p-6">
              <h2 className="text-[13px] font-semibold text-[#111110] mb-5">상태 분포 · 전환율 {convRate}%</h2>
              {byStatus.length === 0 ? (
                <p className="text-[12px] text-[#1a1a1a]/30 text-center py-8">데이터 없음</p>
              ) : (
                <div className="flex items-center gap-6">
                  <ResponsiveContainer width={160} height={160}>
                    <PieChart>
                      <Pie data={byStatus} dataKey="value" cx="50%" cy="50%" innerRadius={44} outerRadius={68} paddingAngle={3}>
                        {byStatus.map((_, i) => (
                          <Cell key={i} fill={COLORS[i % COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip
                        contentStyle={{ fontSize: 12, border: "1px solid #e8e8e4", borderRadius: 8, boxShadow: "none" }}
                        formatter={(v) => [`${v}건`]}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                  <ul className="space-y-2">
                    {byStatus.map((item, i) => (
                      <li key={item.name} className="flex items-center gap-2 text-[12px]">
                        <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: COLORS[i % COLORS.length] }} />
                        <span className="text-[#1a1a1a]/60">{item.name}</span>
                        <span className="font-semibold text-[#111110] ml-auto pl-4">{item.value}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
