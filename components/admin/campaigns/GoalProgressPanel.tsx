"use client"

import { Target } from "lucide-react"
import { ProgressRoadmap } from "../viz/ProgressRoadmap"

const KRW = new Intl.NumberFormat("ko-KR")
const KRW_CURRENCY = new Intl.NumberFormat("ko-KR", {
  style: "currency",
  currency: "KRW",
  maximumFractionDigits: 0,
})
const won = (n: number | null | undefined) => (n == null ? "—" : KRW_CURRENCY.format(Math.round(n)))

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

export function GoalProgressPanel({ leads, revenue, perEvent }: GoalProgressPanelProps) {
  const rows = perEvent.filter(
    (e) => e.targetLeads != null || e.targetRevenue != null,
  )
  const hasAnyTarget = leads.target > 0 || revenue.target > 0 || rows.length > 0

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
            <ProgressRoadmap
              variant="meter"
              label="리드 목표"
              actual={leads.actual}
              goal={leads.target}
              formatValue={(n) => KRW.format(Math.round(n))}
              prefix=""
            />
            <ProgressRoadmap
              variant="meter"
              label="매출 목표"
              actual={revenue.actual}
              goal={revenue.target}
              formatValue={won}
              prefix=""
            />
          </div>

          {rows.length > 0 && (
            <div className="mt-4 border-t border-[#f0f0ec] pt-4">
              <p className="mb-3 text-[10px] uppercase tracking-[0.18em] text-[#1a1a1a]/35">
                행사별 달성률
              </p>
              <ul className="divide-y divide-[#f0f0ec]">
                {rows.slice(0, 6).map((event) => {
                  return (
                    <li
                      key={event.id}
                      className="grid grid-cols-1 gap-2 py-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)] sm:items-center sm:gap-4"
                    >
                      <p className="truncate text-[12px] font-medium text-[#111110]" title={event.title}>
                        {event.title}
                      </p>
                      <div className="flex flex-col gap-1.5">
                        <ProgressRoadmap
                          variant="mini"
                          label="리드"
                          actual={event.actualLeads}
                          goal={event.targetLeads ?? 0}
                        />
                        <ProgressRoadmap
                          variant="mini"
                          label="매출"
                          actual={event.actualRevenue}
                          goal={event.targetRevenue ?? 0}
                        />
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
