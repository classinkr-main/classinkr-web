"use client"

import {
  Bar,
  CartesianGrid,
  Cell,
  ComposedChart,
  Legend,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"

import { ChartTooltip } from "./ChartTheme"
import { CHART, axisTick, cursorLine, gridProps } from "./theme"

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
  /** 단일 막대 시리즈(bars[0])에 행별 색 적용 — 이번 달 강조 등. bars가 2개 이상이면 무시. */
  cellColor?: (row: Row, index: number) => string
  /** 목표선(점선) y값 — 없으면 미표시 */
  goalValue?: number
  formatGoalLabel?: (value: number) => string
  /**
   * 툴팁 스타일 — "dark"(기본, campaigns 등): 잉크 배경 커스텀 툴팁 + stroke 축.
   * "light": 기존 CRM 매출 추이 차트와 동일한 흰 배경 ChartTooltip + axisTick(무테두리) 스타일.
   * light에서는 line/showLegend 미지원(단일 막대 시리즈 전용 시각 보존 목적).
   */
  tooltipVariant?: "dark" | "light"
  /** ComposedChart 좌측 여백 — light variant 기존 시각(-8) 보존용 */
  leftMargin?: number
  /** 좌축(bars) domain — 목표선이 항상 보이도록 상한 확보 등 */
  leftDomain?: [number, number]
  /**
   * 등장 애니메이션 on/off (기본 true — 기존 소비처 시각 보존).
   * 숨김 탭/백그라운드 마운트에서 Recharts rAF가 멈춰 애니메이션 0~2% 프레임(막대 높이 1px
   * 미만)에 얼어붙는 사례가 실측됐다 — 즉시 판독이 중요한 지표 대시보드는 false로 끈다.
   * 공용 컴포넌트라 여기 하드코딩하지 않고 소비처가 선택한다.
   */
  animate?: boolean
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
  cellColor,
  goalValue,
  formatGoalLabel,
  tooltipVariant = "dark",
  leftMargin = 0,
  leftDomain,
  animate = true,
}: ComparisonBarChartProps<Row>) {
  const isLight = tooltipVariant === "light"
  const seriesByName = new Map<string, ComparisonBarSeries>([
    ...bars.map((series) => [series.label, series] as const),
    ...(line ? [[line.label, line] as const] : []),
  ])

  return (
    <div className="w-full" style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{ top: 8, right: 8, left: leftMargin, bottom: 0 }}>
          <CartesianGrid {...gridProps} />
          <XAxis
            dataKey={xKey}
            tickLine={false}
            interval={0}
            {...(isLight ? { tick: axisTick, axisLine: false } : { fontSize: 11, stroke: CHART.warmGray })}
          />
          <YAxis
            yAxisId="left"
            tickLine={false}
            width={52}
            tickFormatter={formatLeftTick}
            domain={leftDomain}
            {...(isLight ? { tick: axisTick, axisLine: false } : { fontSize: 11, stroke: CHART.warmGray })}
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
          {isLight ? (
            <Tooltip content={<ChartTooltip suffix="" />} cursor={cursorLine} />
          ) : (
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
          )}
          {showLegend ? (
            <Legend
              iconType="circle"
              iconSize={8}
              formatter={(value: string) => <span className="text-[11px] text-[#1a1a1a]/55">{value}</span>}
              wrapperStyle={{ paddingTop: 8 }}
            />
          ) : null}
          {bars.map((series, seriesIndex) => (
            <Bar
              key={series.key}
              yAxisId="left"
              dataKey={series.key}
              name={series.label}
              fill={series.color}
              radius={[4, 4, 0, 0]}
              maxBarSize={maxBarSize}
              isAnimationActive={animate}
            >
              {cellColor && seriesIndex === 0
                ? data.map((row, index) => <Cell key={index} fill={cellColor(row, index)} />)
                : null}
            </Bar>
          ))}
          {goalValue != null ? (
            <ReferenceLine
              yAxisId="left"
              y={goalValue}
              stroke={CHART.danger}
              strokeDasharray="4 4"
              strokeWidth={1.5}
              label={{
                value: formatGoalLabel ? formatGoalLabel(goalValue) : `목표 ${goalValue}`,
                position: "insideTopRight",
                fontSize: 10,
                fill: CHART.danger,
              }}
            />
          ) : null}
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
              isAnimationActive={animate}
            />
          ) : null}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  )
}
