"use client"

import { useMemo, type Dispatch, type SetStateAction } from "react"
import {
  ChevronLeft,
  ChevronRight,
  LayoutGrid,
  List as ListIcon,
  Search,
} from "lucide-react"
import { CampaignExportButton } from "@/components/admin/campaigns/CampaignExportButton"
import type { ExportColumn } from "@/components/admin/campaigns/CampaignExportButton"
import { EventOriginMatrix } from "@/components/admin/campaigns/EventOriginMatrix"
import { EventCardHeader } from "@/components/admin/campaigns/EventCardHeader"
import { EventDetailContent, buildFunnel } from "@/components/admin/campaigns/EventDetailContent"
import { EventGalleryCard } from "@/components/admin/campaigns/EventGalleryCard"
import { EventDetailModal } from "@/components/admin/campaigns/EventDetailModal"
import { filterEvents } from "@/components/admin/campaigns/filter-events"
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
import MetricsEditor from "./MetricsEditor"
import type { EventLeadStats, EventSortKey, PerEventEconRow, Period } from "./types"

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
        search: eventSearch,
        status: eventStatusFilter,
        category: eventCategoryFilter,
      }),
    [sortedEvents, eventSearch, eventStatusFilter, eventCategoryFilter]
  )

  // CSV 내보내기 — 행사
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
    const rows: Array<Record<string, string | number | null>> = sortedEvents.map((ev) => {
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
  }, [perEventEcon, sortedEvents, metricsMap, eventLeadStats])

  return (
    <>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <h2 className="flex-1 text-[15px] font-semibold text-[#111110]">행사별 퍼널 상세</h2>
        <div className="inline-flex rounded-lg border border-[rgba(0,0,0,0.08)] bg-[#F6F5F4] p-[3px]" role="group" aria-label="행사 보기 방식">
          <button
            type="button"
            onClick={() => setViewParam("list")}
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
        <div className="flex min-w-[160px] flex-1 items-center gap-1.5 rounded-lg border border-[#e8e8e4] bg-white px-2.5 py-1.5">
          <Search className="h-3.5 w-3.5 text-[#1a1a1a]/35" />
          <input
            type="text"
            value={eventSearch}
            onChange={(e) => setEventSearch(e.target.value)}
            placeholder="행사명 검색..."
            className="w-full text-[12px] outline-none placeholder:text-[#1a1a1a]/35"
          />
        </div>
        <div className="flex items-center gap-1 rounded-xl border border-[#e8e8e4] bg-white p-0.5">
          {(["all", "진행 중", "예정", "마감"] as const).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setEventStatusFilter(s)}
              className={`rounded-lg px-2.5 py-1 text-[11px] font-semibold transition ${
                eventStatusFilter === s ? "bg-[#fafaf8] text-[#111110]" : "text-[#1a1a1a]/45 hover:text-[#111110]"
              }`}
            >
              {s === "all" ? "전체" : s}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1 rounded-xl border border-[#e8e8e4] bg-white p-0.5">
          <button
            type="button"
            onClick={() => setEventCategoryFilter("all")}
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
              className={`rounded-lg px-2.5 py-1 text-[11px] font-semibold transition ${
                eventCategoryFilter === c ? "bg-[#fafaf8] text-[#111110]" : "text-[#1a1a1a]/45 hover:text-[#111110]"
              }`}
            >
              {c}
            </button>
          ))}
        </div>
        <div className="flex-1" />
        <div className="flex items-center gap-1 rounded-xl border border-[#e8e8e4] bg-white p-0.5">
          {(["date", "leads", "deals", "roi"] as const).map((s) => {
            const label = { date: "날짜", leads: "리드", deals: "딜", roi: "ROI" }[s]
            return (
              <button
                key={s}
                type="button"
                onClick={() => setEventSort(s)}
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
        <div className="rounded-2xl border border-dashed border-[#e8e8e4] bg-[#fafaf8] py-16 text-center text-[13px] text-[#1a1a1a]/30">
          불러오는 중...
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
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {visibleEvents.map((event) => (
            <EventGalleryCard key={event.id} event={event} onOpen={() => setViewingEvent(event)} />
          ))}
        </div>
      ) : (
        <div className="space-y-3">
          {visibleEvents.map((event) => {
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
