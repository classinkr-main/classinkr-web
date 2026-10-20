"use client"
import Link from "next/link"
import { Users, Send, Calendar, Sparkles } from "lucide-react"
import type { BranchSummaryResponse } from "../types"
import MoneyValue from "../MoneyValue"

function metricLabel(metric: string | null | undefined): string {
  if (!metric) return "-"
  return metric.toUpperCase()
}

type Tone = "green" | "amber" | "red" | "neutral"

// 팀 아이덴티티 올리브(#7B8B36)는 여기서 쓰지 않는다 — "가까운 딜" 카드는 팀도
// 상태 등급도 아닌 순수 장식 구분이라 웜 뉴트럴로 정리했다(2026-07-17,
// lib/branch/team-colors.ts SSOT 도입과 함께 오용 제거).
const TONE: Record<Tone, { bg: string; fg: string; border: string; shadow: string }> = {
  green: {
    bg: "linear-gradient(180deg, #F2FAF6 0%, #E3F5EC 100%)",
    fg: "#084734",
    border: "1px solid rgba(8,71,52,0.15)",
    shadow: "0 1px 2px rgba(8,71,52,0.06), inset 0 1px 0 rgba(255,255,255,0.8)",
  },
  amber: {
    bg: "linear-gradient(180deg, #FDF7ED 0%, #F8EEDB 100%)",
    fg: "#A8741A",
    border: "1px solid rgba(168,116,26,0.18)",
    shadow: "0 1px 2px rgba(168,116,26,0.06), inset 0 1px 0 rgba(255,255,255,0.8)",
  },
  red: {
    bg: "linear-gradient(180deg, #FDF2F2 0%, #F9E2E2 100%)",
    fg: "#B43E3E",
    border: "1px solid rgba(180,62,62,0.18)",
    shadow: "0 1px 2px rgba(180,62,62,0.06), inset 0 1px 0 rgba(255,255,255,0.8)",
  },
  neutral: {
    bg: "linear-gradient(180deg, #FAF9F8 0%, #EFECE9 100%)",
    fg: "#111110",
    border: "1px solid rgba(0,0,0,0.06)",
    shadow: "0 1px 2px rgba(0,0,0,0.04), inset 0 1px 0 rgba(255,255,255,0.8)",
  },
}

function StatCard({ icon, label, value, sub, tone = "neutral", link }: { icon: React.ReactNode; label: string; value: React.ReactNode; sub: React.ReactNode; tone?: Tone; link?: { href: string; label: string } }) {
  const t = TONE[tone]
  return (
    <div className="rounded-xl border border-[rgba(0,0,0,0.08)] bg-white px-3.5 py-3 shadow-[0_1px_2px_rgba(0,0,0,0.02)]">
      <div className="flex items-start gap-2.5">
        <div
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg"
          style={{ background: t.bg, color: t.fg, border: t.border, boxShadow: t.shadow }}
        >
          {icon}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-semibold tracking-[0.01em] text-[#615D59]">{label}</p>
          <p className="mt-0.5 text-[18px] font-bold leading-tight tracking-[-0.01em] text-[#111110] sm:text-[20px]">{value}</p>
          <p className="mt-0.5 text-[11px] text-[#615D59]">{sub}</p>
          {link && (
            <Link href={link.href} className="mt-1 inline-flex min-h-8 min-w-8 items-center justify-center text-[11px] font-semibold text-[#084734] underline-offset-2 hover:underline md:min-h-0 md:min-w-0 md:justify-start">
              {link.label}
            </Link>
          )}
        </div>
      </div>
    </div>
  )
}

export default function CoreKpiGrid({ data, loading, error }: { data: BranchSummaryResponse | null; loading: boolean; error: string | null }) {
  if (error && !data) return <div role="alert" className="rounded-2xl border border-[#F2B8B8] bg-[#FCE9E9] p-4 text-[12px] text-[#B43E3E]">{error}</div>
  if (loading && !data) return (
    <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 xl:grid-cols-4">
      {Array.from({length:4}).map((_,i) => <div key={i} className="h-[68px] animate-pulse rounded-xl bg-[#f0f0ec]"/>)}
    </div>
  )
  if (!data) return (
    <div role="status" className="rounded-xl border border-[rgba(0,0,0,0.08)] bg-white p-3.5 text-[12px] text-[#615D59]">
      표시할 KPI 데이터가 없습니다.
    </div>
  )
  return (
    <section aria-label="보조 운영 지표">
      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 xl:grid-cols-4">
        {/* 매출과 목표는 위 매출 요약에서 한 번 보여준다. 이 줄은 보조 운영 지표다. */}
        <StatCard tone="amber" icon={<Sparkles className="h-4 w-4" />}
          label="시트 영업 KPI 병목" value={metricLabel(data.bottleneck.metric)}
          sub={`${data.bottleneck.pct.toFixed(0)}% · ${data.bottleneck.worst_member ?? "-"}`} />
        <StatCard tone="neutral" icon={<Users className="h-4 w-4" />}
          label="가까운 딜" value={`${data.closing.count}건`}
          sub={<>목표 합 <MoneyValue value={data.closing.total_target} /></>} />
        {/* 품질 웨이브 4 — 항목 5. 행사 건수는 상태(정상/부족/위험) 의미가 없는 단순 카운트라
            Danger 톤(빨강)은 장식 오용이었다 — 뉴트럴로 정리. */}
        <StatCard tone="neutral" icon={<Calendar className="h-4 w-4" />}
          label="전사 공용 행사 (30일)" value={`${data.events_30d.count}건`}
          sub={`지역 ${data.events_30d.regions}개`} />
        <StatCard tone="green" icon={<Send className="h-4 w-4" />}
          label="전사 공용 캠페인 성과" value={`${data.campaigns_30d.count}건`}
          sub={`평균 오픈율 ${data.campaigns_30d.avg_open_pct.toFixed(0)}%`} />
      </div>
    </section>
  )
}
