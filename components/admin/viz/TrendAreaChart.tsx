"use client"

import { Area, AreaChart, CartesianGrid, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts"

import { GreenAreaDefs } from "./ChartTheme"
import { CHART, GRADIENT, axisTick, cursorLine, gridProps } from "./theme"

// 단일 시리즈 Area 추이 + 선택적 목표선(ReferenceLine 점선) — overview LeadTrendChart 구조를
// 재사용 가능한 형태로 일반화한 공용 래퍼. Recharts 의존이라 viz/index.ts 배럴에 넣지 않는다(번들 분리) — 직접 import.

export interface TrendAreaChartProps<Row extends object = Record<string, unknown>> {
  data: Row[]
  xKey: keyof Row & string
  yKey: keyof Row & string
  /** area stroke·fill 색 (기본: CHART.brand) */
  color?: string
  /** 목표선 y값(고정) — goalKey와 동시 지정 시 goalValue 우선 */
  goalValue?: number
  /** 목표선 y값을 data의 각 행이 아닌 별도 키에서 취할 때(예: 단일 상수 목표) */
  goalKey?: keyof Row & string
  height?: number
  /** 값 포맷 — 툴팁/목표선 라벨에 사용 */
  formatValue?: (value: number) => string
  /** Y축 틱 포맷 (기본: formatValue) */
  formatTick?: (value: number) => string
  /** 그라데이션 채움 여부 (기본: true) */
  gradient?: boolean
  /** 점(dot) 표시 여부 — overview의 7일 뷰처럼 포인트 강조가 필요할 때 */
  showDots?: boolean
}

export function TrendAreaChart<Row extends object>({
  data,
  xKey,
  yKey,
  color = CHART.brand,
  goalValue,
  goalKey,
  height = 180,
  formatValue,
  formatTick,
  gradient = true,
  showDots = false,
}: TrendAreaChartProps<Row>) {
  const goal = goalValue ?? (goalKey ? Number(data[data.length - 1]?.[goalKey] ?? 0) || undefined : undefined)

  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
        {gradient ? <GreenAreaDefs /> : null}
        <CartesianGrid {...gridProps} />
        <XAxis dataKey={xKey} tick={axisTick} axisLine={false} tickLine={false} minTickGap={24} />
        <YAxis
          tick={axisTick}
          axisLine={false}
          tickLine={false}
          allowDecimals={false}
          tickFormatter={formatTick ?? formatValue}
        />
        <Tooltip
          content={({ active, payload, label }) => {
            if (!active || !payload?.length) return null
            const value = typeof payload[0]?.value === "number" ? payload[0].value : Number(payload[0]?.value ?? 0)
            return (
              <div className="rounded-xl bg-[#111110] px-3 py-2 text-[12px] text-white shadow-xl">
                {label != null && label !== "" && <p className="mb-0.5 text-white/50">{label}</p>}
                <p className="font-bold">{formatValue ? formatValue(value) : value}</p>
              </div>
            )
          }}
          cursor={cursorLine}
        />
        <Area
          type="monotone"
          dataKey={yKey}
          stroke={color}
          strokeWidth={2}
          fill={gradient ? `url(#${GRADIENT.greenArea})` : "none"}
          dot={showDots ? { fill: color, strokeWidth: 0, r: 3 } : false}
          activeDot={{ r: 5, fill: color, strokeWidth: 0 }}
        />
        {goal != null ? (
          <ReferenceLine
            y={goal}
            stroke={CHART.danger}
            strokeDasharray="4 4"
            strokeWidth={1.5}
            label={{
              value: formatValue ? `목표 ${formatValue(goal)}` : `목표 ${goal}`,
              position: "insideTopRight",
              fontSize: 10,
              fill: CHART.danger,
            }}
          />
        ) : null}
      </AreaChart>
    </ResponsiveContainer>
  )
}
