"use client"

import { useState, useEffect } from "react"
import {
  Users, TrendingUp, CheckCircle2, Mail,
  FileText, AlertCircle, ArrowUpRight, ArrowDownRight, Minus,
} from "lucide-react"
import {
  LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from "recharts"
import type { LeadRecord } from "@/lib/db"

function adminFetch(url: string) {
  const token = (typeof window !== "undefined" ? sessionStorage.getItem("admin_password") : null) ?? ""
  return fetch(url, { headers: { Authorization: `Bearer ${token}` } })
}

// ─── 스켈레톤 ────────────────────────────────────────────────────
function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`bg-[#f0f0ec] rounded-lg animate-pulse ${className}`} />
}

function KpiSkeleton() {
  return (
    <div className="bg-white rounded-2xl border border-[#e8e8e4] p-5 space-y-3">
      <Skeleton className="w-8 h-8 rounded-xl" />
      <Skeleton className="w-20 h-3" />
      <Skeleton className="w-14 h-7" />
      <Skeleton className="w-24 h-3" />
    </div>
  )
}

// ─── KPI 카드 ────────────────────────────────────────────────────
interface KpiCardProps {
  icon: React.ReactNode
  label: string
  value: string | number
  sub?: string
  trend?: { value: number; label: string }
  accent?: string
  iconColor?: string
}

function KpiCard({ icon, label, value, sub, trend, accent = "bg-[#f0f0ec]", iconColor = "text-[#1a1a1a]/50" }: KpiCardProps) {
  const trendPositive = trend && trend.value > 0
  const trendNeutral = trend && trend.value === 0
  return (
    <div className="bg-white rounded-2xl border border-[#e8e8e4] p-5 hover:border-[#c8c8c4] hover:shadow-sm transition-all">
      <div className="flex items-start justify-between mb-3">
        <div className={`inline-flex p-2 rounded-xl ${accent}`}>
          <span className={iconColor}>{icon}</span>
        </div>
        {trend && (
          <span className={`flex items-center gap-0.5 text-[11px] font-medium px-1.5 py-0.5 rounded-full ${
            trendNeutral ? "text-[#1a1a1a]/40 bg-[#f0f0ec]"
            : trendPositive ? "text-green-600 bg-green-50"
            : "text-red-500 bg-red-50"
          }`}>
            {trendNeutral ? <Minus className="w-3 h-3" /> : trendPositive ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
            {Math.abs(trend.value)}
          </span>
        )}
      </div>
      <p className="text-[11px] font-medium text-[#1a1a1a]/40 mb-1 uppercase tracking-wide">{label}</p>
      <p className="text-[28px] font-bold text-[#111110] tracking-[-0.03em] leading-none">{value}</p>
      {sub && <p className="text-[11px] text-[#1a1a1a]/40 mt-1.5">{sub}</p>}
      {trend && <p className="text-[11px] text-[#1a1a1a]/30 mt-0.5">{trend.label}</p>}
    </div>
  )
}

// ─── 차트 툴팁 ───────────────────────────────────────────────────
function ChartTooltip({ active, payload, label }: { active?: boolean; payload?: { value: number }[]; label?: string }) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-[#111110] text-white text-[12px] px-3 py-2 rounded-xl shadow-xl">
      <p className="text-white/50 mb-0.5">{label}</p>
      <p className="font-bold">{payload[0].value}건</p>
    </div>
  )
}

const DONUT_COLORS = ["#111110", "#4b8cf7", "#22c55e"]
const SOURCE_LABEL: Record<string, string> = {
  demo_modal: "데모 신청",
  contact_page: "문의",
  newsletter: "뉴스레터",
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

function getLast7DayLabels() {
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date()
    d.setDate(d.getDate() - (6 - i))
    return d.toLocaleDateString("ko-KR", { month: "numeric", day: "numeric" })
      .replace(" ", "").replace("월 ", "/").replace("일", "")
  })
}

