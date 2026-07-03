"use client"

import { CHART } from "../viz/theme"
import { ComparisonBarChart } from "../viz/ComparisonBarChart"
import { RankedHorizontalBars } from "../viz/RankedHorizontalBars"

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

// 툴팁 라벨: 잘린 캠페인명 → 전체명 복원 (두 차트 공통 패턴).
function fullNameLabel(label: unknown, payload: ReadonlyArray<{ payload?: unknown }>) {
  const item = payload?.[0]?.payload as { fullName?: string } | undefined
  return item?.fullName ?? String(label)
}

// 차트 본체는 공용 래퍼(viz/ComparisonBarChart·RankedHorizontalBars) 사용 —
// 데이터 정렬/중앙값 판정과 통화 포맷만 이 파일의 책임.
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

  const compactTick = (value: number) =>
    new Intl.NumberFormat(currency === "KRW" ? "ko-KR" : "en-US", {
      notation: "compact",
      maximumFractionDigits: 1,
    }).format(value)

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <CardShell title="캠페인별 광고비 vs 리드" caption="상위 6개 캠페인">
        {spendData.length === 0 ? (
          <EmptyState message="표시할 데이터가 없습니다." />
        ) : (
          <ComparisonBarChart
            data={spendData}
            xKey="label"
            bars={[{ key: "spend", label: "광고비", color: CHART.danger, formatValue: (v) => money(v, currency) }]}
            line={{ key: "leads", label: "리드", color: CHART.brand, formatValue: (v) => COUNT.format(v) }}
            height={260}
            maxBarSize={42}
            formatLeftTick={compactTick}
            labelFormatter={fullNameLabel}
            cursorFill="rgba(8,71,52,0.04)"
          />
        )}
      </CardShell>

      <CardShell title="효율 분포 (CPL)" caption="낮을수록 효율적">
        {cplData.length === 0 ? (
          <EmptyState message="CPL 데이터가 없습니다." />
        ) : (
          <RankedHorizontalBars
            rows={cplData}
            labelKey="label"
            valueKey="cpl"
            name="CPL"
            formatValue={(value) => money(value, currency)}
            cellColor={(row) => (row.over ? CHART.danger : CHART.brand)}
            height={260}
            labelFormatter={fullNameLabel}
          />
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
