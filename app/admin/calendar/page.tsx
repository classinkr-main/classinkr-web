"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"

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
import type { CalendarHealthPayload } from "@/lib/admin-calendar/health"
import { buildEventsByDate } from "@/lib/admin-calendar/layout"
import {
  EMPTY_EVENT_FORM,
  formatAssignees,
  parseAssignees,
  type EventFormData,
} from "@/lib/admin-calendar/event-form"
import {
  DEFAULT_TIMELINE_SPAN,
  formatRangeLabel,
  getViewRange,
  getWeekday,
  isCalendarViewId,
  isDateString,
  isTimelineSpan,
  stepAnchor,
  toDateString,
  type CalendarViewId,
  type TimelineSpan,
} from "@/lib/admin-calendar/range"
import {
  buildAssigneeLoad,
  buildSourceStats,
  buildWeekStripDays,
} from "@/lib/admin-calendar/insights"
import { buildAdminCalendarUrl, getAdminCalendarWeekStripRange } from "@/lib/admin/calendar-range"

import {
  createRequestGeneration,
  type RequestGeneration,
} from "@/lib/admin-calendar/request-generation"
import { resolveHotkey } from "@/lib/admin-calendar/hotkeys"

import {
  CALENDAR_EVENTS_CACHE_TTL_MS,
  computeAdjacentPrefetchRanges,
  scheduleIdlePrefetch,
  type CancelIdlePrefetch,
} from "@/components/admin/calendar/calendar-prefetch"
import {
  decodeHiddenSourcesParam,
  encodeHiddenSourcesParam,
} from "@/components/admin/calendar/calendar-hidden-sources-url"
import { AgendaList } from "@/components/admin/calendar/AgendaList"
import { CalendarRail } from "@/components/admin/calendar/CalendarRail"
import { WeekStrip } from "@/components/admin/calendar/WeekStrip"
import { AssigneeSwimlane } from "@/components/admin/calendar/AssigneeSwimlane"
import { CalendarFilterLine, type TeamMemberCount } from "@/components/admin/calendar/CalendarFilterBar"
import { CalendarToolbar } from "@/components/admin/calendar/CalendarToolbar"
import { DayDetailPanel } from "@/components/admin/calendar/DayDetailPanel"
import { EventForm } from "@/components/admin/calendar/EventForm"
import { MonthGrid } from "@/components/admin/calendar/MonthGrid"
import { CalendarRepairPanel, SourceHealthStrip } from "@/components/admin/calendar/SourceHealth"
import { SourceTimeline } from "@/components/admin/calendar/SourceTimeline"
import { WeekTimeGrid } from "@/components/admin/calendar/WeekTimeGrid"
import {
  SOURCE_OPTIONS,
  getEventSource,
  getEventSourceLabel,
  sortEventFirst,
} from "@/components/admin/calendar/event-style"
import AdminErrorBanner from "@/components/admin/ui/AdminErrorBanner"

const FILTER_STORAGE_KEY = "admin.calendar.filters.v1"
const VIEW_STORAGE_KEY = "admin.calendar.view.v1"
const DENSITY_STORAGE_KEY = "admin.calendar.density.v1"
const TIMELINE_SPAN_STORAGE_KEY = "admin.calendar.timelineSpan.v1"

/** 담당자 개념이 없는 소스 — 담당자 필터를 적용하지 않는다. */
const ASSIGNEE_FILTERED_SOURCES = new Set<EventSource>([
  "team_event",
  "notion",
  "showroom",
  // 접수의 assigned_to 를 담당자로 올린다(lib/showroom/calendar-source.ts) —
  // 담당자 미지정 요청은 필터에 걸리지 않고 그대로 보인다.
  "showroom_booking",
  "calendar",
  "compass_demo",
])

