"use client"

import { CHART } from "../viz/theme"
import { ComparisonBarChart } from "../viz/ComparisonBarChart"

const KRW_CURRENCY = new Intl.NumberFormat("ko-KR", {
  style: "currency",
  currency: "KRW",
  maximumFractionDigits: 0,
})

const KRW = new Intl.NumberFormat("ko-KR")

const KRW_COMPACT = new Intl.NumberFormat("ko-KR", {
  notation: "compact",
  maximumFractionDigits: 1,
})

function won(value: number | null | undefined) {
  return value == null ? "—" : KRW_CURRENCY.format(Math.round(value))
}

function count(value: number | null | undefined) {
  return value == null ? "—" : KRW.format(Math.round(value))
}

export interface TrendPoint {
  month: string
  leads: number
  revenue: number
  spend: number
}

export interface CampaignTrendChartProps {
  data: TrendPoint[]
}

// 월별 매출·광고비(막대) + 리드(선) — 차트 본체는 공용 ComparisonBarChart(viz) 사용.
export function CampaignTrendChart({ data }: CampaignTrendChartProps) {
  const hasData = data.length >= 1

  return (
    <section className="rounded-2xl border border-[#e8e8e4] bg-white p-4 sm:p-5">
      <header className="mb-4 flex flex-col gap-0.5">
        <h2 className="text-[14px] font-semibold text-[#111110]">월별 추이</h2>
        <p className="text-[11px] text-[#1a1a1a]/45">
          매출·광고비(막대) 및 리드(선)
        </p>
      </header>

      {hasData ? (
        <ComparisonBarChart
          data={data}
          xKey="month"
          bars={[
            { key: "revenue", label: "매출", color: CHART.brand, formatValue: (v) => won(v) },
            { key: "spend", label: "광고비", color: CHART.danger, formatValue: (v) => won(v) },
          ]}
          line={{ key: "leads", label: "리드", color: CHART.neutral, formatValue: (v) => count(v) }}
          height={240}
          formatLeftTick={(value) => KRW_COMPACT.format(value)}
          formatRightTick={(value) => KRW.format(value)}
          showLegend
        />
      ) : (
        <div className="flex h-[240px] w-full items-center justify-center rounded-xl bg-[#fafaf8] text-[12px] text-[#1a1a1a]/40">
          표시할 데이터가 없습니다.
        </div>
      )}
    </section>
  )
}
