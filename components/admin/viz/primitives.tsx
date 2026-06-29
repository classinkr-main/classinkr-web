"use client"

import type { ReactNode } from "react"
import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react"
import { TONE, type Tone } from "./theme"

// 어드민 공용 프리미티브 — overview·analytics·traffic에서 각자 재선언하던 카드/패널/리스트를 단일화.

// ── Panel (= 기존 overview SectionCard / analytics Panel) ──────────────
export function Panel({
  title,
  description,
  action,
  children,
}: {
  title: string
  description?: string
  action?: ReactNode
  children: ReactNode
}) {
  return (
    <section className="overflow-hidden rounded-2xl border border-[#e8e8e4] bg-white">
      <div className="flex flex-col gap-3 border-b border-[#e8e8e4] px-4 py-4 sm:flex-row sm:items-start sm:justify-between sm:px-6">
        <div>
          <h2 className="text-[14px] font-semibold text-[#111110]">{title}</h2>
          {description && <p className="mt-0.5 text-[11px] text-[#1a1a1a]/40">{description}</p>}
        </div>
        {action}
      </div>
      <div className="p-4 sm:p-6">{children}</div>
    </section>
  )
}

// overview 호출부가 SectionCard 이름을 그대로 쓰도록 별칭 export.
export const SectionCard = Panel

// ── TrendBadge ─────────────────────────────────────────────────────────
export function TrendBadge({
  value,
  format,
  invert,
}: {
  value: number
  format?: "count" | "percent"
  invert?: boolean
}) {
  const positive = invert ? value < 0 : value > 0
  const neutral = value === 0
  const cls = neutral
    ? "bg-[#f0f0ec] text-[#1a1a1a]/40"
    : positive
      ? "bg-green-50 text-green-600"
      : "bg-[#FEF3EE] text-[#B85C33]"
  const text =
    format === "percent" ? `${value > 0 ? "+" : ""}${Math.round(value * 100)}%` : String(Math.abs(value))
  return (
    <span className={`inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[11px] font-medium ${cls}`}>
      {neutral ? (
        <Minus className="h-3 w-3" />
      ) : value > 0 ? (
        <ArrowUpRight className="h-3 w-3" />
      ) : (
        <ArrowDownRight className="h-3 w-3" />
      )}
      {text}
    </span>
  )
}

// ── StatTile (= 기존 analytics/traffic SummaryCard) ────────────────────
export function StatTile({
  icon,
  label,
  value,
  hint,
  trend,
  tone = "neutral",
}: {
  icon: ReactNode
  label: string
  value: string | number
  hint?: string
  trend?: number
  tone?: Tone
}) {
  return (
    <div className="rounded-2xl border border-[#e8e8e4] bg-white p-5">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className={`inline-flex rounded-xl p-2 ${TONE[tone].surfaceClass} ${TONE[tone].iconClass}`}>{icon}</div>
        {typeof trend === "number" && <TrendBadge value={trend} />}
      </div>
      <p className="mb-1 text-[11px] font-medium uppercase tracking-wide text-[#1a1a1a]/40">{label}</p>
      <p className="text-[28px] font-bold leading-none tracking-[-0.03em] text-[#111110]">{value}</p>
      {hint && <p className="mt-1.5 text-[11px] text-[#1a1a1a]/40">{hint}</p>}
    </div>
  )
}

// ── InsightCard ────────────────────────────────────────────────────────
const INSIGHT_SURFACE: Record<Tone, string> = {
  neutral: "bg-[#fafaf8] border-[#e8e8e4]",
  brand: "bg-[#ECFDF5]/70 border-[#D1FAE5]",
  caution: "bg-amber-50/70 border-amber-100",
  danger: "bg-[#FEF3EE]/70 border-[#F6D5C5]",
}

