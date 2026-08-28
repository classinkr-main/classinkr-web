"use client"
import Link from "next/link"
import { TrendingUp, Users, Send, Calendar, Sparkles } from "lucide-react"
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
const TONE: Record<Tone, { bg: string; fg: string }> = {
  green:   { bg: "#ECFDF5", fg: "#084734" },
  amber:   { bg: "#FBF1E0", fg: "#A8741A" },
  red:     { bg: "#FCE9E9", fg: "#B43E3E" },
  neutral: { bg: "#F6F5F4", fg: "#111110" },
}

function StatCard({ icon, label, value, sub, tone = "neutral", link }: { icon: React.ReactNode; label: string; value: React.ReactNode; sub: React.ReactNode; tone?: Tone; link?: { href: string; label: string } }) {
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
            <Link href={link.href} className="mt-1 inline-flex min-h-11 min-w-11 items-center justify-center text-[11px] font-semibold text-[#084734] underline-offset-2 hover:underline md:min-h-0 md:min-w-0 md:justify-start">
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
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-5">
      {Array.from({length:5}).map((_,i) => <div key={i} className="h-[92px] animate-pulse rounded-xl bg-[#f0f0ec]"/>)}
    </div>
  )
  if (!data) return (
    <div role="status" className="rounded-xl border border-[rgba(0,0,0,0.08)] bg-white p-4 text-[12px] text-[#615D59]">
      표시할 KPI 데이터가 없습니다.
    </div>
  )
  return (
    <section>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-5">
        {/* 목표·달성률은 아래 BranchHeroGauges가 유일한 '목표 대비' 표면이라 여기선 확정
            매출 절대값만 보여준다(항목 2 — 같은 수치가 개요에서 3번 반복되던 것 정리). */}
        <StatCard tone="green" icon={<TrendingUp className="h-[18px] w-[18px]" />}
          label="총 매출 (확정)" value={<MoneyValue value={data.revenue.confirmed} />}
          sub="목표 대비는 아래 게이지 참고"
          link={{ href: "/admin/branch/ledger?lens=rev", label: "장부에서 열기 ↗" }} />
        <StatCard tone="amber" icon={<Sparkles className="h-[18px] w-[18px]" />}
          label="활동 KPI 병목" value={metricLabel(data.bottleneck.metric)}
          sub={`${data.bottleneck.pct.toFixed(0)}% · ${data.bottleneck.worst_member ?? "-"}`} />
        <StatCard tone="neutral" icon={<Users className="h-[18px] w-[18px]" />}
          label="가까운 딜" value={`${data.closing.count}건`}
          sub={<>목표 합 <MoneyValue value={data.closing.total_target} /></>} />
        {/* 품질 웨이브 4 — 항목 5. 행사 건수는 상태(정상/부족/위험) 의미가 없는 단순 카운트라
            Danger 톤(빨강)은 장식 오용이었다 — 뉴트럴로 정리. */}
        <StatCard tone="neutral" icon={<Calendar className="h-[18px] w-[18px]" />}
          label="행사 (30일)" value={`${data.events_30d.count}건`}
          sub={`지역 ${data.events_30d.regions}개`} />
        <StatCard tone="green" icon={<Send className="h-[18px] w-[18px]" />}
          label="캠페인 성과" value={`${data.campaigns_30d.count}건`}
          sub={`평균 오픈율 ${data.campaigns_30d.avg_open_pct.toFixed(0)}%`} />
      </div>
    </section>
  )
}
