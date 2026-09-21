"use client"

import { useMemo, useSyncExternalStore, type Dispatch, type SetStateAction } from "react"
import Link from "next/link"
import dynamic from "next/dynamic"
import { Calendar as CalendarIcon } from "lucide-react"
import { ChartSkeleton } from "@/components/admin/viz"
import { GoalProgressPanel } from "@/components/admin/campaigns/GoalProgressPanel"
import type { GoalEventRow } from "@/components/admin/campaigns/GoalProgressPanel"
import { TopPerformersTable } from "@/components/admin/campaigns/TopPerformersTable"
import type { PerformerRow } from "@/components/admin/campaigns/TopPerformersTable"
import { distinguishingLabels, formatRange } from "@/components/admin/campaigns/event-format"
import { EventPeriodToggle } from "./EventPeriodToggle"
import type { PublicEvent } from "@/lib/types/public-events"
import type { PerEventEconRow, Period } from "@/components/admin/campaigns/tabs/types"

// 행사 성과 비교 — 상세 › 행사. 구 행사 탭(EventsTab)의 상단 절반(타임라인·퍼널 비교·목표·ROI·
// 리더보드)을 2026-09-14 상세 층으로 옮겼다(파생 규칙 무변경). 행사 목록·성과 입력은 데이터 층.
// 전부 perEventEcon/filtered 파생값이며 행사 기간 필터(Period)는 이 섹션 헤더의 토글이 소유한다.

// Recharts 청크는 표시 시점에만 로드한다.
const EventFunnelCompareChart = dynamic(
  () => import("@/components/admin/campaigns/CampaignCharts").then((m) => m.EventFunnelCompareChart),
  { ssr: false, loading: () => <ChartSkeleton className="h-[260px]" /> }
)
const EventRoiChart = dynamic(
  () => import("@/components/admin/campaigns/CampaignCharts").then((m) => m.EventRoiChart),
  { ssr: false, loading: () => <ChartSkeleton className="h-[200px]" /> }
)

// ─── timeline (calendar bar) ─────────────────────────────────────────────────

function cssPercent(value: number) {
  return `${value.toFixed(3)}%`
}

let browserTimelineNow: Date | null = null

function subscribeTimelineNow() {
  return () => {}
}

function getBrowserTimelineNow() {
  if (typeof window === "undefined") return null
  browserTimelineNow ??= new Date()
  return browserTimelineNow
}

function getServerTimelineNow() {
  return null
}