function todayString() {
  const now = new Date()
  return toDateString(now.getFullYear(), now.getMonth() + 1, now.getDate())
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
  const [loading, setLoading] = useState(true)
  // 최초 로드가 끝났는지 — 이후의 기간 이동/뷰 전환은 "새로고침"으로 취급해 이전 데이터를
  // 화면에 그대로 둔 채 조용한 인디케이터만 보여준다(첫 로드만 기존 빈 상태 표시를 허용).
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false)
  const [formLoading, setFormLoading] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [leadActionKpis, setLeadActionKpis] = useState<LeadActionKpisPayload | null>(null)
  const [health, setHealth] = useState<CalendarHealthPayload | null>(null)
  const [healthLoading, setHealthLoading] = useState(false)
  // 월 그리드 밀도(3차 개편) — "detail"=솔리드 바, "summary"=도트. 월 뷰에서만 의미가 있다.
  const [density, setDensity] = useState<"detail" | "summary">("detail")
  // 타임라인이 담는 범위. 8주 고정이 바코드를 만들어 고를 수 있게 했다(2026-08-28).
  const [timelineSpan, setTimelineSpan] = useState<TimelineSpan>(DEFAULT_TIMELINE_SPAN)
  // 제목·담당자·소스 라벨 부분일치. 조회 중인 기간 안에서만 걸린다(범위 밖은 별도 조회).
  const [query, setQuery] = useState("")
  // 이번 주 스트립 데이터 — 월 조회 범위(=사이드바 예열이 데운 캐시 키)를 넓히지 않고
  // 주 범위를 따로 당긴다. 월말 주가 다음 달로 걸쳐도 스트립이 거짓으로 비지 않는다.
  const [stripEvents, setStripEvents] = useState<CalendarEvent[]>([])

  const [selectedDate, setSelectedDate] = useState<string | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [editingEvent, setEditingEvent] = useState<CalendarEvent | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<CalendarEvent | null>(null)

  const range = useMemo(
    () => getViewRange(view, anchor, { timelineSpan }),
    [view, anchor, timelineSpan]
  )
  const searchInputRef = useRef<HTMLInputElement | null>(null)
  /**
   * 단축키 N이 부를 "새 일정". openCreate 는 이 훅보다 아래에서 선언되므로 ref 로 건넨다 —
   * 매 렌더 최신 값을 담아 두면 effect 를 openCreate 때문에 다시 붙일 필요도 없다.
   */
  const openCreateRef = useRef<(date?: string) => void>(() => {})

  // ─── 저장된 화면 상태 복원 ───────────────────────────────────────
  // 초기 렌더는 기본값(이번 달)으로 두고 마운트 후에 URL·localStorage 를 반영한다 —
  // 서버 렌더 결과와 어긋나 하이드레이션이 깨지는 걸 피한다.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const urlView = params.get("view")
    const urlAnchor = params.get("anchor")
    // hiddenSources는 URL(`hidden`)이 있으면 그 값이 우선(공유·새로고침 딥링크) — 없을 때만
    // 아래에서 localStorage 값으로 폴백한다. hiddenAssignees는 URL 대상이 아니라 항상
    // localStorage에서만 복원한다(요청 범위 — 담당자 필터는 이름이 URL에 노출되지 않게 둔다).
    const hiddenSourcesFromUrl = decodeHiddenSourcesParam(params.get("hidden"))

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
      const storedDensity = localStorage.getItem(DENSITY_STORAGE_KEY)
      if (storedDensity === "detail" || storedDensity === "summary") setDensity(storedDensity)
    } catch {
      /* localStorage 불가 시 기본 밀도 유지 */
    }

    // 범위는 URL(공유·새로고침 딥링크)이 우선, 없으면 localStorage.
    const urlSpan = params.get("span")
    if (isTimelineSpan(urlSpan)) setTimelineSpan(urlSpan)
    else {
      try {
        const storedSpan = localStorage.getItem(TIMELINE_SPAN_STORAGE_KEY)
        if (isTimelineSpan(storedSpan)) setTimelineSpan(storedSpan)
      } catch {
        /* localStorage 불가 시 기본 범위 유지 */
      }
    }

    try {
      const raw = localStorage.getItem(FILTER_STORAGE_KEY)
      if (raw) {
        const parsed = JSON.parse(raw) as { hiddenSources?: unknown; hiddenAssignees?: unknown }
        if (!hiddenSourcesFromUrl && Array.isArray(parsed.hiddenSources)) {
          setHiddenSources(new Set(parsed.hiddenSources as EventSource[]))
        }
        if (Array.isArray(parsed.hiddenAssignees)) {
          setHiddenAssignees(new Set(parsed.hiddenAssignees as string[]))
        }
      }
    } catch {
      /* 파싱 실패 시 기본(전체 표시) 유지 */
    }
    if (hiddenSourcesFromUrl) setHiddenSources(hiddenSourcesFromUrl)

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
      localStorage.setItem(DENSITY_STORAGE_KEY, density)
      localStorage.setItem(TIMELINE_SPAN_STORAGE_KEY, timelineSpan)
    } catch {
      /* 저장 실패는 무시 */
    }
  }, [prefsHydrated, hiddenSources, hiddenAssignees, view, density, timelineSpan])

  // 뷰·기간·소스 필터를 주소에 반영해 새로고침·공유가 같은 화면을 연다. 히스토리는 쌓지 않는다.
  useEffect(() => {
    if (!prefsHydrated) return
    const params = new URLSearchParams(window.location.search)
    params.set("view", view)
    params.set("anchor", anchor)
    const hiddenParam = encodeHiddenSourcesParam(hiddenSources)
    if (hiddenParam) params.set("hidden", hiddenParam)
    else params.delete("hidden")
    // 범위는 타임라인에서만 의미가 있다 — 다른 뷰의 주소에 남기면 무슨 뜻인지 읽히지 않는다.
    if (view === "timeline") params.set("span", timelineSpan)
    else params.delete("span")
    window.history.replaceState(null, "", `${window.location.pathname}?${params.toString()}`)
  }, [prefsHydrated, view, anchor, hiddenSources, timelineSpan])

  // ─── 데이터 ──────────────────────────────────────────────────────
  // 기간 경계(from·to)만 의존값으로 잡는다 — range 객체 정체성이 아니라 실제 조회 구간이
  // 바뀔 때만 재조회해야 사이드바 예열이 만든 캐시 키를 그대로 맞힌다.
  const { from: rangeFrom, to: rangeTo } = range
  // 늦게 끝난 이전 기간 응답이 현재 화면을 덮지 않게 하는 문지기(lib/admin-calendar/request-generation.ts).
  const eventsGenerationRef = useRef<RequestGeneration | null>(null)
  // idle 프리페치는 항상 최신 예약 하나만 살아 있는다 — 지나간 기간까지 깨어나 요청하지 않도록.
  const prefetchCancelRef = useRef<CancelIdlePrefetch | null>(null)

  const fetchEvents = useCallback(async () => {
    const generation = (eventsGenerationRef.current ??= createRequestGeneration())
    const token = generation.next()
    setLoading(true)
    try {
      const data = await adminFetchJsonCached<CalendarEvent[]>(
        buildAdminCalendarUrl({ from: rangeFrom, to: rangeTo }),
        undefined,
        {
          ttlMs: CALENDAR_EVENTS_CACHE_TTL_MS,
          // TTL이 지난 캐시로 화면을 먼저 채운 회차는 뒤에서 갱신이 돈다. 그 결과를 받지
          // 않으면 이 페이지를 열어 둔 내내 오래된 일정이 남는다(effect는 다시 돌지 않는다).
          onRevalidated: ({ data: fresh }) => {
            if (fresh && generation.isCurrent(token)) setEvents(fresh)
          },
        }
      )
      // 이 응답이 최신 기간의 것이 아니면 화면에 손대지 않는다.
      if (!generation.isCurrent(token)) return
      setEvents(data)
      setErrorMessage(null)
      // 현재 기간이 성공적으로 뜬 뒤에만, 유휴 시간에 인접 기간을 조용히 데운다 — 지금 화면이
      // 기다리는 요청과 대역폭을 다투지 않는다. 실패는 완전 무음(사용자 조회에 영향 없음).
      prefetchCancelRef.current?.()
      prefetchCancelRef.current = scheduleIdlePrefetch(() => {
        for (const adjacent of computeAdjacentPrefetchRanges({ from: rangeFrom, to: rangeTo })) {
          void adminFetchJsonCached<CalendarEvent[]>(buildAdminCalendarUrl(adjacent), undefined, {
            ttlMs: CALENDAR_EVENTS_CACHE_TTL_MS,
          }).catch(() => {
            /* 프리페치 실패는 무음 — 본 조회는 이미 끝났다 */
          })
        }
      })
    } catch (error) {
      if (!generation.isCurrent(token)) return
      setErrorMessage(error instanceof Error ? error.message : "캘린더 데이터를 불러오지 못했습니다.")
    } finally {
      // 먼저 끝난 옛 요청이 loading을 내리면, 아직 도는 현재 요청이 있는데도 새로고침 표시가
      // 꺼져 거짓 빈 상태가 노출된다 — 최신 요청만 이 스위치를 만진다.
      if (generation.isCurrent(token)) {
        setLoading(false)
        setHasLoadedOnce(true)
      }
    }
  }, [rangeFrom, rangeTo])

  useEffect(() => {
    fetchEvents()
    // 기간이 바뀌거나 화면을 떠나면 이전 기간의 예열 예약을 취소한다.
    return () => {
      prefetchCancelRef.current?.()
      prefetchCancelRef.current = null
    }
  }, [fetchEvents])

  // Overview가 하던 "홈페이지 리드 대응" 진입점을 캘린더로 이관 — 기간 이동과 무관하게 한 번만.
  // 실패해도 배너는 부가 정보일 뿐이라 캘린더 본 기능(일정 조회)을 막지 않는다.
  useEffect(() => {
    let cancelled = false
    adminFetchJsonCached<{ leads: LeadActionKpisPayload }>(
      "/api/admin/crm/action-kpis",
      undefined,
      // CRM 홈(app/admin/crm/page.tsx CRM_ACTION_KPIS_URL)과 동일한 URL 키를 써서
      // 같은 엔드포인트를 두 화면이 각자 다른 캐시 슬롯으로 이중 적재하지 않게 한다.
      { cacheKey: "/api/admin/crm/action-kpis", ttlMs: 120_000, staleWhileRevalidateMs: 300_000 }
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

  // 소스 연결 상태 — "일정이 없다"와 "연동이 끊겼다"를 화면이 구분하게 한다(2026-08-19).
  // 실패하면 상태 레이어 없이 캘린더만 뜬다 — 부가 정보가 본 기능(일정 조회)을 막지 않는다.
  useEffect(() => {
    let cancelled = false
    const applyHealth = (data: CalendarHealthPayload | undefined) => {
      if (!cancelled && data && Array.isArray(data.sources)) setHealth(data)
    }
    adminFetchJsonCached<CalendarHealthPayload>("/api/admin/calendar/health", undefined, {
      cacheKey: "calendar:source-health",
      ttlMs: 300_000,
      staleWhileRevalidateMs: 600_000,
      // 이벤트 조회와 같은 이유 — 오래된 캐시로 먼저 그린 회차의 백그라운드 갱신 결과를
      // 받지 않으면, 서버가 이미 감지한 연동 장애가 이 페이지 세션 내내 안 보인다.
      onRevalidated: ({ data }) => applyHealth(data),
    })
      .then(applyHealth)
      .catch(() => {
        /* 상태 조회 실패 시 스트립·수리 패널 없이 둔다 */
      })
    return () => {
      cancelled = true
    }
  }, [])

  // ─── 이번 주 스트립 데이터 ───────────────────────────────────────
  // todayStr 는 마운트 시 고정이므로 주 경계도 고정 — 재조회는 CRUD 직후에만 명시적으로.
  // 범위 산출은 calendar-range.ts(SSOT) — 사이드바 hover 예열이 같은 함수로 같은 URL을 만든다.
  const stripRange = useMemo(() => getAdminCalendarWeekStripRange(todayStr), [todayStr])
  const stripFrom = stripRange.from
  const stripTo = stripRange.to
  const fetchStripEvents = useCallback(async () => {
    const apply = (data: CalendarEvent[] | undefined) => {
      if (Array.isArray(data)) setStripEvents(data)
    }
    try {
      apply(
        await adminFetchJsonCached<CalendarEvent[]>(
          buildAdminCalendarUrl({ from: stripFrom, to: stripTo }),
          undefined,
          { ttlMs: CALENDAR_EVENTS_CACHE_TTL_MS, onRevalidated: ({ data }) => apply(data) }
        )
      )
    } catch {
      /* 스트립은 부가 밴드 — 실패 시 조용히 비워 두고 본 캘린더를 막지 않는다 */
    }
  }, [stripFrom, stripTo])
  useEffect(() => {
    void fetchStripEvents()
  }, [fetchStripEvents])

  // 소스 연결 상태 수동 새로고침 — 레일의 새로고침 버튼. 캐시를 우회해 지금 상태를 다시 본다.
  const refreshHealth = useCallback(async () => {
    setHealthLoading(true)
    try {
      const response = await adminFetch("/api/admin/calendar/health")
      const data = (await response.json().catch(() => null)) as CalendarHealthPayload | null
      if (response.ok && data && Array.isArray(data.sources)) setHealth(data)
    } catch {
      /* 수동 새로고침 실패 시 기존 표시를 유지한다 */
    } finally {
      setHealthLoading(false)
    }
  }, [])

  // ─── 단축키 ──────────────────────────────────────────────────────
  // 해석은 lib/admin-calendar/hotkeys.ts(순수)가 하고, 여기서는 구독과 분기만 한다.
  // 다이얼로그가 떠 있는 동안은 키를 넘기지 않는다 — 폼이 키의 주인이다.
  const dialogOpen = showForm || Boolean(deleteTarget)
  useEffect(() => {
    if (dialogOpen) return
    const onKeyDown = (event: KeyboardEvent) => {
      const action = resolveHotkey({
        key: event.key,
        metaKey: event.metaKey,
        ctrlKey: event.ctrlKey,
        altKey: event.altKey,
        shiftKey: event.shiftKey,
        target: event.target,
      })
      if (!action) return
      event.preventDefault()
      switch (action.kind) {
        case "step":
          setAnchor((current) => stepAnchor(view, current, action.direction, { timelineSpan }))
          setSelectedDate(null)
          break
        case "today":
          setAnchor(todayStr)
          setSelectedDate(todayStr)
          break
        case "view":
          setView(action.view)
          setSelectedDate(null)
          break
        case "create":
          openCreateRef.current()
          break
        case "search":
          searchInputRef.current?.focus()
          break
      }
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [dialogOpen, view, timelineSpan, todayStr])

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

  const isEventVisible = useCallback(
    (event: CalendarEvent) => {
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
    },
    [hiddenSources, hiddenAssignees]
  )

  // 검색은 소스·담당자 필터 뒤에 걸린다 — 꺼 둔 소스가 검색으로 되살아나면 필터가 거짓말이 된다.
  const matchesQuery = useCallback(
    (event: CalendarEvent) => {
      const keyword = query.trim().toLowerCase()
      if (!keyword) return true
      const haystack = [
        event.title,
        getEventSourceLabel(event),
        ...(event.assignees ?? []),
      ].join(" ").toLowerCase()
      return haystack.includes(keyword)
    },
    [query]
  )

  const visibleEvents = useMemo(
    () => events.filter((event) => isEventVisible(event) && matchesQuery(event)),
    [events, isEventVisible, matchesQuery]
  )
  // 스트립도 같은 필터를 통과한다 — 본 그리드에서 숨긴 소스가 스트립에만 남으면 필터가 거짓말이 된다.
  const visibleStripEvents = useMemo(
    () => stripEvents.filter(isEventVisible),
    [stripEvents, isEventVisible]
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

  // ─── CRUD ────────────────────────────────────────────────────────
  const handleSave = async (data: EventFormData) => {
    setFormLoading(true)
    try {
      const payload = {
        ...data,
        assignees: parseAssignees(data.assignees),
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
      void fetchStripEvents()
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
      void fetchStripEvents()
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

  openCreateRef.current = openCreate

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
        assignees: formatAssignees(editingEvent.assignees ?? []),
        allDay: editingEvent.allDay ?? false,
      }
    : initialForm

  const selectedEvents = selectedDate ? (eventsByDate[selectedDate] ?? []) : []

  // ─── 이번 주 스트립·우측 레일 파생값 ─────────────────────────────
  const stripDays = useMemo(
    () => buildWeekStripDays(visibleStripEvents, { from: stripFrom, to: stripTo }),
    [visibleStripEvents, stripFrom, stripTo]
  )
  const stripTotal = useMemo(() => stripDays.reduce((sum, day) => sum + day.count, 0), [stripDays])
  const stripRangeLabel = useMemo(() => {
    const WD = "일월화수목금토"
    const fmt = (date: string) =>
      `${Number(date.slice(5, 7))}월 ${Number(date.slice(8, 10))}일 (${WD[getWeekday(date)]})`
    return `${fmt(stripFrom)} – ${fmt(stripTo)}`
  }, [stripFrom, stripTo])

  // 레일 통계는 필터와 무관한 "이 기간의 사실"이다 — 숨긴 소스도 수치에는 남는다.
  const sourceStats = useMemo(() => buildSourceStats(events), [events])
  const assigneeLoad = useMemo(() => buildAssigneeLoad(events), [events])
  const publicEventCount = useMemo(
    () => events.filter((event) => getEventSource(event) === "event").length,
    [events]
  )
  const notionCount = useMemo(
    () => events.filter((event) => getEventSource(event) === "notion").length,
    [events]
  )

  // 최초 로드 이후의 기간 이동/뷰 전환 중 배경 새로고침인가 — 담당자·타임라인·목록 뷰는
  // 필터링 결과가 0건이면 "일정이 없다"고 단정하는데, 새 기간 데이터가 아직 안 왔을 뿐인
  // 이 구간에는 그 단정이 거짓일 수 있다(이전 기간 이벤트가 새 기간 날짜와 안 맞아떨어짐).
  const isBackgroundRefresh = loading && hasLoadedOnce

  // ─── 연결 상태 파생 ──────────────────────────────────────────────
  const brokenSources = useMemo(
    () => (health?.sources ?? []).filter((item) => item.status !== "ok"),
    [health]
  )
  // 공휴일은 자동 주입이라 "일정이 있다"는 증거가 못 된다 — 수리 패널 판정에서 뺀다.
  const nonHolidayCount = useMemo(
    () => events.filter((event) => getEventSource(event) !== "holiday").length,
    [events]
  )
  const showRepairPanel = !loading && nonHolidayCount === 0 && brokenSources.length > 0
  const holidayNote = useMemo(() => {
    const holidays = events.filter((event) => getEventSource(event) === "holiday")
    if (holidays.length === 0) return undefined
    const first = holidays[0]
    const monthDay = `${Number(first.date.slice(5, 7))}/${Number(first.date.slice(8, 10))}`
    return `공휴일 ${holidays.length}건은 정상 표시 중 · ${monthDay} ${first.title}`
  }, [events])
  // 눌러도 빈 레인만 나오는 뷰는 흐리게 — 담당자 뷰는 담당자 있는 일정, 타임라인은 공휴일 외 일정이 기준.
  const viewAvailability = useMemo(
    () => ({
      assignee: visibleEvents.some((event) => (event.assignees?.length ?? 0) > 0),
      timeline: visibleEvents.some((event) => getEventSource(event) !== "holiday"),
    }),
    [visibleEvents]
  )

  const [year, month] = range.from.split("-").map(Number)

  return (
    <div className="px-4 pt-6 pb-24 sm:px-6 sm:pt-8 lg:px-8 lg:pt-10 lg:pb-20">
      {/* Header — 한 줄. 소스 나열·설명은 범례 라인이 대신한다(2026-08-19 다이어트) */}
      <div className="mb-4 flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
        <h1 className="text-2xl font-bold tracking-[-0.02em] text-[#111110]">운영 캘린더</h1>
        <p className="text-[12px] text-[#1a1a1a]/45">8개 소스 통합 · 외부 소스는 읽기 전용</p>
      </div>

      {errorMessage && <AdminErrorBanner title="캘린더 오류" message={errorMessage} className="mb-4" />}

      {/* 미응답 리드 진입점은 우측 레일 퀵링크로 이관했다(3차 개편) — 배너 자리를 그리드에 돌려준다. */}

      {/* Main */}
      <div className="flex flex-col items-stretch gap-5 xl:flex-row xl:items-start">
        <div className="min-w-0 flex-1 overflow-hidden rounded-2xl border border-[#e8e8e4] bg-white">
          {/* 끊긴 소스 요약 — 수리 패널이 뜰 때는 패널이 더 자세히 말하므로 접는다 */}
          {!showRepairPanel && <SourceHealthStrip broken={brokenSources} />}
          <CalendarToolbar
            view={view}
            anchor={anchor}
            loading={loading}
            viewAvailability={viewAvailability}
            density={density}
            onDensityChange={view === "month" ? setDensity : undefined}
            timelineSpan={timelineSpan}
            onTimelineSpanChange={view === "timeline" ? setTimelineSpan : undefined}
            range={range}
            todayStr={todayStr}
            onJump={(date) => {
              setAnchor(date)
              setSelectedDate(null)
            }}
            onViewChange={(next) => {
              setView(next)
              setSelectedDate(null)
            }}
            onStep={(direction) => {
              setAnchor((current) => stepAnchor(view, current, direction, { timelineSpan }))
              setSelectedDate(null)
            }}
            onToday={() => {
              setAnchor(todayStr)
              setSelectedDate(todayStr)
            }}
            onCreate={() => openCreate()}
          />
          {!showRepairPanel && (
            <CalendarFilterLine
              events={events}
              visibleEvents={visibleEvents}
              teamMembers={teamMembers}
              hiddenSources={hiddenSources}
              hiddenAssignees={hiddenAssignees}
              query={query}
              onQueryChange={setQuery}
              searchInputRef={searchInputRef}
              onToggleSource={toggleSource}
              onToggleAssignee={toggleAssignee}
              onShowAll={() => {
                setHiddenSources(new Set())
                setHiddenAssignees(new Set())
              }}
              onHideAll={() => {
                setHiddenSources(new Set(SOURCE_OPTIONS.map((option) => option.value)))
                setHiddenAssignees(new Set(teamMembers.map((member) => member.name)))
              }}
            />
          )}

          {showRepairPanel ? (
            <CalendarRepairPanel
              rangeLabel={formatRangeLabel(view, anchor, { timelineSpan })}
              broken={brokenSources}
              holidayNote={holidayNote}
              onCreate={() => openCreate()}
            />
          ) : (
            <>
          {view === "month" && (
            <>
              {/* 이번 주 스트립 — 표시 중인 달에 오늘이 있을 때만. 다른 달을 볼 때 "이번 주"가
                  끼어들면 어느 달을 보고 있는지 헷갈린다. */}
              {range.from.slice(0, 7) === todayStr.slice(0, 7) && stripDays.length > 0 && (
                <WeekStrip
                  days={stripDays}
                  todayStr={todayStr}
                  rangeLabel={stripRangeLabel}
                  total={stripTotal}
                  onSelectDate={setSelectedDate}
                />
              )}
              <MonthGrid
                year={year}
                month={month}
                todayStr={todayStr}
                selectedDate={selectedDate}
                eventsByDate={eventsByDate}
                onSelectDate={setSelectedDate}
                onCreateAt={openCreate}
                density={density}
              />
            </>
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
              refreshing={isBackgroundRefresh}
            />
          )}
          {view === "timeline" && (
            <SourceTimeline
              range={range}
              todayStr={todayStr}
              span={timelineSpan}
              visibleEvents={visibleEvents}
              onSelectDate={setSelectedDate}
              refreshing={isBackgroundRefresh}
            />
          )}
          {view === "agenda" && (
            <AgendaList
              range={range}
              todayStr={todayStr}
              visibleEvents={visibleEvents}
              onSelectDate={setSelectedDate}
              refreshing={isBackgroundRefresh}
            />
          )}
            </>
          )}
        </div>

        {/* Right rail — 기본은 수집 상태·통계·부하(3차 개편), 날짜 선택 시 일 상세로 교대 */}
        <div className="w-full shrink-0 space-y-4 xl:w-[264px]">
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
            <CalendarRail
              health={health}
              healthLoading={healthLoading}
              onRefreshHealth={refreshHealth}
              sourceStats={sourceStats}
              assigneeLoad={assigneeLoad}
              monthLabel={`${month}월`}
              totalCount={events.length}
              leadKpis={leadActionKpis}
              publicEventCount={publicEventCount}
              notionCount={notionCount}
            />
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
            assigneeSuggestions={teamMembers.map((member) => member.name)}
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
