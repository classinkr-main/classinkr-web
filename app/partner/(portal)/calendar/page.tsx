"use client"

import { useCallback, useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { CalendarDays, ChevronLeft, ChevronRight, MapPinned, Plus, RefreshCw, Users, Wrench } from "lucide-react"

import { MobileActionLauncher } from "@/components/partner-portal/mobile/MobileActionLauncher"
import { PortalNav } from "@/components/partner-portal/PortalNav"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { ScheduleDialog } from "@/components/partner-portal/crud/ScheduleDialog"
import { portalFetch } from "@/lib/partner-portal/portal-fetch"
import type { PartnerReadMode } from "@/lib/partner-portal/repositories/partner-read"
import type { CalendarEvent, CalendarSourceType, CustomerListItem, DealListItem } from "@/lib/partner-portal/types"

type CalendarFilter = "all" | CalendarSourceType
type PartnerCalendarPayload = { mode: PartnerReadMode; events: CalendarEvent[] }
type PartnerDealPayload = { deals: DealListItem[] }
type PartnerCustomerPayload = { customers: CustomerListItem[] }

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"]
const FILTERS: { value: CalendarFilter; label: string }[] = [
  { value: "all", label: "전체" },
  { value: "installation", label: "설치" },
  { value: "meeting", label: "미팅" },
  { value: "document_due", label: "문서 기한" },
  { value: "internal", label: "내부 일정" },
]

const DEMO_EVENTS: CalendarEvent[] = [
  { id: "demo-calendar-1", partner_account_id: "demo", customer_id: "c1", deal_id: "d1", source_type: "installation", source_id: "s1", starts_at: "2026-04-20T09:00:00+09:00", ends_at: "2026-04-20T17:00:00+09:00", timezone: "Asia/Seoul", title: "강남메가스터디학원 설치", description: "전자칠판 4대, T1 2대", status: "active", created_by: null, created_at: "2026-04-03T09:00:00Z", updated_at: "2026-04-03T09:00:00Z" },
  { id: "demo-calendar-2", partner_account_id: "demo", customer_id: "c1", deal_id: "d2", source_type: "meeting", source_id: "s2", starts_at: "2026-04-16T14:00:00+09:00", ends_at: "2026-04-16T15:00:00+09:00", timezone: "Asia/Seoul", title: "추가 계약 범위 조정 미팅", description: "본관 추가 설치 관 확장 여부 확인", status: "active", created_by: null, created_at: "2026-04-02T05:00:00Z", updated_at: "2026-04-02T05:00:00Z" },
  { id: "demo-calendar-3", partner_account_id: "demo", customer_id: "c2", deal_id: "d3", source_type: "document_due", source_id: "s3", starts_at: "2026-04-12T10:00:00+09:00", ends_at: "2026-04-12T11:00:00+09:00", timezone: "Asia/Seoul", title: "견적 링크 만료 전 확인", description: "추가 견적 링크 확인", status: "active", created_by: null, created_at: "2026-04-01T01:00:00Z", updated_at: "2026-04-01T01:00:00Z" },
  { id: "demo-calendar-4", partner_account_id: "demo", customer_id: "c1", deal_id: "d1", source_type: "installation", source_id: "s4", starts_at: "2026-04-24T08:00:00+09:00", ends_at: "2026-04-25T18:00:00+09:00", timezone: "Asia/Seoul", title: "본관 2일 설치 일정", description: "2층, 3층, 4층 순차 설치", status: "active", created_by: null, created_at: "2026-04-03T09:00:00Z", updated_at: "2026-04-03T09:00:00Z" },
]

const readJson = <T,>(url: string) =>
  fetch(url, { cache: "no-store" }).then(async (response) => {
    if (!response.ok) throw new Error(`Request failed: ${response.status}`)
    return (await response.json()) as T
  })

const pad = (value: number) => String(value).padStart(2, "0")
const dateKey = (year: number, month: number, day: number) => `${year}-${pad(month)}-${pad(day)}`
const localDateKey = (value: string | Date) => {
  const date = typeof value === "string" ? new Date(value) : value
  return dateKey(date.getFullYear(), date.getMonth() + 1, date.getDate())
}
const fromDateKey = (value: string) => {
  const [year, month, day] = value.split("-").map(Number)
  return new Date(year, month - 1, day)
}
const addDays = (value: Date, amount: number) => {
  const next = new Date(value)
  next.setDate(next.getDate() + amount)
  return next
}

function sourceLabel(source: CalendarSourceType) {
  return (
    {
      installation: "설치",
      meeting: "미팅",
      document_due: "문서 기한",
      internal: "내부 일정",
    }[source] ?? source
  )
}

function sourceTone(source: CalendarSourceType) {
  return (
    {
      installation: "bg-amber-50 text-amber-700 border-amber-200",
      meeting: "bg-blue-50 text-blue-700 border-blue-200",
      document_due: "bg-violet-50 text-violet-700 border-violet-200",
      internal: "bg-slate-100 text-slate-700 border-slate-200",
    }[source] ?? "bg-white text-[#1a1a1a]/60 border-[#e8e8e4]"
  )
}

function sortEvents(events: CalendarEvent[]) {
  return [...events].sort((left, right) => new Date(left.starts_at).getTime() - new Date(right.starts_at).getTime())
}

function buildDateMap(events: CalendarEvent[]) {
  const map = new Map<string, CalendarEvent[]>()
  for (const event of events) {
    let cursor = fromDateKey(localDateKey(event.starts_at))
    const end = fromDateKey(localDateKey(event.ends_at))
    while (cursor.getTime() <= end.getTime()) {
      const key = localDateKey(cursor)
      map.set(key, [...(map.get(key) ?? []), event])
      cursor = addDays(cursor, 1)
    }
  }
  for (const [key, items] of map.entries()) map.set(key, sortEvents(items))
  return map
}

export default function PartnerCalendarPage() {
  const router = useRouter()
  const today = new Date()
  const todayKey = localDateKey(today)
  const [mode, setMode] = useState<PartnerReadMode>("demo")
  const [events, setEvents] = useState<CalendarEvent[]>(DEMO_EVENTS)
  const [actionDeals, setActionDeals] = useState<DealListItem[]>([])
  const [actionCustomers, setActionCustomers] = useState<CustomerListItem["customer"][]>([])
  const [filter, setFilter] = useState<CalendarFilter>("all")
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [viewDate, setViewDate] = useState(() => new Date(today.getFullYear(), today.getMonth(), 1))
  const [selectedDate, setSelectedDate] = useState(todayKey)
  const [deals, setDeals] = useState<DealListItem[]>([])
  const [scheduleOpen, setScheduleOpen] = useState(false)
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null)
  const refreshPortal = useCallback(() => {
    window.location.reload()
  }, [])

  useEffect(() => {
    let alive = true
    async function load() {
      setLoading(true)
      setError(null)
      const [calendarResult, dealsResult, customersResult] = await Promise.allSettled([
        readJson<PartnerCalendarPayload>("/api/partner/calendar"),
        readJson<PartnerDealPayload>("/api/partner/deals"),
        readJson<PartnerCustomerPayload>("/api/partner/customers"),
      ])

      if (!alive) return

      if (calendarResult.status === "fulfilled") {
        const nextEvents =
          calendarResult.value.events.length > 0 ? calendarResult.value.events : DEMO_EVENTS
        setMode(calendarResult.value.mode ?? "demo")
        setEvents(nextEvents)
      } else {
        if (!alive) return
        setMode("demo")
        setEvents(DEMO_EVENTS)
        setError("연결된 계정이 없어 데모 일정으로 전환했습니다.")
      }

      setActionDeals(
        dealsResult.status === "fulfilled" ? dealsResult.value.deals : []
      )
      setActionCustomers(
        customersResult.status === "fulfilled"
          ? customersResult.value.customers.map((item) => item.customer)
          : []
      )
      setLoading(false)
    }
    void load()
    return () => {
      alive = false
    }
  }, [])

  useEffect(() => {
    void portalFetch("/api/portal/deals")
      .then((r) => r.json())
      .then((data) => setDeals(data.deals ?? []))
      .catch(() => {})
  }, [])

  const visibleEvents = sortEvents(filter === "all" ? events : events.filter((event) => event.source_type === filter))
  const dateMap = buildDateMap(visibleEvents)
  const firstDay = new Date(viewDate.getFullYear(), viewDate.getMonth(), 1).getDay()
  const daysInMonth = new Date(viewDate.getFullYear(), viewDate.getMonth() + 1, 0).getDate()
  const selectedDayEvents = dateMap.get(selectedDate) ?? []
  const installationCount = events.filter((event) => event.source_type === "installation").length
  const upcomingCount = visibleEvents.filter((event) => localDateKey(event.ends_at) >= todayKey).length
  const canCreateInPortal = mode === "v2"
  const selectedEvent =
    selectedDayEvents.find((event) => event.id === selectedEventId) ?? selectedDayEvents[0] ?? null
  const selectedDealId = selectedEvent?.deal_id ?? selectedDayEvents.find((event) => event.deal_id)?.deal_id ?? null

  const cells: (string | null)[] = []
  for (let index = 0; index < firstDay; index += 1) cells.push(null)
  for (let day = 1; day <= daysInMonth; day += 1) cells.push(dateKey(viewDate.getFullYear(), viewDate.getMonth() + 1, day))
  while (cells.length % 7 !== 0) cells.push(null)

  function shiftMonth(offset: number) {
    const next = new Date(viewDate.getFullYear(), viewDate.getMonth() + offset, 1)
    setViewDate(next)
    setSelectedDate(dateKey(next.getFullYear(), next.getMonth() + 1, 1))
  }

  return (
    <div className="mx-auto max-w-[1600px] px-5 py-6 lg:px-8">
        <Card className="border-[#e8e8e4] bg-white shadow-none">
          <CardContent className="flex flex-col gap-4 p-5 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-3xl">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline" className="border-[#1a1a1a]/15 bg-[#1a1a1a] text-white">{mode === "demo" ? "DEMO" : "LIVE"}</Badge>
                <Badge variant="outline" className="border-[#e8e8e4] bg-white text-[#1a1a1a]/50">Shared Calendar</Badge>
              </div>
              <h1 className="mt-3 text-3xl font-semibold tracking-tight lg:text-4xl">파트너 포털 캘린더</h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-[#1a1a1a]/50">설치, 미팅, 문서 기한을 달력과 리스트 두 방식으로 보고 관리자와 같은 일정 원본을 확인합니다.</p>
            </div>
            <div className="flex flex-wrap justify-end gap-2 self-end">
              {mode !== "demo" && deals.length > 0 && (
                <button
                  type="button"
                  onClick={() => setScheduleOpen(true)}
                  className="inline-flex items-center gap-2 rounded-xl bg-[#1a1a1a] px-4 py-2.5 text-sm font-medium text-white hover:bg-[#1a1a1a]/85"
                >
                  <Plus className="h-4 w-4" />
                  일정 추가
                </button>
              )}
              <button type="button" onClick={() => router.refresh()} className="inline-flex items-center gap-2 rounded-xl border border-[#e8e8e4] bg-white px-4 py-2.5 text-sm font-medium text-[#1a1a1a] hover:bg-[#f7f7f5]">
                새로고침
                <RefreshCw className="h-4 w-4" />
              </button>
            </div>
          </CardContent>
        </Card>

        {error && <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">{error}</div>}

        <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1.2fr)_360px]">
          <Card className="border-[#e8e8e4] bg-white shadow-none">
            <CardHeader className="gap-4 pb-4">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <CardTitle className="text-lg font-semibold">월간 캘린더</CardTitle>
                  <p className="mt-1 text-sm text-[#1a1a1a]/45">다일 설치도 날짜별로 이어서 표시합니다.</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {FILTERS.map((item) => (
                    <button key={item.value} type="button" onClick={() => setFilter(item.value)} className={`rounded-full border px-3 py-1.5 text-sm transition-colors ${filter === item.value ? "border-[#1a1a1a] bg-[#1a1a1a] text-white" : "border-[#e8e8e4] bg-[#f7f7f5] text-[#1a1a1a]/60 hover:bg-white hover:text-[#1a1a1a]"}`}>{item.label}</button>
                  ))}
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between rounded-2xl border border-[#e8e8e4] bg-[#f7f7f5] px-4 py-4">
                <button type="button" onClick={() => shiftMonth(-1)} className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-[#e8e8e4] bg-white"><ChevronLeft className="h-4 w-4" /></button>
                <div className="text-center">
                  <p className="text-sm font-semibold">{viewDate.toLocaleDateString("ko-KR", { year: "numeric", month: "long" })}</p>
                  <p className="text-xs text-[#1a1a1a]/45">필터 결과 {visibleEvents.length}건</p>
                </div>
                <button type="button" onClick={() => shiftMonth(1)} className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-[#e8e8e4] bg-white"><ChevronRight className="h-4 w-4" /></button>
              </div>

              <div className="grid grid-cols-7 gap-px overflow-hidden rounded-2xl border border-[#e8e8e4] bg-[#ecece8]">
                {WEEKDAYS.map((day) => <div key={day} className="bg-[#f7f7f5] px-3 py-2 text-center text-[11px] font-medium text-[#1a1a1a]/45">{day}</div>)}
                {cells.map((cell, index) => {
                  if (!cell) return <div key={`empty-${index}`} className="min-h-[116px] bg-white/60" />
                  const cellEvents = dateMap.get(cell) ?? []
                  const isToday = cell === todayKey
                  const isSelected = cell === selectedDate
                  return (
                    <button
                      key={cell}
                      type="button"
                      onClick={() => {
                        setSelectedDate(cell)
                        setSelectedEventId(dateMap.get(cell)?.[0]?.id ?? null)
                      }}
                      className={`min-h-[116px] bg-white p-2 text-left transition-colors ${isSelected ? "bg-[#f6f6f3]" : "hover:bg-[#fbfbf9]"}`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className={`inline-flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold ${isToday ? "bg-[#1a1a1a] text-white" : "text-[#1a1a1a]/70"}`}>{Number(cell.slice(-2))}</span>
                        {cellEvents.length > 0 && <span className="text-[10px] text-[#1a1a1a]/35">{cellEvents.length}건</span>}
                      </div>
                      <div className="mt-2 space-y-1">
                        {cellEvents.slice(0, 2).map((event) => (
                          <div key={`${cell}-${event.id}`} className="rounded-lg border border-[#ecece8] bg-[#fafaf8] px-2 py-1">
                            <div className="flex items-center gap-1.5">
                              <span className={`h-1.5 w-1.5 rounded-full ${sourceTone(event.source_type).includes("amber") ? "bg-amber-500" : sourceTone(event.source_type).includes("blue") ? "bg-blue-500" : sourceTone(event.source_type).includes("violet") ? "bg-violet-500" : "bg-slate-500"}`} />
                              <p className="truncate text-[11px] font-medium text-[#1a1a1a]">{event.title}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </button>
                  )
                })}
              </div>
            </CardContent>
          </Card>

          <div className="space-y-6">
            <Card className="border-[#e8e8e4] bg-white shadow-none">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-semibold">{fromDateKey(selectedDate).toLocaleDateString("ko-KR", { month: "long", day: "numeric", weekday: "short" })}</CardTitle>
                <p className="text-sm text-[#1a1a1a]/45">선택한 날짜와 겹치는 일정 {selectedDayEvents.length}건</p>
              </CardHeader>
              <CardContent className="space-y-3">
                {selectedDayEvents.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-[#e0e0dc] bg-[#fafaf8] px-4 py-8 text-center text-sm text-[#1a1a1a]/45">선택한 날짜에 표시할 일정이 없습니다.</div>
                ) : selectedDayEvents.map((event) => (
                  <button
                    key={`${selectedDate}-${event.id}`}
                    type="button"
                    onClick={() => setSelectedEventId(event.id)}
                    className={`w-full rounded-xl border p-4 text-left transition-colors ${
                      selectedEvent?.id === event.id
                        ? "border-[#1a1a1a] bg-[#f6f6f3]"
                        : "border-[#e8e8e4] bg-[#fcfcfb] hover:bg-white"
                    }`}
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`rounded-full border px-2 py-1 text-xs font-medium ${sourceTone(event.source_type)}`}>{sourceLabel(event.source_type)}</span>
                      <span className="text-xs text-[#1a1a1a]/45">{new Date(event.starts_at).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" })} - {new Date(event.ends_at).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" })}</span>
                    </div>
                    <p className="mt-3 text-sm font-semibold">{event.title}</p>
                    <p className="mt-1 text-sm text-[#1a1a1a]/55">{event.description ?? "세부 메모가 아직 없습니다."}</p>
                    <div className="mt-3 flex items-center gap-2 text-xs text-[#1a1a1a]/45"><MapPinned className="h-3.5 w-3.5" />{event.timezone}</div>
                  </button>
                ))}
              </CardContent>
            </Card>

            <Card className="border-[#e8e8e4] bg-white shadow-none">
              <CardHeader className="pb-3"><CardTitle className="text-sm font-semibold">빠른 보기</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center justify-between rounded-xl border border-[#e8e8e4] bg-[#f7f7f5] px-4 py-3"><div className="flex items-center gap-2 text-sm text-[#1a1a1a]/60"><Wrench className="h-4 w-4 text-amber-600" />설치 일정</div><span className="text-sm font-semibold">{installationCount}건</span></div>
                <div className="flex items-center justify-between rounded-xl border border-[#e8e8e4] bg-[#f7f7f5] px-4 py-3"><div className="flex items-center gap-2 text-sm text-[#1a1a1a]/60"><Users className="h-4 w-4 text-blue-600" />오늘 이후 일정</div><span className="text-sm font-semibold">{upcomingCount}건</span></div>
                <div className="flex items-center justify-between rounded-xl border border-[#e8e8e4] bg-[#f7f7f5] px-4 py-3"><div className="flex items-center gap-2 text-sm text-[#1a1a1a]/60"><CalendarDays className="h-4 w-4" />현재 필터</div><span className="text-sm font-semibold">{visibleEvents.length}건</span></div>
              </CardContent>
            </Card>
          </div>
        </div>

        <div className="mt-6">
          <Card className="border-[#e8e8e4] bg-white shadow-none">
            <CardHeader className="pb-4">
              <CardTitle className="text-lg font-semibold">일정 리스트</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {loading ? (
                Array.from({ length: 4 }).map((_, index) => <div key={index} className="h-24 animate-pulse rounded-2xl bg-[#f0f0ec]" />)
              ) : visibleEvents.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-[#e0e0dc] bg-[#fafaf8] px-4 py-10 text-center text-sm text-[#1a1a1a]/45">조건에 맞는 일정이 없습니다.</div>
              ) : (
                visibleEvents.map((event) => (
                  <div key={event.id} className="rounded-2xl border border-[#e8e8e4] bg-[#fcfcfb] p-4">
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className={`rounded-full border px-2 py-1 text-xs font-medium ${sourceTone(event.source_type)}`}>{sourceLabel(event.source_type)}</span>
                          <span className="text-xs text-[#1a1a1a]/45">{fromDateKey(localDateKey(event.starts_at)).toLocaleDateString("ko-KR", { month: "long", day: "numeric", weekday: "short" })}</span>
                        </div>
                        <p className="mt-3 text-base font-semibold">{event.title}</p>
                        <p className="mt-1 text-sm text-[#1a1a1a]/55">{event.description ?? "세부 메모가 아직 없습니다."}</p>
                      </div>
                      <div className="min-w-[180px] rounded-xl border border-[#ecece8] bg-white px-3 py-3 text-sm text-[#1a1a1a]/60">
                        <div className="flex items-center gap-2"><MapPinned className="h-4 w-4 text-[#1a1a1a]/30" />{event.timezone}</div>
                        <p className="mt-2 text-xs text-[#1a1a1a]/45">거래 ID: {event.deal_id ?? "-"}</p>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </div>

        <ScheduleDialog
          open={scheduleOpen}
          onOpenChange={setScheduleOpen}
          deals={deals}
          onSaved={() => { router.refresh() }}
        />

      <MobileActionLauncher
        screen="calendar"
        customers={actionCustomers}
        deals={actionDeals}
        canCreate={canCreateInPortal}
        defaultDealId={selectedDealId}
        selectedDate={selectedDate}
        selectedEvent={selectedEvent}
        onSaved={refreshPortal}
      />
      </div>
  )
}
