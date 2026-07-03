"use client"

import { useMemo } from "react"
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"
import { CHART } from "../viz/theme"

const KRW = new Intl.NumberFormat("ko-KR")
const KRW_CURRENCY = new Intl.NumberFormat("ko-KR", {
  style: "currency",
  currency: "KRW",
  maximumFractionDigits: 0,
})
const KRW_COMPACT = new Intl.NumberFormat("ko-KR", {
  style: "currency",
  currency: "KRW",
  notation: "compact",
  maximumFractionDigits: 1,
})

const won = (n: number | null | undefined) =>
  n == null ? "—" : KRW_CURRENCY.format(Math.round(n))
const wonCompact = (n: number | null | undefined) =>
  n == null ? "—" : KRW_COMPACT.format(Math.round(n))
const count = (n: number | null | undefined) => (n == null ? "—" : KRW.format(n))

export interface ChannelEfficiencyRow {
  channel: string
  label: string
  color: string
  spend: number
  leads: number
  cpl: number | null
}

export interface ChannelEfficiencyChartProps {
  data: ChannelEfficiencyRow[]
}

interface ChartDatum {
  channel: string
  label: string
  color: string
  spend: number
  leads: number
  cpl: number
}

function EfficiencyTooltip({
  active,
  payload,
}: {
  active?: boolean
  payload?: Array<{ payload?: ChartDatum }>
}) {
  if (!active || !payload?.length) return null
  const row = payload[0]?.payload
  if (!row) return null
  return (
    <div
      style={{
        backgroundColor: CHART.tooltipBg,
        border: "none",
        borderRadius: 12,
        color: "white",
        fontSize: 12,
        padding: "10px 12px",
      }}
    >
      <p className="mb-1 font-semibold">{row.label}</p>
      <p className="tabular-nums">CPL · {won(row.cpl)}</p>
      <p className="tabular-nums opacity-70">광고비 · {won(row.spend)}</p>
      <p className="tabular-nums opacity-70">리드 · {count(row.leads)}</p>
    </div>
  )
}

