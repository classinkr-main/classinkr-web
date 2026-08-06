"use client"

import Link from "next/link"
import { useCallback, useEffect, useMemo, useState } from "react"
import { ArrowUpRight, CalendarDays } from "lucide-react"

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { adminFetch, adminFetchJsonCached } from "@/lib/admin-client"
import type { CalendarEvent, EventSource } from "@/lib/calendar-data"
import { buildEventsByDate } from "@/lib/admin-calendar/layout"
import {
  getViewRange,
  isCalendarViewId,
  isDateString,
  stepAnchor,
  toDateString,
  type CalendarViewId,
} from "@/lib/admin-calendar/range"
import { getTeamMemberColor } from "@/lib/team-member-colors"

import { AgendaList } from "@/components/admin/calendar/AgendaList"
import { AssigneeSwimlane } from "@/components/admin/calendar/AssigneeSwimlane"
import { CalendarFilterBar, type TeamMemberCount } from "@/components/admin/calendar/CalendarFilterBar"
import { CalendarToolbar } from "@/components/admin/calendar/CalendarToolbar"
import { DayDetailPanel } from "@/components/admin/calendar/DayDetailPanel"
import { EventForm, EMPTY_EVENT_FORM, type EventFormData } from "@/components/admin/calendar/EventForm"
import { MonthGrid } from "@/components/admin/calendar/MonthGrid"
import { SourceTimeline } from "@/components/admin/calendar/SourceTimeline"
import { WeekTimeGrid } from "@/components/admin/calendar/WeekTimeGrid"
import {
  SOURCE_OPTIONS,
  UNASSIGNED_LABEL,
  getEventSource,
  getEventSourceLabel,
  getTypeStyle,
  sortEventFirst,
} from "@/components/admin/calendar/event-style"

const FILTER_STORAGE_KEY = "admin.calendar.filters.v1"
const VIEW_STORAGE_KEY = "admin.calendar.view.v1"

/** 담당자 개념이 없는 소스 — 담당자 필터를 적용하지 않는다. */
const ASSIGNEE_FILTERED_SOURCES = new Set<EventSource>(["team_event", "notion", "showroom", "calendar"])

function todayString() {
  const now = new Date()
  return toDateString(now.getFullYear(), now.getMonth() + 1, now.getDate())
}

function formatDateLabel(dateStr: string) {
  return new Date(`${dateStr}T00:00:00Z`).toLocaleDateString("ko-KR", {
    timeZone: "UTC",
    month: "long",
    day: "numeric",
    weekday: "short",
  })
}

async function readJsonOrThrow<T>(response: Response): Promise<T> {
  const data = await response.json().catch(() => null)
  if (!response.ok) {
    throw new Error(
      data && typeof data === "object" && "error" in data && typeof data.error === "string"
        ? data.error
        : "일정 요청에 실패했습니다."
    )
  }
  return data as T
}

// 캐논 원천은 /api/admin/crm/action-kpis(getLeadActionStats) — Overview·CRM 액션 밴드와
// 동일 수치·동일 정의(status=new AND source∈{데모·문의·Meta}). 여기서 재정의하지 않는다.
interface LeadActionKpisPayload {
  unrespondedCount: number
  unresponded24hCount: number
}