export default function OverviewPage() {
  const [leads, setLeads] = useState<LeadRecord[]>([])
  const [subscriberCount, setSubscriberCount] = useState(0)
  const [blogCount, setBlogCount] = useState(0)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([
      adminFetch("/api/admin/leads").then((r) => r.json()),
      adminFetch("/api/admin/subscribers").then((r) => r.json()),
      fetch("/api/admin/blog").then((r) => r.json()),
    ]).then(([leadsData, subData, blogData]) => {
      setLeads(leadsData.leads ?? [])
      setSubscriberCount(subData.total ?? 0)
      setBlogCount((blogData.posts ?? []).length)
    }).finally(() => setLoading(false))
  }, [])

  // ─── KPI 계산 ──────────────────────────────────────────────────
  const total = leads.length
  const newLeads = leads.filter((l) => l.status === "new").length
  const converted = leads.filter((l) => l.status === "converted").length
  const convRate = total > 0 ? Math.round((converted / total) * 100) : 0

  const today = new Date()
  const todayStr = today.toDateString()
  const weekAgo = new Date(today); weekAgo.setDate(today.getDate() - 7)
  const twoWeeksAgo = new Date(today); twoWeeksAgo.setDate(today.getDate() - 14)

  const todayLeads = leads.filter((l) => new Date(l.timestamp).toDateString() === todayStr).length
  const thisWeekLeads = leads.filter((l) => new Date(l.timestamp) >= weekAgo).length
  const lastWeekLeads = leads.filter((l) => {
    const d = new Date(l.timestamp)
    return d >= twoWeeksAgo && d < weekAgo
  }).length
  const weekTrend = thisWeekLeads - lastWeekLeads

  // ─── 7일 차트 ─────────────────────────────────────────────────
  const dayLabels = getLast7DayLabels()
  const chartData = dayLabels.map((label, i) => {
    const d = new Date(); d.setDate(d.getDate() - (6 - i))
    return { label, count: leads.filter((l) => new Date(l.timestamp).toDateString() === d.toDateString()).length }
  })

  // ─── 소스 파이 ─────────────────────────────────────────────────
  const sourceMap: Record<string, number> = {}
  leads.forEach((l) => { sourceMap[l.source] = (sourceMap[l.source] ?? 0) + 1 })
  const pieData = Object.entries(sourceMap).map(([key, value]) => ({
    name: SOURCE_LABEL[key] ?? key, value,
  }))

  const recent = leads.slice(0, 6)

  return (
    <div className="px-8 pt-10 pb-20">
      {/* ── 헤더 */}
      <div className="mb-8">
        <p className="text-[11px] font-medium text-[#1a1a1a]/30 uppercase tracking-widest mb-1">Admin</p>
        <h1 className="text-2xl font-bold text-[#111110] tracking-[-0.02em]">Overview</h1>
      </div>

      {/* ── 미처리 알림 배너 */}
      {!loading && newLeads > 0 && (
        <div className="flex items-center gap-3 bg-blue-50 border border-blue-100 rounded-xl px-4 py-3 mb-6">
          <AlertCircle className="w-4 h-4 text-blue-500 shrink-0" />
          <p className="text-[13px] text-blue-700 font-medium">
            미처리 신규 리드 <span className="font-bold">{newLeads}건</span>이 대기 중입니다.
          </p>
          <a href="/admin/crm" className="ml-auto text-[12px] text-blue-500 hover:text-blue-700 font-medium flex items-center gap-1 shrink-0 transition-colors">
            CRM 바로가기 <ArrowUpRight className="w-3 h-3" />
          </a>
        </div>
      )}

      {/* ── KPI 카드 6개 */}
      {loading ? (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-8">
          {Array.from({ length: 6 }).map((_, i) => <KpiSkeleton key={i} />)}
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-8">
          <KpiCard icon={<Users className="w-4 h-4" />} label="전체 리드" value={total} sub={`오늘 +${todayLeads}`} />
          <KpiCard icon={<TrendingUp className="w-4 h-4" />} label="신규 (미처리)" value={newLeads} accent="bg-blue-50" iconColor="text-blue-500" />
          <KpiCard icon={<CheckCircle2 className="w-4 h-4" />} label="전환율" value={`${convRate}%`} sub={`전환 ${converted}건`} accent="bg-green-50" iconColor="text-green-500" />
          <KpiCard icon={<TrendingUp className="w-4 h-4" />} label="이번 주" value={thisWeekLeads} trend={{ value: weekTrend, label: "지난주 대비" }} accent="bg-purple-50" iconColor="text-purple-500" />
          <KpiCard icon={<Mail className="w-4 h-4" />} label="구독자" value={subscriberCount} sub="활성 구독자" accent="bg-orange-50" iconColor="text-orange-500" />
          <KpiCard icon={<FileText className="w-4 h-4" />} label="블로그" value={blogCount} sub="발행된 포스트" />
        </div>
      )}

      {/* ── 차트 영역 */}
      <div className="grid grid-cols-3 gap-6 mb-6">
        {/* 7일 라인차트 */}
        <div className="col-span-2 bg-white rounded-2xl border border-[#e8e8e4] p-6">
          <p className="text-[14px] font-semibold text-[#111110]">리드 유입 추이</p>
          <p className="text-[11px] text-[#1a1a1a]/40 mt-0.5 mb-5">최근 7일</p>
          {loading ? <Skeleton className="h-[180px]" /> : (
            <ResponsiveContainer width="100%" height={180}>
              <LineChart data={chartData} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0ec" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#1a1a1a", opacity: 0.4 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: "#1a1a1a", opacity: 0.4 }} axisLine={false} tickLine={false} allowDecimals={false} />
                <Tooltip content={<ChartTooltip />} cursor={{ stroke: "#e8e8e4", strokeWidth: 1 }} />
                <Line type="monotone" dataKey="count" stroke="#111110" strokeWidth={2}
                  dot={{ fill: "#111110", strokeWidth: 0, r: 3 }}
                  activeDot={{ r: 5, fill: "#111110", strokeWidth: 0 }}
                />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* 소스별 도넛차트 */}
        <div className="bg-white rounded-2xl border border-[#e8e8e4] p-6">
          <p className="text-[14px] font-semibold text-[#111110]">유입 경로</p>
          <p className="text-[11px] text-[#1a1a1a]/40 mt-0.5 mb-4">전체 기간</p>
          {loading ? <Skeleton className="h-[180px]" /> : pieData.length === 0 ? (
            <div className="flex items-center justify-center h-[180px] text-[12px] text-[#1a1a1a]/30">데이터 없음</div>
          ) : (
            <>
              <ResponsiveContainer width="100%" height={140}>
                <PieChart>
                  <Pie data={pieData} cx="50%" cy="50%" innerRadius={40} outerRadius={65} dataKey="value" strokeWidth={0}>
                    {pieData.map((_, i) => <Cell key={i} fill={DONUT_COLORS[i % DONUT_COLORS.length]} />)}
                  </Pie>
                  <Tooltip
                    formatter={(v) => [`${v ?? 0}건`, ""]}
                    contentStyle={{ border: "none", borderRadius: 12, background: "#111110", color: "#fff", fontSize: 12 }}
                  />
                </PieChart>
              </ResponsiveContainer>
              <div className="space-y-1.5 mt-2">
                {pieData.map((d, i) => (
                  <div key={i} className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full shrink-0" style={{ background: DONUT_COLORS[i % DONUT_COLORS.length] }} />
                      <span className="text-[12px] text-[#1a1a1a]/60">{d.name}</span>
                    </div>
                    <span className="text-[12px] font-medium text-[#111110]">{d.value}</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      {/* ── 최근 리드 */}
      <div className="bg-white rounded-2xl border border-[#e8e8e4] overflow-hidden">
        <div className="px-6 py-4 border-b border-[#e8e8e4] flex items-center justify-between">
          <h2 className="text-[14px] font-semibold text-[#111110]">최근 리드</h2>
          <a href="/admin/crm" className="text-[12px] text-[#1a1a1a]/40 hover:text-[#111110] transition-colors flex items-center gap-1">
            전체 보기 <ArrowUpRight className="w-3 h-3" />
          </a>
        </div>
        {loading ? (
          <div className="p-4 space-y-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3 px-2">
                <Skeleton className="w-8 h-8 rounded-full shrink-0" />
                <div className="flex-1 space-y-1.5">
                  <Skeleton className="w-32 h-3" />
                  <Skeleton className="w-20 h-2.5" />
                </div>
                <Skeleton className="w-12 h-5 rounded-full" />
              </div>
            ))}
          </div>
        ) : recent.length === 0 ? (
          <p className="text-center py-12 text-[13px] text-[#1a1a1a]/30">아직 리드가 없습니다.</p>
        ) : (
          <ul>
            {recent.map((lead) => (
              <li key={lead.id} className="flex items-center gap-4 px-6 py-3.5 border-b border-[#e8e8e4] last:border-0 hover:bg-[#fafaf8] transition-colors">
                <div className="w-8 h-8 rounded-full bg-[#f0f0ec] flex items-center justify-center text-[12px] font-semibold text-[#1a1a1a]/50 shrink-0">
                  {(lead.name ?? lead.email ?? "?")[0]?.toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-medium text-[#111110] truncate">
                    {lead.name ?? lead.email ?? "이름 없음"}
                    {lead.org && <span className="font-normal text-[#1a1a1a]/40"> · {lead.org}</span>}
                  </p>
                  <p className="text-[11px] text-[#1a1a1a]/40">{SOURCE_LABEL[lead.source] ?? lead.source}</p>
                </div>
                <span className={`text-[11px] px-2.5 py-1 rounded-full font-medium shrink-0 ${STATUS_COLOR[lead.status]}`}>
                  {STATUS_LABEL[lead.status]}
                </span>
                <p className="text-[11px] text-[#1a1a1a]/30 shrink-0 w-14 text-right">
                  {new Date(lead.timestamp).toLocaleDateString("ko-KR", { month: "2-digit", day: "2-digit" })}
                </p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
