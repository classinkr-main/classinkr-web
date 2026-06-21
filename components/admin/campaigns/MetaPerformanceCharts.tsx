"use client"

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"

const COUNT = new Intl.NumberFormat("ko-KR")

function money(value: number | null | undefined, currency = "USD") {
  if (value == null) return "—"
  const fractionDigits = currency === "KRW" ? 0 : 2
  return new Intl.NumberFormat(currency === "KRW" ? "ko-KR" : "en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: fractionDigits,
    minimumFractionDigits: fractionDigits,
  }).format(value)
}

function truncate(label: string, max = 10) {
  if (label.length <= max) return label
  return `${label.slice(0, max)}…`
}

function median(values: number[]) {
  if (values.length === 0) return null
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid]
}

export interface MetaPerfRow {
  id: string
  name: string
  spend: number
  leads: number
  clicks: number
  impressions: number
  ctr: number | null
  cpc: number | null
  cpl: number | null
  status: string
}

export interface MetaPerformanceChartsProps {
  rows: MetaPerfRow[]
  currency?: string
}

const TOOLTIP_STYLE = {
  backgroundColor: "#111110",
  border: "none",
  borderRadius: 12,
  color: "white",
  fontSize: 12,
} as const

function CardShell({
  title,
  caption,
  children,
}: {
  title: string
  caption?: string
  children: React.ReactNode
}) {
  return (
    <div className="rounded-2xl border border-[#e8e8e4] bg-white p-4 sm:p-5">
      <div className="mb-3 flex items-baseline justify-between gap-2">
        <h2 className="text-[14px] font-semibold text-[#111110]">{title}</h2>
        {caption ? (
          <span className="text-[11px] text-[#1a1a1a]/40">{caption}</span>
        ) : null}
      </div>
      {children}
    </div>
  )
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex h-[260px] items-center justify-center rounded-xl bg-[#fafaf8]">
      <p className="text-[12px] text-[#1a1a1a]/35">{message}</p>
    </div>
  )
}

export function MetaPerformanceCharts({ rows, currency = "USD" }: MetaPerformanceChartsProps) {
  const safeRows = Array.isArray(rows) ? rows : []

  const spendData = [...safeRows]
    .sort((a, b) => b.spend - a.spend)
    .slice(0, 6)
    .map((row) => ({
      id: row.id,
      label: truncate(row.name),
      fullName: row.name,
      spend: row.spend,
      leads: row.leads,
    }))

  const cplRows = safeRows.filter(
    (row): row is MetaPerfRow & { cpl: number } => row.cpl != null,
  )
  const cplMedian = median(cplRows.map((row) => row.cpl))
  const cplData = [...cplRows]
    .sort((a, b) => a.cpl - b.cpl)
    .map((row) => ({
      id: row.id,
      label: truncate(row.name),
      fullName: row.name,
      cpl: row.cpl,
      over: cplMedian != null && row.cpl > cplMedian,
    }))

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <CardShell title="캠페인별 광고비 vs 리드" caption="상위 6개 캠페인">
        {spendData.length === 0 ? (
          <EmptyState message="표시할 데이터가 없습니다." />
        ) : (
          <div className="h-[260px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={spendData} margin={{ top: 8, right: 8, bottom: 4, left: 4 }}>
                <CartesianGrid stroke="#f0f0ec" vertical={false} />
                <XAxis
                  dataKey="label"
                  fontSize={11}
                  stroke="#84827a"
                  tickLine={false}
                  interval={0}
                />
                <YAxis
                  yAxisId="spend"
                  fontSize={11}
                  stroke="#84827a"
                  tickLine={false}
                  width={52}
                  tickFormatter={(value: number) =>
                    new Intl.NumberFormat(currency === "KRW" ? "ko-KR" : "en-US", {
                      notation: "compact",
                      maximumFractionDigits: 1,
                    }).format(value)
                  }
                />
                <YAxis
                  yAxisId="leads"
                  orientation="right"
                  fontSize={11}
                  stroke="#84827a"
                  tickLine={false}
                  width={36}
                  allowDecimals={false}
                />
                <Tooltip
                  cursor={{ fill: "rgba(8,71,52,0.04)" }}
                  contentStyle={TOOLTIP_STYLE}
                  labelFormatter={(_label, payload) => {
                    const item = payload?.[0]?.payload as { fullName?: string } | undefined
                    return item?.fullName ?? String(_label)
                  }}
                  formatter={(value, name) => {
                    const numeric = typeof value === "number" ? value : Number(value)
                    if (name === "광고비") {
                      return [money(numeric, currency), name]
                    }
                    return [COUNT.format(numeric), name]
                  }}
                />
                <Bar
                  yAxisId="spend"
                  dataKey="spend"
                  name="광고비"
                  fill="#0866FF"
                  radius={[4, 4, 0, 0]}
                  maxBarSize={42}
                />
                <Line
                  yAxisId="leads"
                  type="monotone"
                  dataKey="leads"
                  name="리드"
                  stroke="#084734"
                  strokeWidth={2}
                  dot={{ r: 3, fill: "#084734" }}
                  activeDot={{ r: 4 }}
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        )}
      </CardShell>

      <CardShell title="효율 분포 (CPL)" caption="낮을수록 효율적">
        {cplData.length === 0 ? (
          <EmptyState message="CPL 데이터가 없습니다." />
        ) : (
          <div className="h-[260px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={cplData}
                layout="vertical"
                margin={{ top: 4, right: 12, bottom: 4, left: 4 }}
              >
                <CartesianGrid stroke="#f0f0ec" horizontal={false} />
                <XAxis
                  type="number"
                  fontSize={11}
                  stroke="#84827a"
                  tickLine={false}
                  tickFormatter={(value: number) => money(value, currency)}
                />
                <YAxis
                  type="category"
                  dataKey="label"
                  width={92}
                  fontSize={11}
                  stroke="#84827a"
                  tickLine={false}
                  interval={0}
                />
                <Tooltip
                  cursor={{ fill: "rgba(8,71,52,0.04)" }}
                  contentStyle={TOOLTIP_STYLE}
                  labelFormatter={(_label, payload) => {
                    const item = payload?.[0]?.payload as { fullName?: string } | undefined
                    return item?.fullName ?? String(_label)
                  }}
                  formatter={(value, name) => [
                    money(typeof value === "number" ? value : Number(value), currency),
                    name,
                  ]}
                />
                <Bar dataKey="cpl" name="CPL" radius={[0, 4, 4, 0]} maxBarSize={22}>
                  {cplData.map((entry) => (
                    <Cell key={entry.id} fill={entry.over ? "#B85C33" : "#084734"} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
        {cplMedian != null ? (
          <p className="mt-3 text-[11px] text-[#1a1a1a]/40 tabular-nums">
            중앙값 {money(cplMedian, currency)} · 초록은 효율적, 주황은 평균 초과
          </p>
        ) : null}
      </CardShell>
    </div>
  )
}