export function ChannelEfficiencyChart({ data }: ChannelEfficiencyChartProps) {
  const hasSpend = useMemo(() => data.some((row) => row.spend > 0), [data])

  // Ranked list: ascending by CPL, nulls last.
  const ranked = useMemo(() => {
    return [...data].sort((a, b) => {
      if (a.cpl == null && b.cpl == null) return 0
      if (a.cpl == null) return 1
      if (b.cpl == null) return -1
      return a.cpl - b.cpl
    })
  }, [data])

  // Chartable rows: cpl != null and leads > 0, ascending by CPL.
  const chartData = useMemo<ChartDatum[]>(() => {
    return data
      .filter(
        (row): row is ChannelEfficiencyRow & { cpl: number } =>
          row.cpl != null && row.leads > 0,
      )
      .map((row) => ({
        channel: row.channel,
        label: row.label,
        color: row.color,
        spend: row.spend,
        leads: row.leads,
        cpl: row.cpl,
      }))
      .sort((a, b) => a.cpl - b.cpl)
  }, [data])

  const bestCpl = useMemo(() => {
    const values = data
      .filter((row) => row.cpl != null && row.leads > 0)
      .map((row) => row.cpl as number)
    return values.length > 0 ? Math.min(...values) : null
  }, [data])

  const best = useMemo(
    () =>
      bestCpl != null
        ? (data.find((row) => row.cpl === bestCpl && row.leads > 0) ?? null)
        : null,
    [data, bestCpl],
  )

  return (
    <div className="rounded-2xl border border-[#e8e8e4] bg-white p-4 sm:p-5">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h2 className="text-[14px] font-semibold text-[#111110]">채널별 효율</h2>
          <p className="mt-0.5 text-[11px] text-[#1a1a1a]/45">
            리드당 비용(CPL) 비교 · 낮을수록 효율적
          </p>
        </div>
      </div>

      {!hasSpend ? (
        <div className="flex min-h-[160px] flex-col items-center justify-center rounded-xl bg-[#fafaf8] px-4 py-10 text-center">
          <p className="text-[12px] text-[#1a1a1a]/40">표시할 데이터가 없습니다.</p>
          <p className="mt-1 text-[11px] text-[#1a1a1a]/30">
            광고비가 집계된 채널이 없습니다.
          </p>
        </div>
      ) : (
        <>
          {chartData.length > 0 ? (
            <div className="h-[220px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={chartData}
                  layout="vertical"
                  margin={{ left: 4, right: 16, top: 4, bottom: 4 }}
                >
                  <CartesianGrid stroke={CHART.grid} horizontal={false} />
                  <XAxis
                    type="number"
                    dataKey="cpl"
                    stroke={CHART.warmGray}
                    fontSize={11}
                    tickLine={false}
                    tickFormatter={(value: number) => wonCompact(value)}
                  />
                  <YAxis
                    type="category"
                    dataKey="label"
                    width={84}
                    stroke={CHART.warmGray}
                    fontSize={11}
                    tickLine={false}
                  />
                  <Tooltip
                    cursor={{ fill: "rgba(0,0,0,0.04)" }}
                    content={<EfficiencyTooltip />}
                  />
                  <Bar dataKey="cpl" radius={4} maxBarSize={22}>
                    {chartData.map((entry) => (
                      <Cell key={entry.channel} fill={entry.color} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="flex min-h-[120px] items-center justify-center rounded-xl bg-[#fafaf8] px-4 py-8 text-center">
              <p className="text-[12px] text-[#1a1a1a]/40">
                CPL을 계산할 수 있는 채널이 없습니다.
              </p>
            </div>
          )}

          <div className="mt-4 overflow-hidden rounded-xl border border-[#f0f0ec]">
            <div className="grid grid-cols-[1.4fr_1fr_0.7fr_1fr] gap-2 bg-[#fafaf8] px-3 py-2 text-[10px] uppercase tracking-[0.15em] text-[#1a1a1a]/35">
              <span>채널</span>
              <span className="text-right">광고비</span>
              <span className="text-right">리드</span>
              <span className="text-right">CPL</span>
            </div>
            <div className="divide-y divide-[#f0f0ec]">
              {ranked.map((row) => {
                const isBest =
                  best != null && row.channel === best.channel && row.cpl != null
                return (
                  <div
                    key={row.channel}
                    className="grid grid-cols-[1.4fr_1fr_0.7fr_1fr] items-center gap-2 px-3 py-2.5"
                  >
                    <span className="flex min-w-0 items-center gap-2">
                      <span
                        aria-hidden
                        className="h-2.5 w-2.5 shrink-0 rounded-full"
                        style={{ backgroundColor: row.color }}
                      />
                      <span className="truncate text-[12px] font-medium text-[#111110]">
                        {row.label}
                      </span>
                    </span>
                    <span className="text-right text-[11px] tabular-nums text-[#1a1a1a]/55">
                      {won(row.spend)}
                    </span>
                    <span className="text-right text-[11px] tabular-nums text-[#1a1a1a]/55">
                      {count(row.leads)}
                    </span>
                    <span
                      className={`text-right text-[12px] font-bold tabular-nums ${
                        isBest ? "text-[#084734]" : "text-[#111110]"
                      }`}
                    >
                      {won(row.cpl)}
                    </span>
                  </div>
                )
              })}
            </div>
          </div>

          {best != null && best.cpl != null && (
            <p className="mt-3 flex items-center gap-2 text-[11px] text-[#1a1a1a]/45">
              <span
                aria-hidden
                className="h-2 w-2 shrink-0 rounded-full bg-[#084734]"
              />
              가장 효율적인 채널:{" "}
              <span className="font-semibold text-[#084734]">{best.label}</span>
              <span className="tabular-nums text-[#1a1a1a]/40">
                (CPL {won(best.cpl)})
              </span>
            </p>
          )}
        </>
      )}
    </div>
  )
}
