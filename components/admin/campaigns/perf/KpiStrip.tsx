"use client"

import { ArrowDownRight, ArrowUpRight, Gauge, Minus, Target, TrendingUp, Users, Wallet } from "lucide-react"
import { StatTile } from "@/components/admin/viz"
import { money } from "@/components/admin/campaigns/event-format"
import type { MarketingPerfResponse, PerfKpi } from "@/lib/marketing/perf"

// 퍼포먼스 대시보드 KPI 스트립 5칸 — perf 응답의 kpis 조각만 받아 그리는 표시 컴포넌트.
// 통화 분리 엄수: USD 지표(광고비·CPL)에 ₩ 금지, budgetExecutionPct 는 % 값(KRW "축"일 뿐 통화 기호 금지).
// 값/델타는 전부 null 가능 — null 은 "—" 로 정직 표기하고 0 으로 지어내지 않는다.

const COUNT = new Intl.NumberFormat("ko-KR")
const PCT1 = new Intl.NumberFormat("ko-KR", { maximumFractionDigits: 1 })

// 지표 방향 — 델타 색이 "좋아짐/나빠짐"을 말한다. CPL 은 감소=좋음, 광고비는 방향 가치판단 없음(중립).
type DeltaValence = "up-good" | "down-good" | "none"

function DeltaHint({ kpi, valence }: { kpi: PerfKpi; valence: DeltaValence }) {
  // 델타 라벨은 항상 "이전 기간 대비"(직전 동일 길이) — quarter 에서도 거짓말이 되지 않는 표현.
  const title = "이전 기간(직전 동일 길이) 대비"
  if (kpi.deltaPct == null) {
    return (
      <span title={title} className="text-[#1a1a1a]/35">
        이전 기간 대비 —
      </span>
    )
  }
  const improved =
    valence === "none" ? null : valence === "up-good" ? kpi.deltaPct > 0 : kpi.deltaPct < 0
  const toneClass =
    kpi.deltaPct === 0 || improved == null
      ? "text-[#1a1a1a]/55"
      : improved
        ? "text-[#084734]"
        : "text-[#B85C33]"
  const Icon = kpi.deltaPct === 0 ? Minus : kpi.deltaPct > 0 ? ArrowUpRight : ArrowDownRight
  return (
    <span title={title} className="inline-flex items-center gap-1">
      <span className="text-[#1a1a1a]/40">이전 기간 대비</span>
      <span className={`inline-flex items-center gap-0.5 font-semibold tabular-nums ${toneClass}`}>
        <Icon className="h-3 w-3" />
        {kpi.deltaPct > 0 ? "+" : ""}
        {kpi.deltaPct}%
      </span>
    </span>
  )
}

export function KpiStrip({ kpis }: { kpis: MarketingPerfResponse["kpis"] }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
      <StatTile
        compact
        icon={<Wallet className="h-3.5 w-3.5" />}
        label="광고비 · Meta USD"
        value={kpis.spendUsd.value != null ? money(kpis.spendUsd.value, "USD") : "—"}
        hint={<DeltaHint kpi={kpis.spendUsd} valence="none" />}
      />
      <StatTile
        compact
        icon={<Users className="h-3.5 w-3.5" />}
        label="리드"
        value={kpis.leads.value != null ? COUNT.format(kpis.leads.value) : "—"}
        hint={<DeltaHint kpi={kpis.leads} valence="up-good" />}
        tone="brand"
      />
      <StatTile
        compact
        icon={<Target className="h-3.5 w-3.5" />}
        label="CPL 실측 · USD"
        value={kpis.cplUsd.value != null ? money(kpis.cplUsd.value, "USD") : "—"}
        hint={<DeltaHint kpi={kpis.cplUsd} valence="down-good" />}
      />
      <StatTile
        compact
        icon={<TrendingUp className="h-3.5 w-3.5" />}
        label="리드 전환율"
        value={
          kpis.leadConversionRate.value != null
            ? `${PCT1.format(kpis.leadConversionRate.value)}%`
            : "—"
        }
        hint={
          <span className="inline-flex flex-wrap items-center gap-x-1.5">
            <DeltaHint kpi={kpis.leadConversionRate} valence="up-good" />
            <span className="text-[#1a1a1a]/35">광고 리드 기준</span>
          </span>
        }
      />
      <StatTile
        compact
        icon={<Gauge className="h-3.5 w-3.5" />}
        label="예산 집행률 · KRW 축"
        value={
          kpis.budgetExecutionPct.value != null
            ? `${PCT1.format(kpis.budgetExecutionPct.value)}%`
            : "—"
        }
        // 배정·집행이 기간 개념 없는 수기 누적값이라 delta 는 계약상 항상 null — 비교를 시도하지 않는다.
        hint="KRW 배정 대비 수기 집행 · 기간 비교 없음"
      />
    </div>
  )
}
