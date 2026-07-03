"use client"

import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts"

import { CHART } from "./theme"

// 수평 랭킹 바 — CPL 분포·팀/개인 매출 랭킹처럼 "항목별 크기 비교"에 쓰는 공용 래퍼.
// 행별 색은 cellColor 콜백으로(중앙값 초과 강조 등). Recharts 의존이라 배럴 미포함 — 직접 import.

export interface RankedHorizontalBarsProps<Row extends object> {
  rows: Row[]
  labelKey: keyof Row & string
  valueKey: keyof Row & string
  /** 시리즈 이름(툴팁 표기) */
  name?: string
  formatValue?: (value: number) => string
  /** 행별 바 색 (기본: 브랜드 그린) */
  cellColor?: (row: Row) => string
  height?: number
  barSize?: number
  labelWidth?: number
  /** 툴팁 라벨(예: 잘린 이름 → 전체명) */
  labelFormatter?: (label: unknown, payload: ReadonlyArray<{ payload?: unknown }>) => string
}

const DARK_TOOLTIP_STYLE = {
  backgroundColor: CHART.tooltipBg,
  border: "none",
  borderRadius: 12,
  color: "white",
  fontSize: 12,
} as const

export function RankedHorizontalBars<Row extends object>({
  rows,
  labelKey,
  valueKey,
  name = "값",
  formatValue,
  cellColor,
  height = 260,
  barSize = 22,
  labelWidth = 92,
  labelFormatter,
}: RankedHorizontalBarsProps<Row>) {
  return (
    <div className="w-full" style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={rows} layout="vertical" margin={{ top: 4, right: 12, bottom: 4, left: 4 }}>
          <CartesianGrid stroke={CHART.grid} horizontal={false} />
          <XAxis
            type="number"
            fontSize={11}
            stroke={CHART.warmGray}
            tickLine={false}
            tickFormatter={formatValue}
          />
          <YAxis
            type="category"
            dataKey={labelKey}
            width={labelWidth}
            fontSize={11}
            stroke={CHART.warmGray}
            tickLine={false}
            interval={0}
          />
          <Tooltip
            cursor={{ fill: "rgba(8,71,52,0.04)" }}
            contentStyle={DARK_TOOLTIP_STYLE}
            labelFormatter={labelFormatter}
            formatter={(value) => {
              const numeric = typeof value === "number" ? value : Number(value ?? 0)
              return [formatValue ? formatValue(numeric) : numeric.toLocaleString("ko-KR"), name]
            }}
          />
          <Bar dataKey={valueKey} name={name} radius={[0, 4, 4, 0]} maxBarSize={barSize}>
            {rows.map((row, index) => (
              <Cell key={index} fill={cellColor ? cellColor(row) : CHART.brand} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
