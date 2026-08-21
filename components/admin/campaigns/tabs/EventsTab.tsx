"use client"

import { useDeferredValue, useMemo, useSyncExternalStore, type Dispatch, type SetStateAction } from "react"
import Link from "next/link"
import dynamic from "next/dynamic"
import {
  Calendar as CalendarIcon,
  ChevronLeft,
  ChevronRight,
  LayoutGrid,
  List as ListIcon,
  Search,
} from "lucide-react"
import { ChartSkeleton } from "@/components/admin/viz"
import { CampaignExportButton } from "@/components/admin/campaigns/CampaignExportButton"
import type { ExportColumn } from "@/components/admin/campaigns/CampaignExportButton"
import { EventOriginMatrix } from "@/components/admin/campaigns/EventOriginMatrix"
import { EventCardHeader } from "@/components/admin/campaigns/EventCardHeader"
import { EventDetailContent, buildFunnel } from "@/components/admin/campaigns/EventDetailContent"
import { EventGalleryCard } from "@/components/admin/campaigns/EventGalleryCard"
import { filterEvents } from "@/components/admin/campaigns/filter-events"
import { GoalProgressPanel } from "@/components/admin/campaigns/GoalProgressPanel"
import type { GoalEventRow } from "@/components/admin/campaigns/GoalProgressPanel"
import { TopPerformersTable } from "@/components/admin/campaigns/TopPerformersTable"
import type { PerformerRow } from "@/components/admin/campaigns/TopPerformersTable"
import { distinguishingLabels, formatRange } from "@/components/admin/campaigns/event-format"
import {
  EVENT_CATEGORIES,
  type EventCategory,
  type EventStatus,
  type PublicEvent,
} from "@/lib/types/public-events"
import {
  computeEconomics,
  DEFAULT_EVENT_METRICS,
  type EventMetrics,
} from "@/lib/types/event-metrics"
import ShowMore, { useVisibleCount } from "@/components/admin/ui/ShowMore"
import type { EventLeadStats, EventSortKey, PerEventEconRow, Period } from "./types"

// 상세 모달·성과 편집기는 열기 전까지 탭 청크에 실리지 않게 지연 로드한다.
const EventDetailModal = dynamic(
  () => import("@/components/admin/campaigns/EventDetailModal").then((m) => m.EventDetailModal),
  { ssr: false }
)
const MetricsEditor = dynamic(() => import("./MetricsEditor"), { ssr: false })

// 행사 성과 비교 차트(구 요약 탭에서 이동) — Recharts 청크는 표시 시점에만 로드한다.
const EventFunnelCompareChart = dynamic(
  () => import("@/components/admin/campaigns/CampaignCharts").then((m) => m.EventFunnelCompareChart),
  { ssr: false, loading: () => <ChartSkeleton className="h-[260px]" /> }
)
const EventRoiChart = dynamic(
  () => import("@/components/admin/campaigns/CampaignCharts").then((m) => m.EventRoiChart),
  { ssr: false, loading: () => <ChartSkeleton className="h-[200px]" /> }
)