export function InsightCard({
  eyebrow,
  title,
  description,
  tone = "neutral",
}: {
  eyebrow: string
  title: string
  description: string
  tone?: Tone
}) {
  return (
    <div className={`rounded-2xl border px-4 py-4 ${INSIGHT_SURFACE[tone]}`}>
      <p className="text-[10px] font-medium uppercase tracking-[0.2em] text-[#1a1a1a]/35">{eyebrow}</p>
      <p className="mt-2 text-[14px] font-semibold tracking-[-0.01em] text-[#111110]">{title}</p>
      <p className="mt-1.5 text-[12px] leading-relaxed text-[#1a1a1a]/45">{description}</p>
    </div>
  )
}

// ── MetricRankList (제네릭) ─────────────────────────────────────────────
export function MetricRankList<T>({
  rows,
  empty,
  getLabel,
  getValue,
  getMeta,
  getMagnitude,
  keyOf,
}: {
  rows: T[]
  empty: string
  getLabel: (row: T) => string
  getValue: (row: T) => string
  getMeta: (row: T) => string
  getMagnitude: (row: T) => number
  keyOf?: (row: T, i: number) => string
}) {
  if (rows.length === 0) {
    return <p className="py-8 text-[12px] text-[#1a1a1a]/45">{empty}</p>
  }
  const max = Math.max(1, ...rows.map((row) => getMagnitude(row)))
  return (
    <div className="space-y-3">
      {rows.map((row, i) => {
        const width = Math.max(8, Math.round((getMagnitude(row) / max) * 100))
        return (
          <div key={keyOf ? keyOf(row, i) : `${getLabel(row)}-${i}`} className="space-y-1.5">
            <div className="flex items-start justify-between gap-3 text-[12px]">
              <div className="min-w-0">
                <p className="truncate font-mono text-[#111110]">{getLabel(row)}</p>
                <p className="mt-0.5 text-[11px] text-[#1a1a1a]/40">{getMeta(row)}</p>
              </div>
              <span className="shrink-0 font-semibold text-[#111110]">{getValue(row)}</span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-[#f0f0ec]">
              <div className="h-full rounded-full bg-[#084734]" style={{ width: `${width}%` }} />
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ── ToneBadge ──────────────────────────────────────────────────────────
export function ToneBadge({ tone = "neutral", children }: { tone?: Tone; children: ReactNode }) {
  return (
    <span className={`rounded-full border px-2 py-0.5 text-[10px] font-medium ${TONE[tone].badge}`}>{children}</span>
  )
}

// ── EmptyState ─────────────────────────────────────────────────────────
export function EmptyState({
  title,
  description,
  action,
}: {
  title: string
  description: string
  action?: ReactNode
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-[#e8e8e4] bg-[#fafaf8] px-4 py-10 text-center sm:py-12">
      <p className="text-[14px] font-medium text-[#111110]">{title}</p>
      <p className="mx-auto mt-1 max-w-sm text-[12px] leading-relaxed text-[#1a1a1a]/40">{description}</p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}

export function TableEmpty({ message }: { message: string }) {
  return <p className="py-8 text-center text-[12px] text-[#1a1a1a]/30">{message}</p>
}

// ── Skeletons ──────────────────────────────────────────────────────────
export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-lg bg-[#f0f0ec] ${className}`} />
}

export function SectionSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-3">
          <Skeleton className="h-9 w-9 shrink-0 rounded-xl" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-3 w-2/3" />
            <Skeleton className="h-2.5 w-1/2" />
          </div>
          <Skeleton className="h-5 w-16 rounded-full" />
        </div>
      ))}
    </div>
  )
}

export function KpiSkeleton() {
  return (
    <div className="space-y-3 rounded-2xl border border-[#e8e8e4] bg-white p-5">
      <Skeleton className="h-8 w-8 rounded-xl" />
      <Skeleton className="h-3 w-20" />
      <Skeleton className="h-7 w-14" />
      <Skeleton className="h-3 w-24" />
    </div>
  )
}

export function ChartSkeleton({ className = "h-[220px]" }: { className?: string }) {
  return <div className={`rounded-xl bg-[#f0f0ec] ${className}`} />
}