export default function AdminCalendarPage() {
  const [todayStr] = useState(todayString)
  const [view, setView] = useState<CalendarViewId>("month")
  const [anchor, setAnchor] = useState<string>(todayStr)
  const [prefsHydrated, setPrefsHydrated] = useState(false)

  const [events, setEvents] = useState<CalendarEvent[]>([])
  const [hiddenSources, setHiddenSources] = useState<Set<EventSource>>(new Set())
  const [hiddenAssignees, setHiddenAssignees] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(false)
  const [formLoading, setFormLoading] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [leadActionKpis, setLeadActionKpis] = useState<LeadActionKpisPayload | null>(null)

  const [selectedDate, setSelectedDate] = useState<string | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [editingEvent, setEditingEvent] = useState<CalendarEvent | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<CalendarEvent | null>(null)

  const range = useMemo(() => getViewRange(view, anchor), [view, anchor])

  // ─── 저장된 화면 상태 복원 ───────────────────────────────────────
  // 초기 렌더는 기본값(이번 달)으로 두고 마운트 후에 URL·localStorage 를 반영한다 —
  // 서버 렌더 결과와 어긋나 하이드레이션이 깨지는 걸 피한다.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const urlView = params.get("view")
    const urlAnchor = params.get("anchor")

    if (isCalendarViewId(urlView)) setView(urlView)
    else {
      try {
        const stored = localStorage.getItem(VIEW_STORAGE_KEY)
        if (isCalendarViewId(stored)) setView(stored)
      } catch {
        /* localStorage 불가 시 기본 뷰 유지 */
      }
    }
    if (isDateString(urlAnchor)) setAnchor(urlAnchor)

    try {
      const raw = localStorage.getItem(FILTER_STORAGE_KEY)
      if (raw) {
        const parsed = JSON.parse(raw) as { hiddenSources?: unknown; hiddenAssignees?: unknown }
        if (Array.isArray(parsed.hiddenSources)) {
          setHiddenSources(new Set(parsed.hiddenSources as EventSource[]))
        }
        if (Array.isArray(parsed.hiddenAssignees)) {
          setHiddenAssignees(new Set(parsed.hiddenAssignees as string[]))
        }
      }
    } catch {
      /* 파싱 실패 시 기본(전체 표시) 유지 */
    }
    setPrefsHydrated(true)
  }, [])

  // 복원 완료 전에는 초기 빈값으로 덮어쓰지 않도록 가드
  useEffect(() => {
    if (!prefsHydrated) return
    try {
      localStorage.setItem(
        FILTER_STORAGE_KEY,
        JSON.stringify({
          hiddenSources: Array.from(hiddenSources),
          hiddenAssignees: Array.from(hiddenAssignees),
        })
      )
      localStorage.setItem(VIEW_STORAGE_KEY, view)
    } catch {
      /* 저장 실패는 무시 */
    }
  }, [prefsHydrated, hiddenSources, hiddenAssignees, view])

  // 뷰·기간을 주소에 반영해 새로고침·공유가 같은 화면을 연다. 히스토리는 쌓지 않는다.
  useEffect(() => {
    if (!prefsHydrated) return
    const params = new URLSearchParams(window.location.search)
    params.set("view", view)
    params.set("anchor", anchor)
    window.history.replaceState(null, "", `${window.location.pathname}?${params.toString()}`)
  }, [prefsHydrated, view, anchor])

  // ─── 데이터 ──────────────────────────────────────────────────────
  const fetchEvents = useCallback(async () => {
    setLoading(true)
    try {
      const data = await adminFetchJsonCached<CalendarEvent[]>(
        `/api/admin/calendar?from=${range.from}&to=${range.to}`,
        undefined,
        { ttlMs: 60_000 }
      )
      setEvents(data)
      setErrorMessage(null)
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "캘린더 데이터를 불러오지 못했습니다.")
    } finally {
      setLoading(false)
    }
  }, [range.from, range.to])

  useEffect(() => {
    fetchEvents()
  }, [fetchEvents])

  // Overview가 하던 "홈페이지 리드 대응" 진입점을 캘린더로 이관 — 기간 이동과 무관하게 한 번만.
  // 실패해도 배너는 부가 정보일 뿐이라 캘린더 본 기능(일정 조회)을 막지 않는다.
  useEffect(() => {
    let cancelled = false
    adminFetchJsonCached<{ leads: LeadActionKpisPayload }>(
      "/api/admin/crm/action-kpis",
      undefined,
      { cacheKey: "calendar:lead-action-kpis", ttlMs: 120_000, staleWhileRevalidateMs: 300_000 }
    )
      .then((data) => {
        if (!cancelled) setLeadActionKpis(data?.leads ?? null)
      })
      .catch(() => {
        /* 조회 실패 시 배너를 숨긴 채로 둔다 */
      })
    return () => {
      cancelled = true
    }
  }, [])

  // ─── 필터 ────────────────────────────────────────────────────────
  const teamMembers = useMemo<TeamMemberCount[]>(() => {
    const counts = new Map<string, number>()
    for (const event of events) {
      if (!ASSIGNEE_FILTERED_SOURCES.has(getEventSource(event))) continue
      for (const name of event.assignees ?? []) counts.set(name, (counts.get(name) ?? 0) + 1)
    }
    return Array.from(counts.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => a.name.localeCompare(b.name, "ko"))
  }, [events])

  const visibleEvents = useMemo(
    () =>
      events.filter((event) => {
        const source = getEventSource(event)
        if (hiddenSources.has(source)) return false
        if (ASSIGNEE_FILTERED_SOURCES.has(source)) {
          const assignees = event.assignees ?? []
          // 담당자가 있는 일정은 담당자 필터를 적용 — 표시 담당자가 하나도 없으면 숨김
          if (assignees.length > 0 && !assignees.some((name) => !hiddenAssignees.has(name))) {
            return false
          }
        }
        return true
      }),
    [events, hiddenSources, hiddenAssignees]
  )

  const eventsByDate = useMemo(() => {
    const map = buildEventsByDate(visibleEvents)
    // 공개 행사를 각 날짜 최상단으로 — 나머지 항목의 상대 순서는 그대로 둔다.
    for (const key of Object.keys(map)) map[key] = sortEventFirst(map[key])
    return map
  }, [visibleEvents])

  const toggleSource = (source: EventSource) =>
    setHiddenSources((prev) => {
      const next = new Set(prev)
      if (next.has(source)) next.delete(source)
      else next.add(source)
      return next
    })

  const toggleAssignee = (name: string) =>
    setHiddenAssignees((prev) => {
      const next = new Set(prev)
      if (next.has(name)) next.delete(name)
      else next.add(name)
      return next
    })

  // ─── 이번 주 담당자 요약 ─────────────────────────────────────────
  // 담당자 뷰가 이 정보를 훨씬 자세히 보여주므로, 담당자 축이 없는 뷰에서만 띄운다.
  // 회의: "회의할 때 구글 캘린더 켜놓고 '누구누구 이거 합니다' 이런 거 못 하거든요"
  const weekStrip = useMemo(() => {
    if (view === "assignee") return []
    const counts = new Map<string, number>()
    for (const event of visibleEvents) {
      for (const name of event.assignees?.length ? event.assignees : [UNASSIGNED_LABEL]) {
        counts.set(name, (counts.get(name) ?? 0) + 1)
      }
    }
    return Array.from(counts.entries()).sort((a, b) => b[1] - a[1])
  }, [visibleEvents, view])

  // ─── CRUD ────────────────────────────────────────────────────────
  const handleSave = async (data: EventFormData) => {
    setFormLoading(true)
    try {
      const payload = {
        ...data,
        assignees: data.assignees
          ? data.assignees.split(",").map((item) => item.trim()).filter(Boolean)
          : [],
        endDate: data.endDate || undefined,
        time: data.time || undefined,
        endTime: data.endTime || undefined,
        description: data.description || undefined,
      }
      const response = editingEvent
        ? await adminFetch(`/api/admin/calendar/${editingEvent.id}`, {
            method: "PATCH",
            body: JSON.stringify(payload),
          })
        : await adminFetch("/api/admin/calendar", {
            method: "POST",
            body: JSON.stringify(payload),
          })
      await readJsonOrThrow(response)
      setShowForm(false)
      setEditingEvent(null)
      setErrorMessage(null)
      await fetchEvents()
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "일정 저장에 실패했습니다.")
    } finally {
      setFormLoading(false)
    }
  }

  const handleDelete = async (event: CalendarEvent) => {
    if (event.readonly) return
    setFormLoading(true)
    try {
      const response = await adminFetch(`/api/admin/calendar/${event.id}`, { method: "DELETE" })
      await readJsonOrThrow(response)
      setDeleteTarget(null)
      setErrorMessage(null)
      await fetchEvents()
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "일정 삭제에 실패했습니다.")
    } finally {
      setFormLoading(false)
    }
  }

  const openCreate = (date?: string) => {
    setEditingEvent(null)
    setShowForm(true)
    if (date) setSelectedDate(date)
  }

  const openEdit = (event: CalendarEvent) => {
    if (event.readonly) return
    setEditingEvent(event)
    setShowForm(true)
  }

  const defaultCreateDate =
    selectedDate ?? (todayStr >= range.from && todayStr <= range.to ? todayStr : range.from)

  const initialForm: EventFormData = { ...EMPTY_EVENT_FORM, date: defaultCreateDate }
  const editForm: EventFormData = editingEvent
    ? {
        title: editingEvent.title,
        date: editingEvent.date,
        endDate: editingEvent.endDate ?? "",
        time: editingEvent.time ?? "",
        endTime: editingEvent.endTime ?? "",
        type: editingEvent.type,
        description: editingEvent.description ?? "",
        assignees: (editingEvent.assignees ?? []).join(", "),
        allDay: editingEvent.allDay ?? false,
      }
    : initialForm

  const selectedEvents = selectedDate ? (eventsByDate[selectedDate] ?? []) : []
  const upcomingEvents = visibleEvents
    .filter((event) => (event.endDate ?? event.date) >= todayStr)
    .slice(0, 8)

  const [year, month] = range.from.split("-").map(Number)

  return (
    <div className="px-4 pt-6 pb-24 sm:px-6 sm:pt-8 lg:px-8 lg:pt-10 lg:pb-20">
      {/* Header */}
      <div className="mb-5 sm:mb-6">
        <p className="mb-1 text-[11px] font-medium uppercase tracking-widest text-[#1a1a1a]/30">Admin</p>
        <h1 className="text-2xl font-bold tracking-[-0.02em] text-[#111110]">운영 캘린더</h1>
        <p className="mt-2 text-[13px] leading-6 text-[#1a1a1a]/50">
          팀 일정과 파트너 운영 일정, 공개 행사, 마케팅(노션), 쇼룸 예약(구글), 팀원 행사(구글)를 함께 보되
          외부 소스 일정은 읽기 전용으로 표시합니다.
        </p>
      </div>

      {errorMessage && (
        <div className="mb-6 rounded-2xl border border-[#F6D5C5] bg-[#FEF3EE] px-5 py-4 text-[12px] leading-5 text-[#B85C33]">
          <strong className="mr-2">캘린더 오류:</strong>
          <span>{errorMessage}</span>
        </div>
      )}

      {/* 미응답 리드 배너 — 0건이면 소음이라 렌더하지 않는다. */}
      {leadActionKpis && leadActionKpis.unrespondedCount > 0 && (
        <Link
          href="/admin/crm"
          className="mb-5 flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-[#F6D5C5] bg-[#FEF3EE] px-5 py-3 text-[12px] font-medium text-[#B85C33] transition-colors hover:border-[#B85C33]/35"
        >
          <span>
            미응답 리드 <strong className="font-semibold">{leadActionKpis.unrespondedCount}건</strong>
            {" "}· 데모·문의·Meta 신규 문의가 대기 중입니다
            {leadActionKpis.unresponded24hCount > 0 && (
              <span className="ml-1 text-[#9A4A27]">(24h+ {leadActionKpis.unresponded24hCount}건)</span>
            )}
          </span>
          <span className="inline-flex shrink-0 items-center gap-0.5 text-[11px]">
            CRM에서 확인
            <ArrowUpRight className="h-3 w-3" />
          </span>
        </Link>
      )}

      <div className="mb-5">
        <CalendarFilterBar
          events={events}
          visibleEvents={visibleEvents}
          teamMembers={teamMembers}
          hiddenSources={hiddenSources}
          hiddenAssignees={hiddenAssignees}
          onToggleSource={toggleSource}
          onToggleAssignee={toggleAssignee}
          onSetAllSources={(visible) =>
            setHiddenSources(visible ? new Set() : new Set(SOURCE_OPTIONS.map((option) => option.value)))
          }
          onSetAllAssignees={(visible) =>
            setHiddenAssignees(visible ? new Set() : new Set(teamMembers.map((member) => member.name)))
          }
        />
      </div>

      {weekStrip.length > 0 && (
        <div className="mb-5 flex flex-wrap items-center gap-2 rounded-2xl border border-[#e8e8e4] bg-white px-4 py-3">
          <span className="mr-1 shrink-0 text-[11px] font-semibold uppercase tracking-wider text-[#1a1a1a]/35">
            담당자별
          </span>
          {weekStrip.map(([assignee, count]) => (
            <span
              key={assignee}
              className="inline-flex items-center gap-1.5 rounded-full border border-[#e8e8e4] bg-[#fafaf8] px-2.5 py-1 text-[11px] font-medium text-[#1a1a1a]/70"
            >
              <span
                className="h-1.5 w-1.5 shrink-0 rounded-full"
                style={{ backgroundColor: getTeamMemberColor(assignee) }}
              />
              {assignee}
              <span className="text-[#1a1a1a]/35">{count}</span>
            </span>
          ))}
        </div>
      )}

      {/* Main */}
      <div className="flex flex-col items-stretch gap-5 xl:flex-row xl:items-start">
        <div className="min-w-0 flex-1 overflow-hidden rounded-2xl border border-[#e8e8e4] bg-white">
          <CalendarToolbar
            view={view}
            anchor={anchor}
            loading={loading}
            onViewChange={(next) => {
              setView(next)
              setSelectedDate(null)
            }}
            onStep={(direction) => {
              setAnchor((current) => stepAnchor(view, current, direction))
              setSelectedDate(null)
            }}
            onToday={() => {
              setAnchor(todayStr)
              setSelectedDate(todayStr)
            }}
            onCreate={() => openCreate()}
          />

          {view === "month" && (
            <MonthGrid
              year={year}
              month={month}
              todayStr={todayStr}
              selectedDate={selectedDate}
              eventsByDate={eventsByDate}
              onSelectDate={setSelectedDate}
              onCreateAt={openCreate}
            />
          )}
          {view === "week" && (
            <WeekTimeGrid
              range={range}
              todayStr={todayStr}
              selectedDate={selectedDate}
              eventsByDate={eventsByDate}
              visibleEvents={visibleEvents}
              onSelectDate={setSelectedDate}
              onCreateAt={openCreate}
            />
          )}
          {view === "assignee" && (
            <AssigneeSwimlane
              range={range}
              todayStr={todayStr}
              visibleEvents={visibleEvents}
              onSelectDate={setSelectedDate}
            />
          )}
          {view === "timeline" && (
            <SourceTimeline
              range={range}
              todayStr={todayStr}
              visibleEvents={visibleEvents}
              onSelectDate={setSelectedDate}
            />
          )}
          {view === "agenda" && (
            <AgendaList
              range={range}
              todayStr={todayStr}
              visibleEvents={visibleEvents}
              onSelectDate={setSelectedDate}
            />
          )}
        </div>

        {/* Right panel */}
        <div className="w-full shrink-0 space-y-4 xl:w-90">
          {selectedDate ? (
            <DayDetailPanel
              date={selectedDate}
              events={selectedEvents}
              onClose={() => setSelectedDate(null)}
              onCreate={openCreate}
              onEdit={openEdit}
              onDelete={setDeleteTarget}
            />
          ) : (
            <div className="overflow-hidden rounded-2xl border border-[#e8e8e4] bg-white">
              <div className="border-b border-[#e8e8e4] px-4 py-3">
                <p className="text-[13px] font-semibold text-[#111110]">다가오는 일정</p>
                <p className="mt-0.5 text-[11px] text-[#1a1a1a]/35">현재 기간 안에서</p>
              </div>
              {upcomingEvents.length === 0 ? (
                <div className="py-8 text-center">
                  <CalendarDays className="mx-auto mb-2 h-8 w-8 text-[#1a1a1a]/15" />
                  <p className="text-[13px] text-[#1a1a1a]/30">예정된 일정 없음</p>
                </div>
              ) : (
                <div className="divide-y divide-[#f0f0ec]">
                  {upcomingEvents.map((event) => {
                    const style = getTypeStyle(event.type)
                    const daysLeft = Math.round(
                      (Date.parse(`${event.date}T00:00:00Z`) - Date.parse(`${todayStr}T00:00:00Z`)) /
                        86_400_000
                    )
                    return (
                      <button
                        key={event.id}
                        type="button"
                        className="w-full px-4 py-2.5 text-left transition-colors hover:bg-[#fafaf8]"
                        onClick={() => setSelectedDate(event.date)}
                        aria-label={`${event.title} 일정 보기`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex min-w-0 items-center gap-2">
                            <span className={`h-2 w-2 shrink-0 rounded-full ${style.dot}`} />
                            <span className="truncate text-[13px] font-medium text-[#111110]">
                              {event.title}
                            </span>
                          </div>
                          <span
                            className={`shrink-0 text-[11px] ${
                              daysLeft <= 0 ? "font-semibold text-[#B85C33]" : "text-[#1a1a1a]/35"
                            }`}
                          >
                            {daysLeft <= 0 ? "오늘" : `D-${daysLeft}`}
                          </span>
                        </div>
                        <div className="ml-4 mt-0.5 flex flex-wrap items-center gap-1.5">
                          <p className="text-[11px] text-[#1a1a1a]/40">
                            {formatDateLabel(event.date)}
                            {event.time ? ` · ${event.time}` : ""}
                          </p>
                          <span className="rounded-full bg-[#f0f0ec] px-2 py-0.5 text-[10px] font-medium text-[#1a1a1a]/50">
                            {getEventSourceLabel(event)}
                          </span>
                          {event.partnerName && (
                            <span className="rounded-full border border-[#e8e8e4] px-2 py-0.5 text-[10px] text-[#1a1a1a]/45">
                              {event.partnerName}
                            </span>
                          )}
                        </div>
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Add / Edit */}
      <Dialog
        open={showForm}
        onOpenChange={(open) => {
          if (!open && !formLoading) {
            setShowForm(false)
            setEditingEvent(null)
          }
        }}
      >
        <DialogContent className="max-h-[90vh] max-w-md overflow-y-auto bg-white">
          <DialogHeader>
            <DialogTitle>{editingEvent ? "일정 수정" : "일정 추가"}</DialogTitle>
            <DialogDescription>
              팀 일정은 여기서 수정하고, 외부 소스 일정은 각 원본에서 수정합니다.
            </DialogDescription>
          </DialogHeader>
          <EventForm
            key={editingEvent?.id ?? defaultCreateDate}
            initial={editForm}
            onSave={handleSave}
            onCancel={() => {
              setShowForm(false)
              setEditingEvent(null)
            }}
            loading={formLoading}
            isEdit={Boolean(editingEvent)}
          />
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <Dialog
        open={Boolean(deleteTarget)}
        onOpenChange={(open) => {
          if (!open && !formLoading) setDeleteTarget(null)
        }}
      >
        <DialogContent className="max-w-sm bg-white">
          <DialogHeader>
            <DialogTitle>일정 삭제</DialogTitle>
            <DialogDescription>
              {deleteTarget ? (
                <>
                  <span className="font-medium text-[#111110]">&ldquo;{deleteTarget.title}&rdquo;</span>을
                  삭제하시겠습니까?
                </>
              ) : (
                "선택한 일정을 삭제하시겠습니까?"
              )}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)} disabled={formLoading}>
              취소
            </Button>
            <Button
              className="bg-[#B85C33] text-white hover:bg-[#9A4A27]"
              onClick={() => deleteTarget && handleDelete(deleteTarget)}
              disabled={formLoading || !deleteTarget}
            >
              {formLoading ? "삭제 중..." : "삭제"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