// ─── timeline (calendar bar) — 구 요약 탭 TimelineRow 이동 ─────────────────────

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
  const timelineNow = useSyncExternalStore(
    subscribeTimelineNow,
    getBrowserTimelineNow,
    getServerTimelineNow
  )

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

    const sorted = [...events].sort(
      (a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime()
    )
    // 바 폭이 좁아 CSS 절단이 앞에서부터 일어난다 — 공통 접두어를 벗겨 구분되는 꼬리를 남긴다.
    const barLabels = distinguishingLabels(sorted.map((event) => event.title), 24)

    return (
      <div className="relative px-4 pb-5 pt-4 sm:px-6">
        {/* month grid */}
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
          {/* today marker */}
          <div
            className="absolute top-0 h-full w-px bg-[#B85C33]"
            style={{ left: cssPercent(todayLeft) }}
          />
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
                event.status === "진행 중"
                  ? "bg-[#084734]"
                  : event.status === "예정"
                    ? "bg-[#A8741A]"
                    : "bg-[#A39E98]"
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
        <h2 className="text-[14px] font-semibold text-[#111110]">캘린더 타임라인</h2>
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

/** 리스트에서 한 번에 그리는 퍼널 카드 수 — 카드 하나가 무거워(퍼널 시각화) 전량 렌더를 피한다. */
const EVENT_CARD_STEP = 8
// 갤러리는 2·3·4열 그리드라 12단위(공배수)로 펼쳐야 마지막 줄이 들쭉거리지 않는다.
const GALLERY_STEP = 12

// ─── event card ───────────────────────────────────────────────────────────────

function EventFunnelCard({
  event,
  metrics,
  attributedLeadCount,
  duringLeadCount,
  onEdit,
}: {
  event: PublicEvent
  metrics: EventMetrics
  attributedLeadCount: number
  duringLeadCount: number
  onEdit: () => void
}) {
  return (
    <div className="rounded-2xl border border-[#e8e8e4] bg-white p-4 sm:p-5">
      <EventCardHeader
        event={event}
        actions={
          <button
            onClick={onEdit}
            className="shrink-0 rounded-lg border border-[#e8e8e4] bg-white px-2.5 py-1.5 text-[11px] font-medium text-[#1a1a1a]/60 transition-colors hover:text-[#111110]"
          >
            성과 입력
          </button>
        }
      />
      <EventDetailContent
        event={event}
        metrics={metrics}
        attributedLeadCount={attributedLeadCount}
        duringLeadCount={duringLeadCount}
      />
    </div>
  )
}

// "행사" 탭 패널 — 행사별 퍼널 리스트/갤러리 + 상세 모달 + 성과 입력 드로어.
// 검색·필터·정렬·모달 상태는 탭 전환에도 유지되도록 페이지가 소유하고, 여기는 setter를 그대로 받는다.
// 상세 모달·성과 드로어는 행사 탭에서만 열리므로 이 청크에 함께 실어 페이지 본체를 가볍게 한다.
export default function EventsTab({
  loading,
  filtered,
  metricsMap,
  eventLeadStats,
  perEventEcon,
  galleryView,
  setViewParam,
  eventSearch,
  setEventSearch,
  eventStatusFilter,
  setEventStatusFilter,
  eventCategoryFilter,
  setEventCategoryFilter,
  eventSort,
  setEventSort,
  period,
  setPeriod,
  viewingEvent,
  setViewingEvent,
  editing,
  setEditing,
  onMetricsSaved,
}: {
  loading: boolean
  filtered: PublicEvent[]
  metricsMap: Record<string, EventMetrics>
  eventLeadStats: Map<string, EventLeadStats>
  perEventEcon: PerEventEconRow[]
  galleryView: boolean
  setViewParam: (value: string) => void
  eventSearch: string
  setEventSearch: Dispatch<SetStateAction<string>>
  eventStatusFilter: EventStatus | "all"
  setEventStatusFilter: Dispatch<SetStateAction<EventStatus | "all">>
  eventCategoryFilter: EventCategory | "all"
  setEventCategoryFilter: Dispatch<SetStateAction<EventCategory | "all">>
  eventSort: EventSortKey
  setEventSort: Dispatch<SetStateAction<EventSortKey>>
  period: Period
  setPeriod: Dispatch<SetStateAction<Period>>
  viewingEvent: PublicEvent | null
  setViewingEvent: Dispatch<SetStateAction<PublicEvent | null>>
  editing: PublicEvent | null
  setEditing: Dispatch<SetStateAction<PublicEvent | null>>
  onMetricsSaved: (saved: EventMetrics) => void
}) {
  // 키 입력마다 목록 필터·CSV 컬럼 재계산이 동기로 돌지 않게 검색어만 지연시킨다.
  const deferredSearch = useDeferredValue(eventSearch)

  // ─── 행사 성과 비교(구 요약 탭 이동) — 전부 perEventEcon/filtered 파생값 ─────────
  // 요약 탭이 퍼포먼스 대시보드(perf 응답)로 재편되면서, 행사 수기 집계 기반 비교 시각화는
  // 데이터 소유자인 이 탭으로 왔다. 파생 규칙은 구 SummaryTab 과 동일(재계산 이중화 금지).

  // 리드 많은 순 상위 10 — 볼 가치가 있는 퍼널부터. 동률(전부 0)일 땐 원래 순서 유지.
  // 라벨은 공통 접두어("Classin Meets ")를 벗겨 만든다 — 앞에서 자르면 축 라벨이 전부 동일해진다.
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
  const performerRows = useMemo<PerformerRow[]>(() => {
    return perEventEcon.map(({ event, funnel, econ }) => ({
      id: event.id,
      title: event.title,
      leads: funnel.leads,
      deals: funnel.deals,
      revenue: econ.revenue,
      spend: econ.adSpendTotal,
      roi: econ.roi,
      cpl: econ.cpl,
    }))
  }, [perEventEcon])

  const sortedEvents = useMemo(() => {
    if (eventSort === "leads") {
      return [...filtered].sort((a, b) => {
        const aS = eventLeadStats.get(a.id) ?? { attributed: 0, during: 0 }
        const bS = eventLeadStats.get(b.id) ?? { attributed: 0, during: 0 }
        return (bS.attributed + bS.during) - (aS.attributed + aS.during)
      })
    }
    if (eventSort === "deals") {
      return [...filtered].sort((a, b) => {
        const aM = metricsMap[a.id] ?? DEFAULT_EVENT_METRICS
        const bM = metricsMap[b.id] ?? DEFAULT_EVENT_METRICS
        return (bM.dealsCount ?? 0) - (aM.dealsCount ?? 0)
      })
    }
    if (eventSort === "roi") {
      return [...filtered].sort((a, b) => {
        const aM = metricsMap[a.id] ?? { ...DEFAULT_EVENT_METRICS, eventId: a.id, updatedAt: "" }
        const bM = metricsMap[b.id] ?? { ...DEFAULT_EVENT_METRICS, eventId: b.id, updatedAt: "" }
        const aS = eventLeadStats.get(a.id) ?? { attributed: 0, during: 0 }
        const bS = eventLeadStats.get(b.id) ?? { attributed: 0, during: 0 }
        const aEcon = computeEconomics(buildFunnel(a, aM, aS.attributed, aS.during), aM)
        const bEcon = computeEconomics(buildFunnel(b, bM, bS.attributed, bS.during), bM)
        // null 은 항상 뒤로 — 둘 다 null 이면 0 을 반환해 비교자 대칭성을 지킨다(정렬 안정성).
        if (aEcon.roi === null && bEcon.roi === null) return 0
        if (aEcon.roi === null) return 1
        if (bEcon.roi === null) return -1
        return bEcon.roi - aEcon.roi
      })
    }
    return [...filtered].sort((a, b) => new Date(b.startsAt).getTime() - new Date(a.startsAt).getTime())
  }, [filtered, eventSort, eventLeadStats, metricsMap])

  const visibleEvents = useMemo(
    () =>
      filterEvents(sortedEvents, {
        search: deferredSearch,
        status: eventStatusFilter,
        category: eventCategoryFilter,
      }),
    [sortedEvents, deferredSearch, eventStatusFilter, eventCategoryFilter]
  )

  const cardsVisible = useVisibleCount(visibleEvents.length, EVENT_CARD_STEP)
  // 갤러리도 전량 렌더하지 않는다(2026-08-18) — 리스트와 같은 단계 렌더.
  const galleryVisible = useVisibleCount(visibleEvents.length, GALLERY_STEP)

  // CSV 내보내기 — 화면에 보이는(검색·상태·카테고리 필터 적용) 행과 정확히 같은 집합을 내보낸다.
  // 필터로 3건만 남겨두고 눌렀는데 전체가 나가면 "보이는 것=받는 것" 계약이 깨진다.
  const eventExport = useMemo(() => {
    const columns: ExportColumn[] = [
      { key: "title", label: "행사" },
      { key: "status", label: "상태" },
      { key: "startsAt", label: "시작일" },
      { key: "leads", label: "리드" },
      { key: "applications", label: "신청" },
      { key: "attendees", label: "참석" },
      { key: "deals", label: "딜" },
      { key: "spend", label: "광고비(원)" },
      { key: "revenue", label: "매출(원)" },
      { key: "cpl", label: "CPL(원)" },
      { key: "roi", label: "ROI(%)" },
    ]
    const econById = new Map(perEventEcon.map((e) => [e.event.id, e]))
    const rows: Array<Record<string, string | number | null>> = visibleEvents.map((ev) => {
      const e =
        econById.get(ev.id) ??
        (() => {
          const metrics: EventMetrics =
            metricsMap[ev.id] ?? { ...DEFAULT_EVENT_METRICS, eventId: ev.id, updatedAt: "" }
          const ls = eventLeadStats.get(ev.id) ?? { attributed: 0, during: 0 }
          const funnel = buildFunnel(ev, metrics, ls.attributed, ls.during)
          return { event: ev, metrics, funnel, econ: computeEconomics(funnel, metrics) }
        })()
      return {
        title: ev.title,
        status: ev.status,
        startsAt: ev.startsAt.slice(0, 10),
        leads: e.funnel.leads,
        applications: e.funnel.applications,
        attendees: e.funnel.attendees,
        deals: e.funnel.deals,
        spend: e.econ.adSpendTotal,
        revenue: e.econ.revenue,
        cpl: e.econ.cpl,
        roi: e.econ.roi,
      }
    })
    return { columns, rows }
  }, [perEventEcon, visibleEvents, metricsMap, eventLeadStats])

  return (
    <>
      {/* 행사 성과 비교 — 구 요약 탭에서 이동한 행사 수기 집계 시각화 묶음 */}
      <section className="mb-6" aria-label="행사 성과 비교">
        <h2 className="mb-3 text-[14px] font-semibold text-[#111110]">행사 성과 비교</h2>
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
              <GoalProgressPanel
                leads={goalData.leads}
                revenue={goalData.revenue}
                perEvent={goalData.perEvent}
              />
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
      </section>

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <h2 className="flex-1 text-[14px] font-semibold text-[#111110]">행사별 퍼널 상세</h2>
        <div className="inline-flex rounded-lg border border-[rgba(0,0,0,0.08)] bg-[#F6F5F4] p-[3px]" role="group" aria-label="행사 보기 방식">
          <button
            type="button"
            onClick={() => setViewParam("list")}
            aria-pressed={!galleryView}
            className={`inline-flex items-center gap-1 rounded-md px-3 py-1.5 text-[12px] font-semibold transition ${
              !galleryView ? "bg-white text-[#111110] shadow-[0_1px_2px_rgba(0,0,0,0.06)]" : "text-[#615D59]"
            }`}
          >
            <ListIcon className="h-3.5 w-3.5" />
            리스트
          </button>
          <button
            type="button"
            onClick={() => setViewParam("gallery")}
            aria-pressed={galleryView}
            className={`inline-flex items-center gap-1 rounded-md px-3 py-1.5 text-[12px] font-semibold transition ${
              galleryView ? "bg-white text-[#111110] shadow-[0_1px_2px_rgba(0,0,0,0.06)]" : "text-[#615D59]"
            }`}
          >
            <LayoutGrid className="h-3.5 w-3.5" />
            갤러리
          </button>
        </div>
        <CampaignExportButton
          columns={eventExport.columns}
          rows={eventExport.rows}
          filename="campaign-events"
          label="행사 CSV"
          disabled={loading}
        />
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-2 rounded-xl border border-[#f0f0ec] bg-[#fafaf8] px-3 py-2">
        <div className="flex min-w-[160px] flex-1 items-center gap-1.5 rounded-lg border border-[#e8e8e4] bg-white px-2.5 py-1.5 focus-within:border-[#084734]">
          <Search className="h-3.5 w-3.5 text-[#1a1a1a]/35" />
          <input
            type="text"
            value={eventSearch}
            onChange={(e) => setEventSearch(e.target.value)}
            placeholder="행사명 검색..."
            aria-label="행사명 검색"
            className="w-full text-[12px] outline-none placeholder:text-[#1a1a1a]/35"
          />
        </div>
        <div className="flex items-center gap-1 rounded-xl border border-[#e8e8e4] bg-white p-0.5" role="group" aria-label="행사 상태 필터">
          {(["all", "진행 중", "예정", "마감"] as const).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setEventStatusFilter(s)}
              aria-pressed={eventStatusFilter === s}
              className={`rounded-lg px-2.5 py-1 text-[11px] font-semibold transition ${
                eventStatusFilter === s ? "bg-[#fafaf8] text-[#111110]" : "text-[#1a1a1a]/45 hover:text-[#111110]"
              }`}
            >
              {s === "all" ? "전체" : s}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1 rounded-xl border border-[#e8e8e4] bg-white p-0.5" role="group" aria-label="행사 카테고리 필터">
          <button
            type="button"
            onClick={() => setEventCategoryFilter("all")}
            aria-pressed={eventCategoryFilter === "all"}
            className={`rounded-lg px-2.5 py-1 text-[11px] font-semibold transition ${
              eventCategoryFilter === "all" ? "bg-[#fafaf8] text-[#111110]" : "text-[#1a1a1a]/45 hover:text-[#111110]"
            }`}
          >
            전체
          </button>
          {EVENT_CATEGORIES.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setEventCategoryFilter(c)}
              aria-pressed={eventCategoryFilter === c}
              className={`rounded-lg px-2.5 py-1 text-[11px] font-semibold transition ${
                eventCategoryFilter === c ? "bg-[#fafaf8] text-[#111110]" : "text-[#1a1a1a]/45 hover:text-[#111110]"
              }`}
            >
              {c}
            </button>
          ))}
        </div>
        <div className="flex-1" />
        <div className="flex items-center gap-1 rounded-xl border border-[#e8e8e4] bg-white p-0.5" role="group" aria-label="행사 정렬 기준">
          {(["date", "leads", "deals", "roi"] as const).map((s) => {
            const label = { date: "날짜", leads: "리드", deals: "딜", roi: "ROI" }[s]
            return (
              <button
                key={s}
                type="button"
                onClick={() => setEventSort(s)}
                aria-pressed={eventSort === s}
                className={`rounded-lg px-2.5 py-1 text-[11px] font-semibold transition ${
                  eventSort === s
                    ? "bg-[#fafaf8] text-[#111110] shadow-sm"
                    : "text-[#1a1a1a]/45 hover:text-[#111110]"
                }`}
              >
                {label}
              </button>
            )
          })}
        </div>
        <button
          type="button"
          onClick={() => {
            setPeriod((p) => (p === "all" ? "active" : "all"))
          }}
          className="flex items-center gap-1 text-[12px] font-medium text-[#1a1a1a]/45 hover:text-[#111110]"
        >
          {period === "all" ? <ChevronLeft className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
          {period === "all" ? "축소" : "전체 기간 보기"}
        </button>
      </div>

      <EventOriginMatrix className="mb-4" />

      {loading ? (
        <div className="space-y-3" aria-busy="true">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-40 animate-pulse rounded-2xl border border-[#e8e8e4] bg-[#f0f0ec]" />
          ))}
        </div>
      ) : sortedEvents.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-[#e8e8e4] bg-[#fafaf8] py-12 text-center">
          <p className="text-[14px] font-medium text-[#111110]">표시할 행사가 없습니다</p>
          <p className="mx-auto mt-1 max-w-md text-[12px] text-[#1a1a1a]/40">
            기간 필터를 바꾸거나 행사 관리에서 새 행사를 등록하세요.
          </p>
        </div>
      ) : visibleEvents.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-[#e8e8e4] bg-[#fafaf8] py-12 text-center">
          <p className="text-[14px] font-medium text-[#111110]">필터에 맞는 행사가 없습니다</p>
          <button
            type="button"
            onClick={() => {
              setEventSearch("")
              setEventStatusFilter("all")
              setEventCategoryFilter("all")
            }}
            className="mt-2 text-[12px] font-medium text-[#084734] hover:underline"
          >
            필터 초기화
          </button>
        </div>
      ) : galleryView ? (
        <div className="space-y-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {visibleEvents.slice(0, galleryVisible.visible).map((event) => (
              <EventGalleryCard key={event.id} event={event} onOpen={() => setViewingEvent(event)} />
            ))}
          </div>
          {(galleryVisible.canMore || galleryVisible.canCollapse) && (
            <div className="flex justify-center">
              <ShowMore
                visible={galleryVisible.visible}
                total={visibleEvents.length}
                step={GALLERY_STEP}
                onMore={galleryVisible.showMore}
                onCollapse={galleryVisible.canCollapse ? galleryVisible.collapse : undefined}
              />
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {visibleEvents.slice(0, cardsVisible.visible).map((event) => {
            const metrics = metricsMap[event.id] ?? {
              ...DEFAULT_EVENT_METRICS,
              eventId: event.id,
              updatedAt: "",
            }
            const leadStats = eventLeadStats.get(event.id) ?? { attributed: 0, during: 0 }
            return (
              <EventFunnelCard
                key={event.id}
                event={event}
                metrics={metrics}
                attributedLeadCount={leadStats.attributed}
                duringLeadCount={leadStats.during}
                onEdit={() => setEditing(event)}
              />
            )
          })}
          {(cardsVisible.canMore || cardsVisible.canCollapse) && (
            <div className="flex justify-center">
              <ShowMore
                visible={cardsVisible.visible}
                total={visibleEvents.length}
                step={EVENT_CARD_STEP}
                onMore={cardsVisible.showMore}
                onCollapse={cardsVisible.canCollapse ? cardsVisible.collapse : undefined}
              />
            </div>
          )}
        </div>
      )}

      {viewingEvent && (
        <EventDetailModal
          event={viewingEvent}
          metrics={
            metricsMap[viewingEvent.id] ?? {
              ...DEFAULT_EVENT_METRICS,
              eventId: viewingEvent.id,
              updatedAt: "",
            }
          }
          attributedLeadCount={(eventLeadStats.get(viewingEvent.id) ?? { attributed: 0, during: 0 }).attributed}
          duringLeadCount={(eventLeadStats.get(viewingEvent.id) ?? { attributed: 0, during: 0 }).during}
          onClose={() => setViewingEvent(null)}
          onEdit={() => {
            const target = viewingEvent
            setViewingEvent(null)
            setEditing(target)
          }}
        />
      )}

      {editing && (
        <MetricsEditor
          event={editing}
          metrics={
            metricsMap[editing.id] ?? {
              ...DEFAULT_EVENT_METRICS,
              eventId: editing.id,
              updatedAt: "",
            }
          }
          onClose={() => setEditing(null)}
          onSaved={onMetricsSaved}
        />
      )}
    </>
  )
}
