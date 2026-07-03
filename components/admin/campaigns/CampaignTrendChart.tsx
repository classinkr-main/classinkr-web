"use client"

import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"
import { CHART, gridProps } from "../viz/theme"

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

const SERIES_LABEL: Record<string, string> = {
  revenue: "매출",
  spend: "광고비",
  leads: "리드",
}

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
        <div className="h-[240px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart
              data={data}
              margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
            >
              <CartesianGrid {...gridProps} />
              <XAxis
                dataKey="month"
                fontSize={11}
                stroke={CHART.warmGray}
                tickLine={false}
              />
              <YAxis
                yAxisId="left"
                fontSize={11}
                stroke={CHART.warmGray}
                tickLine={false}
                width={52}
                tickFormatter={(value: number) => KRW_COMPACT.format(value)}
              />
              <YAxis
                yAxisId="right"
                orientation="right"
                fontSize={11}
                stroke={CHART.warmGray}
                tickLine={false}
                width={36}
                tickFormatter={(value: number) => KRW.format(value)}
              />
              <Tooltip
                formatter={(value: number | string | undefined, name) => {
                  const numeric = typeof value === "number" ? value : Number(value ?? 0)
                  const key = String(name)
                  const label = SERIES_LABEL[key] ?? key
                  if (key === "leads") {
                    return [count(numeric), label]
                  }
                  return [won(numeric), label]
                }}
                contentStyle={{
                  backgroundColor: CHART.tooltipBg,
                  border: "none",
                  borderRadius: 12,
                  color: "white",
                  fontSize: 12,
                }}
                cursor={{ fill: "rgba(17,17,16,0.04)" }}
              />
              <Legend
                iconType="circle"
                iconSize={8}
                formatter={(value: string) => (
                  <span className="text-[11px] text-[#1a1a1a]/55">
                    {SERIES_LABEL[value] ?? value}
                  </span>
                )}
                wrapperStyle={{ paddingTop: 8 }}
              />
              <Bar
                yAxisId="left"
                dataKey="revenue"
                name="revenue"
                fill={CHART.brand}
                radius={[4, 4, 0, 0]}
                maxBarSize={28}
              />
              <Bar
                yAxisId="left"
                dataKey="spend"
                name="spend"
                fill={CHART.danger}
                radius={[4, 4, 0, 0]}
                maxBarSize={28}
              />
              <Line
                yAxisId="right"
                type="monotone"
                dataKey="leads"
                name="leads"
                stroke={CHART.neutral}
                strokeWidth={2}
                dot={{ r: 3, fill: CHART.neutral, strokeWidth: 0 }}
                activeDot={{ r: 4 }}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <div className="flex h-[240px] w-full items-center justify-center rounded-xl bg-[#fafaf8] text-[12px] text-[#1a1a1a]/40">
          표시할 데이터가 없습니다.
        </div>
      )}
    </section>
  )
}
