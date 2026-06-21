"use client"

import { Target } from "lucide-react"

const KRW = new Intl.NumberFormat("ko-KR")
const KRW_CURRENCY = new Intl.NumberFormat("ko-KR", {
  style: "currency",
  currency: "KRW",
  maximumFractionDigits: 0,
})
const won = (n: number | null | undefined) => (n == null ? "—" : KRW_CURRENCY.format(Math.round(n)))

/** Achieved percentage of `actual` against `target`. Returns null when no usable target. */
function achievedPct(actual: number, target: number | null | undefined): number | null {
  if (target == null || target <= 0) return null
  return (actual / target) * 100
}

/** Color for an achievement %: green >=100, terracotta <50, neutral otherwise. */
function pctColor(pct: number | null): string {
  if (pct == null) return "#84827a"
  if (pct >= 100) return "#084734"
  if (pct < 50) return "#B85C33"
  return "#1a1a1a"
}

function pctLabel(pct: number | null): string {
  if (pct == null) return "—"
  return `${Math.round(pct)}%`
}

export interface GoalEventRow {
  id: string
  title: string
  targetLeads: number | null
  actualLeads: number
  targetRevenue: number | null
  actualRevenue: number
}

export interface GoalProgressPanelProps {
  /** aggregated totals across events with a target */
  leads: { target: number; actual: number }
  revenue: { target: number; actual: number }
  /** only events that HAVE at least one target set */
  perEvent: GoalEventRow[]
}

function Meter({
  label,
  actualText,
  targetText,
  pct,
}: {
  label: string
  actualText: string
  targetText: string
  pct: number | null
}) {
  const color = pctColor(pct)
  const fillWidth = pct == null ? 0 : Math.min(pct, 100)

  return (
    <div className="rounded-xl bg-[#fafaf8] p-4">
      <div className="flex items-start justify-between">
        <p className="text-[10px] uppercase tracking-[0.18em] text-[#1a1a1a]/35">{label}</p>
        <span className="text-[12px] font-bold tabular-nums" style={{ color }}>
          {pctLabel(pct)}
        </span>
      </div>
      <p className="mt-1 text-[22px] font-bold tracking-[-0.02em] tabular-nums text-[#111110]">
        {actualText}
      </p>
      <p className="mt-0.5 text-[11px] text-[#1a1a1a]/40 tabular-nums">목표 {targetText}</p>
      <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-[#f0f0ec]">
        <div
          className="h-full rounded-full transition-all"
          style={{ width: `${fillWidth}%`, backgroundColor: color }}
        />
      </div>
    </div>
  )
}

function MiniBar({
  label,
  pct,
}: {
  label: string
  pct: number | null
}) {
  const color = pctColor(pct)
  const fillWidth = pct == null ? 0 : Math.min(pct, 100)

  return (
    <div className="flex items-center gap-2">
      <span className="w-7 shrink-0 text-[10px] uppercase tracking-[0.12em] text-[#1a1a1a]/35">
        {label}
      </span>
      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-[#f0f0ec]">
        <div
          className="h-full rounded-full"
          style={{ width: `${fillWidth}%`, backgroundColor: color }}
        />
      </div>
      <span className="w-9 shrink-0 text-right text-[11px] font-semibold tabular-nums" style={{ color }}>
        {pctLabel(pct)}
      </span>
    </div>
  )
}

export function GoalProgressPanel({ leads, revenue, perEvent }: GoalProgressPanelProps) {
  const rows = perEvent.filter(
    (e) => e.targetLeads != null || e.targetRevenue != null,
  )
  const hasAnyTarget = leads.target > 0 || revenue.target > 0 || rows.length > 0

  const leadsPct = achievedPct(leads.actual, leads.target)
  const revenuePct = achievedPct(revenue.actual, revenue.target)

  return (
    <div className="rounded-2xl border border-[#e8e8e4] bg-white p-4 sm:p-5">
      <div className="mb-4 flex items-start gap-2.5">
        <span className="inline-flex rounded-xl bg-[#ECFDF5] p-2 text-[#084734]">
          <Target className="h-4 w-4" />
        </span>
        <div>
          <h2 className="text-[14px] font-semibold text-[#111110]">목표 달성 현황</h2>
          <p className="text-[11px] text-[#1a1a1a]/40">행사별 리드·매출 목표 대비 실적</p>
        </div>
      </div>

      {!hasAnyTarget ? (
        <div className="rounded-xl border border-dashed border-[#e8e8e4] bg-[#fafaf8] px-4 py-8 text-center">
          <p className="text-[12px] font-semibold text-[#111110]">아직 설정된 목표가 없습니다</p>
          <p className="mt-1 text-[11px] text-[#1a1a1a]/45">
            행사 관리에서 행사에 목표를 설정하면 달성률이 여기 표시됩니다.
          </p>
        </div>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2">
            <Meter
              label="리드 목표"
              actualText={KRW.format(Math.round(leads.actual))}
              targetText={leads.target > 0 ? KRW.format(Math.round(leads.target)) : "—"}
              pct={leadsPct}
            />
            <Meter
              label="매출 목표"
              actualText={won(revenue.actual)}
              targetText={revenue.target > 0 ? won(revenue.target) : "—"}
              pct={revenuePct}
            />
          </div>

          {rows.length > 0 && (
            <div className="mt-4 border-t border-[#f0f0ec] pt-4">
              <p className="mb-3 text-[10px] uppercase tracking-[0.18em] text-[#1a1a1a]/35">
                행사별 달성률
              </p>
              <ul className="divide-y divide-[#f0f0ec]">
                {rows.slice(0, 6).map((event) => {
                  const ep = achievedPct(event.actualLeads, event.targetLeads)
                  const rp = achievedPct(event.actualRevenue, event.targetRevenue)
                  return (
                    <li
                      key={event.id}
                      className="grid grid-cols-1 gap-2 py-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)] sm:items-center sm:gap-4"
                    >
                      <p className="truncate text-[12px] font-medium text-[#111110]" title={event.title}>
                        {event.title}
                      </p>
                      <div className="flex flex-col gap-1.5">
                        <MiniBar label="리드" pct={ep} />
                        <MiniBar label="매출" pct={rp} />
                      </div>
                    </li>
                  )
                })}
              </ul>
            </div>
          )}
        </>
      )}
    </div>
  )
}
