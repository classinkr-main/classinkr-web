"use client"
import Link from "next/link"
import { TrendingUp, Users, Send, Calendar, Sparkles } from "lucide-react"
import type { BranchSummaryResponse } from "../types"
import { cny } from "@/lib/branch/money-format"

function metricLabel(metric: string | null | undefined): string {
  if (!metric) return "-"
  return metric.toUpperCase()
}

type Tone = "green" | "olive" | "amber" | "red" | "neutral"

const TONE: Record<Tone, { bg: string; fg: string }> = {
  green:   { bg: "#ECFDF5", fg: "#084734" },
  olive:   { bg: "#F1F4DE", fg: "#7B8B36" },
  amber:   { bg: "#FBF1E0", fg: "#A8741A" },
  red:     { bg: "#FCE9E9", fg: "#B43E3E" },
  neutral: { bg: "#F6F5F4", fg: "#111110" },
}

function StatCard({ icon, label, value, sub, tone = "neutral", link }: { icon: React.ReactNode; label: string; value: string; sub: string; tone?: Tone; link?: { href: string; label: string } }) {
  const t = TONE[tone]
  return (
    <div className="rounded-xl border border-[rgba(0,0,0,0.08)] bg-white p-[18px] shadow-[0_1px_2px_rgba(0,0,0,0.02)]">
      <div className="flex items-start gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[9px]" style={{ background: t.bg, color: t.fg }}>
          {icon}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-semibold tracking-[0.02em] text-[#615D59]">{label}</p>
          <p className="mt-1 text-[24px] font-bold leading-[1.05] tracking-[-0.02em] text-[#111110]">{value}</p>
          <p className="mt-1 text-[11px] text-[#615D59]">{sub}</p>
          {link && (
            <Link href={link.href} className="mt-1 inline-block text-[11px] font-semibold text-[#084734] underline-offset-2 hover:underline">
              {link.label}
            </Link>
          )}
        </div>
      </div>
    </div>
  )
}

export default function CoreKpiGrid({ data, loading, error }: { data: BranchSummaryResponse | null; loading: boolean; error: string | null }) {
  if (error) return <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-[12px] text-rose-700">{error}</div>
  if (loading || !data) return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
      {Array.from({length:5}).map((_,i) => <div key={i} className="h-[92px] animate-pulse rounded-xl bg-[#f0f0ec]"/>)}
    </div>
  )
  return (
    <section>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <StatCard tone="green" icon={<TrendingUp className="h-[18px] w-[18px]" />}
          label="총 매출 (확정)" value={`¥${cny(data.revenue.confirmed)}`}
          sub={`목표 ¥${cny(data.revenue.goal)} · ${data.revenue.pacing_pct.toFixed(0)}%`}
          link={{ href: "/admin/branch/ledger?lens=rev", label: "장부에서 열기 ↗" }} />
        <StatCard tone="amber" icon={<Sparkles className="h-[18px] w-[18px]" />}
          label="활동 KPI 병목" value={metricLabel(data.bottleneck.metric)}
          sub={`${data.bottleneck.pct.toFixed(0)}% · ${data.bottleneck.worst_member ?? "-"}`} />
        <StatCard tone="olive" icon={<Users className="h-[18px] w-[18px]" />}
          label="가까운 딜" value={`${data.closing.count}건`}
          sub={`목표 합 ¥${cny(data.closing.total_target)}`} />
        <StatCard tone="red" icon={<Calendar className="h-[18px] w-[18px]" />}
          label="행사 (30일)" value={`${data.events_30d.count}건`}
          sub={`지역 ${data.events_30d.regions}개`} />
        <StatCard tone="green" icon={<Send className="h-[18px] w-[18px]" />}
          label="캠페인 성과" value={`${data.campaigns_30d.count}건`}
          sub={`평균 오픈율 ${data.campaigns_30d.avg_open_pct.toFixed(0)}%`} />
      </div>
    </section>
  )
}
