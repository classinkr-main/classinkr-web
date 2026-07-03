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

import { CHART, gridProps } from "./theme"

// 이중축 Bar(≤2, 좌축) + Line(우축) 콤보 — campaigns 월별 추이/광고비 vs 리드처럼
// "금액 막대 + 건수 선" 비교에 쓰는 공용 래퍼. 다크 툴팁·그리드·축 스타일은 viz 토큰 고정.
// Recharts 의존이므로 viz/index.ts 배럴에 넣지 않는다(번들 분리) — 직접 import.

export interface ComparisonBarSeries {
  key: string
  label: string
  color: string
  /** 툴팁 값 포맷 (기본: 천단위 수) */
  formatValue?: (value: number) => string
}

export interface ComparisonBarChartProps<Row extends object = Record<string, unknown>> {
  data: Row[]
  xKey: string
  /** 좌축 막대 시리즈 (최대 2개 권장) */
  bars: ComparisonBarSeries[]
  /** 우축 선 시리즈 */
  line?: ComparisonBarSeries
  height?: number
  maxBarSize?: number
  formatLeftTick?: (value: number) => string
  formatRightTick?: (value: number) => string
  /** 툴팁 라벨(예: 잘린 캠페인명 → 전체명) */
  labelFormatter?: (label: unknown, payload: ReadonlyArray<{ payload?: unknown }>) => string
  showLegend?: boolean
  /** 커서 하이라이트 색 (기본: 잉크 4%) */
  cursorFill?: string
}

const DARK_TOOLTIP_STYLE = {
  backgroundColor: CHART.tooltipBg,
  border: "none",
  borderRadius: 12,
  color: "white",
  fontSize: 12,
} as const

const COUNT = new Intl.NumberFormat("ko-KR")

export function ComparisonBarChart<Row extends object>({
  data,
  xKey,
  bars,
  line,
  height = 240,
  maxBarSize = 28,
  formatLeftTick,
  formatRightTick,
  labelFormatter,
  showLegend = false,
  cursorFill = "rgba(17,17,16,0.04)",
}: ComparisonBarChartProps<Row>) {
  const seriesByName = new Map<string, ComparisonBarSeries>([
    ...bars.map((series) => [series.label, series] as const),
    ...(line ? [[line.label, line] as const] : []),
  ])

  return (
    <div className="w-full" style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid {...gridProps} />
          <XAxis dataKey={xKey} fontSize={11} stroke={CHART.warmGray} tickLine={false} interval={0} />
          <YAxis
            yAxisId="left"
            fontSize={11}
            stroke={CHART.warmGray}
            tickLine={false}
            width={52}
            tickFormatter={formatLeftTick}
          />
          {line ? (
            <YAxis
              yAxisId="right"
              orientation="right"
              fontSize={11}
              stroke={CHART.warmGray}
              tickLine={false}
              width={36}
              allowDecimals={false}
              tickFormatter={formatRightTick}
            />
          ) : null}
          <Tooltip
            cursor={{ fill: cursorFill }}
            contentStyle={DARK_TOOLTIP_STYLE}
            labelFormatter={labelFormatter}
            formatter={(value, name) => {
              const numeric = typeof value === "number" ? value : Number(value ?? 0)
              const series = seriesByName.get(String(name))
              return [series?.formatValue ? series.formatValue(numeric) : COUNT.format(numeric), String(name)]
            }}
          />
          {showLegend ? (
            <Legend
              iconType="circle"
              iconSize={8}
              formatter={(value: string) => <span className="text-[11px] text-[#1a1a1a]/55">{value}</span>}
              wrapperStyle={{ paddingTop: 8 }}
            />
          ) : null}
          {bars.map((series) => (
            <Bar
              key={series.key}
              yAxisId="left"
              dataKey={series.key}
              name={series.label}
              fill={series.color}
              radius={[4, 4, 0, 0]}
              maxBarSize={maxBarSize}
            />
          ))}
          {line ? (
            <Line
              yAxisId="right"
              type="monotone"
              dataKey={line.key}
              name={line.label}
              stroke={line.color}
              strokeWidth={2}
              dot={{ r: 3, fill: line.color, strokeWidth: 0 }}
              activeDot={{ r: 4 }}
            />
          ) : null}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  )
}