function TimelineRow({ events }: { events: PublicEvent[] }) {
  const timelineNow = useSyncExternalStore(subscribeTimelineNow, getBrowserTimelineNow, getServerTimelineNow)

  function renderTimelineBody() {
    if (!timelineNow) {
      return (
        <div className="relative px-4 pb-5 pt-4 sm:px-6" aria-hidden="true">
          <div className="relative h-6 border-b border-dashed border-[#e8e8e4]" />
          <div className="mt-3 space-y-2">
            <div className="h-7 w-3/5 rounded-md bg-[#f0f0ec]" />
            <div className="h-7 w-2/5 rounded-md bg-[#f0f0ec]" />
          </div>
        </div>
      )
    }

    // 표시 범위: 현재 월 ±2개월 (5개월)
    const start = new Date(timelineNow.getFullYear(), timelineNow.getMonth() - 2, 1)
    const end = new Date(timelineNow.getFullYear(), timelineNow.getMonth() + 3, 0)
    const totalMs = end.getTime() - start.getTime()
    const months: { label: string; left: number }[] = []
    for (let m = -2; m <= 2; m++) {
      const d = new Date(timelineNow.getFullYear(), timelineNow.getMonth() + m, 1)
      months.push({
        label: `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, "0")}`,
        left: ((d.getTime() - start.getTime()) / totalMs) * 100,
      })
    }
    const todayLeft = Math.max(0, Math.min(100, ((timelineNow.getTime() - start.getTime()) / totalMs) * 100))

    const sorted = [...events].sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime())
    // 바 폭이 좁아 CSS 절단이 앞에서부터 일어난다 — 공통 접두어를 벗겨 구분되는 꼬리를 남긴다.
    const barLabels = distinguishingLabels(sorted.map((event) => event.title), 24)

    return (
      <div className="relative px-4 pb-5 pt-4 sm:px-6">
        <div className="relative h-6 border-b border-dashed border-[#e8e8e4]">
          {months.map((m) => (
            <div
              key={m.label}
              className="absolute top-0 -translate-x-1/2 text-[10px] font-medium text-[#1a1a1a]/40"
              style={{ left: cssPercent(m.left) }}
            >
              {m.label}
            </div>
          ))}
          <div className="absolute top-0 h-full w-px bg-[#B85C33]" style={{ left: cssPercent(todayLeft) }} />
        </div>

        {sorted.length === 0 ? (
          <p className="py-8 text-center text-[12px] text-[#A39E98]">표시할 행사가 없습니다.</p>
        ) : (
          <div className="mt-3 space-y-2">
            {sorted.map((event, index) => {
              const s = new Date(event.startsAt).getTime()
              const e = event.endsAt ? new Date(event.endsAt).getTime() : s + 24 * 3600 * 1000
              const left = Math.max(0, ((s - start.getTime()) / totalMs) * 100)
              const right = Math.min(100, ((e - start.getTime()) / totalMs) * 100)
              const width = Math.max(4, right - left)
              // 상태색은 DESIGN.md 운영 스케일 — 예정=Warning(#A8741A), 마감=뉴트럴(#A39E98).
              const color =
                event.status === "진행 중" ? "bg-[#084734]" : event.status === "예정" ? "bg-[#A8741A]" : "bg-[#A39E98]"
              return (
                <div key={event.id} className="relative h-7">
                  <div
                    className={`absolute top-1/2 -translate-y-1/2 rounded-md ${color} px-2 py-1 text-[11px] font-medium text-white truncate shadow-sm`}
                    style={{ left: cssPercent(left), width: cssPercent(width), minWidth: "60px" }}
                    title={`${event.title} · ${formatRange(event.startsAt, event.endsAt)}`}
                  >
                    {barLabels[index]}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="rounded-2xl border border-[#e8e8e4] bg-white">
      <div className="flex items-center justify-between border-b border-[#e8e8e4] px-4 py-3 sm:px-6">
        <h3 className="text-[14px] font-semibold text-[#111110]">캘린더 타임라인</h3>
        <Link
          href="/admin/calendar"
          className="inline-flex items-center gap-1 rounded-lg border border-[#e8e8e4] bg-white px-2.5 py-1.5 text-[11px] font-medium text-[#1a1a1a]/60 hover:text-[#111110]"
        >
          <CalendarIcon className="w-3.5 h-3.5" />
          전체 캘린더
        </Link>
      </div>

      {renderTimelineBody()}
    </div>
  )
}

export function EventPerformanceSection({
  loading,
  filtered,
  perEventEcon,
  period,
  setPeriod,
}: {
  loading: boolean
  filtered: PublicEvent[]
  perEventEcon: PerEventEconRow[]
  period: Period
  setPeriod: Dispatch<SetStateAction<Period>>
}) {
  // 리드 많은 순 상위 10 — 볼 가치가 있는 퍼널부터. 동률(전부 0)일 땐 원래 순서 유지.
  const compareChartData = useMemo(() => {
    const ranked = [...perEventEcon].sort((a, b) => b.funnel.leads - a.funnel.leads).slice(0, 10)
    const labels = distinguishingLabels(ranked.map((row) => row.event.title), 14)
    return ranked.map((row, i) => ({
      name: labels[i],
      리드: row.funnel.leads,
      신청: row.funnel.applications,
      참석: row.funnel.attendees,
      딜: row.funnel.deals,
    }))
  }, [perEventEcon])

  const roiChartData = useMemo(() => {
    const ranked = perEventEcon
      .filter((row): row is PerEventEconRow & { econ: { roi: number } } => row.econ.roi !== null)
      // "행사별 ROI 비교"가 상위 8을 표방하므로 정렬 후 자른다 — API 순서대로 자르면 최고/최저가 빠진다.
      .sort((a, b) => b.econ.roi - a.econ.roi)
      .slice(0, 8)
    const labels = distinguishingLabels(ranked.map((row) => row.event.title), 12)
    return ranked.map((row, i) => ({ name: labels[i], roi: row.econ.roi }))
  }, [perEventEcon])

  // 목표 달성 (targetLeads / targetRevenue 보유 행사만)
  const goalData = useMemo(() => {
    let targetLeads = 0
    let actualLeads = 0
    let targetRevenue = 0
    let actualRevenue = 0
    const perEvent: GoalEventRow[] = []
    for (const { event, metrics, funnel, econ } of perEventEcon) {
      const hasLeadTarget = metrics.targetLeads != null && metrics.targetLeads > 0
      const hasRevTarget = metrics.targetRevenue != null && metrics.targetRevenue > 0
      if (!hasLeadTarget && !hasRevTarget) continue
      if (hasLeadTarget) {
        targetLeads += metrics.targetLeads as number
        actualLeads += funnel.leads
      }
      if (hasRevTarget) {
        targetRevenue += metrics.targetRevenue as number
        actualRevenue += econ.revenue
      }
      perEvent.push({
        id: event.id,
        title: event.title,
        targetLeads: hasLeadTarget ? metrics.targetLeads : null,
        actualLeads: funnel.leads,
        targetRevenue: hasRevTarget ? metrics.targetRevenue : null,
        actualRevenue: econ.revenue,
      })
    }
    return {
      leads: { target: targetLeads, actual: actualLeads },
      revenue: { target: targetRevenue, actual: actualRevenue },
      perEvent,
    }
  }, [perEventEcon])

  // 리더보드 행 (컴포넌트가 자체 정렬·top8)
  const performerRows = useMemo<PerformerRow[]>(
    () =>
      perEventEcon.map(({ event, funnel, econ }) => ({
        id: event.id,
        title: event.title,
        leads: funnel.leads,
        deals: funnel.deals,
        revenue: econ.revenue,
        spend: econ.adSpendTotal,
        roi: econ.roi,
        cpl: econ.cpl,
      })),
    [perEventEcon]
  )

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <p className="text-[11px] text-[#615D59]">행사 수기 집계(리드 귀속·광고비·매출 입력) 기준 — 미입력 매출은 ROI 미산정</p>
        <EventPeriodToggle value={period} onChange={setPeriod} />
      </div>
      {loading ? (
        <div className="space-y-4" aria-busy="true">
          <ChartSkeleton className="h-[140px]" />
          <div className="grid gap-4 lg:grid-cols-2">
            <ChartSkeleton className="h-[300px]" />
            <ChartSkeleton className="h-[300px]" />
          </div>
        </div>
      ) : (
        <>
          <div className="mb-4">
            <TimelineRow events={filtered} />
          </div>
          <div className="mb-4 grid gap-4 lg:grid-cols-2">
            <div className="rounded-2xl border border-[#e8e8e4] bg-white p-4 sm:p-5">
              <h3 className="mb-3 text-[14px] font-semibold text-[#111110]">행사별 퍼널 비교</h3>
              {compareChartData.length === 0 ? (
                <p className="py-12 text-center text-[12px] text-[#A39E98]">표시할 데이터가 없습니다.</p>
              ) : (
                <div className="h-[260px] w-full">
                  <EventFunnelCompareChart data={compareChartData} />
                </div>
              )}
            </div>
            <GoalProgressPanel leads={goalData.leads} revenue={goalData.revenue} perEvent={goalData.perEvent} />
          </div>
          {roiChartData.length > 0 && (
            <div className="mb-4 rounded-2xl border border-[#e8e8e4] bg-white p-4 sm:p-5">
              <h3 className="mb-3 text-[14px] font-semibold text-[#111110]">행사별 ROI 비교</h3>
              <div className="h-[200px] w-full">
                <EventRoiChart data={roiChartData} />
              </div>
            </div>
          )}
          <TopPerformersTable rows={performerRows} />
        </>
      )}
    </div>
  )
}
