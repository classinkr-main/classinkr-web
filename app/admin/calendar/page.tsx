"use client"

import Link from "next/link"
import { useState, useEffect, useCallback, useMemo } from "react"
import {
  ChevronLeft, ChevronRight, Plus, Clock, Users,
  AlignLeft, Trash2, Pencil, CalendarDays, Check,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { adminFetch, adminFetchJsonCached } from "@/lib/admin-client"
import type { CalendarEvent, EventSource, EventType } from "@/lib/calendar-data"

// ─── 상수 ─────────────────────────────────────────────────────────────────────

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"]

const EVENT_TYPES: { value: EventType; label: string; color: string; bg: string; dot: string }[] = [
  { value: "team",     label: "팀 일정",  color: "text-[#084734]",  bg: "bg-[#ECFDF5] border-[#D1FAE5]",   dot: "bg-[#084734]" },
  { value: "meeting",  label: "회의",     color: "text-[#065c41]",  bg: "bg-[#D1FAE5] border-[#A7F3D0]",   dot: "bg-[#065c41]" },
  { value: "deadline", label: "마감",     color: "text-[#B85C33]",  bg: "bg-[#FEF3EE] border-[#F6D5C5]",   dot: "bg-[#B85C33]" },
  { value: "launch",   label: "런칭",     color: "text-emerald-700", bg: "bg-emerald-50 border-emerald-200", dot: "bg-emerald-500" },
  { value: "holiday",  label: "휴일",     color: "text-amber-700",  bg: "bg-amber-50 border-amber-200",    dot: "bg-amber-400" },
  { value: "other",    label: "기타",     color: "text-[#615D59]",  bg: "bg-[#f0f0ec] border-[#e8e8e4]",   dot: "bg-[#A39E98]" },
]

const SOURCE_OPTIONS: { value: EventSource; label: string; dot: string }[] = [
  { value: "calendar", label: "팀 일정", dot: "#084734" },
  { value: "partner", label: "파트너 일정", dot: "#B85C33" },
  { value: "event", label: "공개 행사", dot: "#A8741A" },
  { value: "notion", label: "마케팅(노션)", dot: "#0E766E" },
  { value: "showroom", label: "쇼룸 예약", dot: "#5B6470" },
  { value: "team_event", label: "팀원 행사", dot: "#6D4AA8" },
]

const FILTER_STORAGE_KEY = "admin.calendar.filters.v1"

function getSourceColor(source: EventSource): string {
  return SOURCE_OPTIONS.find((option) => option.value === source)?.dot ?? "#A39E98"
}

function getTypeStyle(type: EventType) {
  return EVENT_TYPES.find((t) => t.value === type) ?? EVENT_TYPES[EVENT_TYPES.length - 1]
}

function getEventSource(event: CalendarEvent): EventSource {
  return event.source ?? "calendar"
}

function getEventSourceLabel(event: CalendarEvent) {
  return event.sourceLabel ?? (getEventSource(event) === "partner" ? "파트너" : "팀")
}

function toDateStr(y: number, m: number, d: number) {
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`
}

function formatDate(dateStr: string) {
  const d = new Date(dateStr + "T00:00:00")
  return d.toLocaleDateString("ko-KR", { month: "long", day: "numeric", weekday: "short" })
}

function enumerateEventDates(event: CalendarEvent) {
  const start = new Date(`${event.date}T00:00:00`)
  const end = new Date(`${(event.endDate ?? event.date)}T00:00:00`)
  const dates: string[] = []

  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start.getTime() > end.getTime()) {
    return [event.date]
  }

  const cursor = new Date(start)
  while (cursor.getTime() <= end.getTime()) {
    dates.push(toDateStr(cursor.getFullYear(), cursor.getMonth() + 1, cursor.getDate()))
    cursor.setDate(cursor.getDate() + 1)
  }

  return dates
}

// ─── 인증 헬퍼 ────────────────────────────────────────────────────────────────

async function readJsonOrThrow<T>(response: Response): Promise<T> {
  const data = await response.json().catch(() => null)

  if (!response.ok) {
    throw new Error(
      (data && typeof data === "object" && "error" in data && typeof data.error === "string"
        ? data.error
        : "일정 요청에 실패했습니다.")
    )
  }

  return data as T
}

// ─── 이벤트 폼 ────────────────────────────────────────────────────────────────

interface EventFormData {
  title: string
  date: string
  endDate: string
  time: string
  endTime: string
  type: EventType
  description: string
  assignees: string
  allDay: boolean
}

const EMPTY_FORM: EventFormData = {
  title: "", date: "", endDate: "", time: "", endTime: "",
  type: "team", description: "", assignees: "", allDay: false,
}

interface EventFormProps {
  initial: EventFormData
  onSave: (data: EventFormData) => void
  onCancel: () => void
  loading: boolean
  isEdit: boolean
}

function EventForm({ initial, onSave, onCancel, loading, isEdit }: EventFormProps) {
  const [form, setForm] = useState<EventFormData>(initial)
  const set = (k: keyof EventFormData, v: string | boolean) =>
    setForm((p) => ({ ...p, [k]: v }))

  return (
    <form
      onSubmit={(e) => { e.preventDefault(); onSave(form) }}
      className="space-y-4"
    >
      <div className="space-y-1.5">
        <Label>제목 *</Label>
        <Input
          value={form.title}
          onChange={(e) => set("title", e.target.value)}
          placeholder="일정 제목"
          required
          autoFocus
        />
      </div>

      <div className="space-y-1.5">
        <Label>유형 *</Label>
        <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
          {EVENT_TYPES.map((t) => (
            <button
              key={t.value}
              type="button"
              onClick={() => set("type", t.value)}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[12px] font-medium border transition-all ${
                form.type === t.value
                  ? `${t.bg} ${t.color} border-current`
                  : "bg-white border-[#e8e8e4] text-[#1a1a1a]/50 hover:border-[#1a1a1a]/30"
              }`}
            >
              <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${t.dot}`} />
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label>시작일 *</Label>
          <Input type="date" value={form.date} onChange={(e) => set("date", e.target.value)} required />
        </div>
        <div className="space-y-1.5">
          <Label>종료일</Label>
          <Input type="date" value={form.endDate} onChange={(e) => set("endDate", e.target.value)} min={form.date} />
        </div>
      </div>

      <div className="flex items-center gap-2">
        <input
          type="checkbox"
          id="allDay"
          checked={form.allDay}
          onChange={(e) => set("allDay", e.target.checked)}
          className="rounded border-input"
        />
        <Label htmlFor="allDay" className="cursor-pointer font-normal">종일</Label>
      </div>

      {!form.allDay && (
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>시작 시간</Label>
            <Input type="time" value={form.time} onChange={(e) => set("time", e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>종료 시간</Label>
            <Input type="time" value={form.endTime} onChange={(e) => set("endTime", e.target.value)} />
          </div>
        </div>
      )}

      <div className="space-y-1.5">
        <Label>담당자</Label>
        <Input
          value={form.assignees}
          onChange={(e) => set("assignees", e.target.value)}
          placeholder="홍길동, 김철수 (쉼표로 구분)"
        />
      </div>

      <div className="space-y-1.5">
        <Label>메모</Label>
        <textarea
          value={form.description}
          onChange={(e) => set("description", e.target.value)}
          placeholder="상세 내용"
          rows={3}
          className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 resize-none"
        />
      </div>

      <div className="flex flex-col-reverse gap-2 pt-1 sm:flex-row sm:justify-end">
        <Button type="button" variant="outline" onClick={onCancel} disabled={loading}>취소</Button>
        <Button type="submit" disabled={loading}>
          {loading ? "저장 중..." : isEdit ? "수정" : "추가"}
        </Button>
      </div>
    </form>
  )
}

// ─── 체크박스 필터 칩 ─────────────────────────────────────────────────────────

function CheckChip({
  checked,
  label,
  count,
  onToggle,
  dot,
  avatar,
  dim,
}: {
  checked: boolean
  label: string
  count?: number
  onToggle: () => void
  dot?: string
  avatar?: boolean
  dim?: boolean
}) {
  // 소스/그룹 색(dot) — 체크 시 배경·테두리·체크박스를 해당 색 틴트로. 색 없으면 기본 그린.
  const accent = dot
  const tinted = checked && Boolean(accent)

  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      aria-label={label}
      onClick={onToggle}
      style={tinted ? { backgroundColor: `${accent}14`, borderColor: `${accent}59`, color: accent } : undefined}
      className={`inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[11px] font-medium transition-colors ${
        dim ? "opacity-45" : ""
      } ${
        checked
          ? tinted
            ? ""
            : "border-[#084734]/25 bg-[#ECFDF5] text-[#084734]"
          : "border-[#e8e8e4] bg-white text-[#1a1a1a]/45 hover:border-[#1a1a1a]/20 hover:text-[#111110]"
      }`}
    >
      <span
        style={tinted ? { backgroundColor: accent, borderColor: accent, color: "#fff" } : undefined}
        className={`flex h-3 w-3 items-center justify-center rounded-[3px] border transition-colors ${
          checked
            ? tinted
              ? ""
              : "border-[#084734] bg-[#084734] text-white"
            : "border-[#c9c7c2] bg-white"
        }`}
      >
        {checked && <Check className="h-2 w-2" strokeWidth={3.5} />}
      </span>
      {dot && !checked && (
        <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: dot }} />
      )}
      {avatar && (
        <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-[#f0f0ec] text-[9px] font-semibold text-[#615D59]">
          {label.charAt(0)}
        </span>
      )}
      <span>{label}</span>
      {typeof count === "number" && (
        <span
          style={tinted ? { color: accent, opacity: 0.6 } : undefined}
          className={tinted ? "" : checked ? "text-[#084734]/55" : "text-[#1a1a1a]/30"}
        >
          {count}
        </span>
      )}
    </button>
  )
}

// ─── 메인 페이지 ──────────────────────────────────────────────────────────────

export default function AdminCalendarPage() {
  const today = new Date()
  const [year, setYear] = useState(today.getFullYear())
  const [month, setMonth] = useState(today.getMonth() + 1)
  const [events, setEvents] = useState<CalendarEvent[]>([])
  const [hiddenSources, setHiddenSources] = useState<Set<EventSource>>(new Set())
  const [hiddenAssignees, setHiddenAssignees] = useState<Set<string>>(new Set())
  const [filtersHydrated, setFiltersHydrated] = useState(false)
  const [loading, setLoading] = useState(false)
  const [formLoading, setFormLoading] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const [selectedDate, setSelectedDate] = useState<string | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [editingEvent, setEditingEvent] = useState<CalendarEvent | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<CalendarEvent | null>(null)

  const fetchEvents = useCallback(async () => {
    setLoading(true)
    try {
      const data = await adminFetchJsonCached<CalendarEvent[]>(
        `/api/admin/calendar?year=${year}&month=${month}`,
        undefined,
        { ttlMs: 60_000 }
      )
      setEvents(data)
      setErrorMessage(null)
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "캘린더 데이터를 불러오지 못했습니다.")
    }
    finally { setLoading(false) }
  }, [year, month])

  useEffect(() => { fetchEvents() }, [fetchEvents])

  // 필터 상태 복원 (새로고침/탭 이동 후 유지) — 초기 렌더는 전체 표시로 SSR 일치, 이후 저장값 적용
  useEffect(() => {
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
      /* localStorage 불가/파싱 실패 시 기본(전체 표시) 유지 */
    }
    setFiltersHydrated(true)
  }, [])

  // 필터 변경 시 저장 (복원 완료 전에는 초기 빈값으로 덮어쓰지 않도록 가드)
  useEffect(() => {
    if (!filtersHydrated) return
    try {
      localStorage.setItem(
        FILTER_STORAGE_KEY,
        JSON.stringify({
          hiddenSources: Array.from(hiddenSources),
          hiddenAssignees: Array.from(hiddenAssignees),
        })
      )
    } catch {
      /* 저장 실패는 무시 */
    }
  }, [filtersHydrated, hiddenSources, hiddenAssignees])

  // ─── Calendar Math ─────────────────────────────────────────────
  const firstDay = new Date(year, month - 1, 1).getDay()
  const daysInMonth = new Date(year, month, 0).getDate()
  const todayStr = toDateStr(today.getFullYear(), today.getMonth() + 1, today.getDate())
  const sourceCounts = useMemo(() => {
    const map: Record<string, number> = {}
    for (const option of SOURCE_OPTIONS) map[option.value] = 0
    for (const event of events) {
      const src = getEventSource(event)
      map[src] = (map[src] ?? 0) + 1
    }
    return map
  }, [events])

  const teamMembers = useMemo(() => {
    const counts = new Map<string, number>()
    for (const event of events) {
      if (getEventSource(event) !== "team_event") continue
      for (const name of event.assignees ?? []) counts.set(name, (counts.get(name) ?? 0) + 1)
    }
    return Array.from(counts.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => a.name.localeCompare(b.name, "ko"))
  }, [events])

  const visibleEvents = events.filter((event) => {
    const src = getEventSource(event)
    if (hiddenSources.has(src)) return false
    if (src === "team_event") {
      const assignees = event.assignees ?? []
      // 담당자가 있는 팀원 행사는 담당자 필터를 적용 — 표시 담당자가 하나도 없으면 숨김
      if (assignees.length > 0 && !assignees.some((name) => !hiddenAssignees.has(name))) return false
    }
    return true
  })

  const toggleSource = (src: EventSource) =>
    setHiddenSources((prev) => {
      const next = new Set(prev)
      if (next.has(src)) next.delete(src)
      else next.add(src)
      return next
    })

  const toggleAssignee = (name: string) =>
    setHiddenAssignees((prev) => {
      const next = new Set(prev)
      if (next.has(name)) next.delete(name)
      else next.add(name)
      return next
    })

  const setAllSources = (visible: boolean) =>
    setHiddenSources(visible ? new Set() : new Set(SOURCE_OPTIONS.map((option) => option.value)))

  const setAllAssignees = (visible: boolean) =>
    setHiddenAssignees(visible ? new Set() : new Set(teamMembers.map((member) => member.name)))

  const teamEventSourceVisible = !hiddenSources.has("team_event")
  const showAssigneeRow = teamMembers.length > 0
  const allSourcesVisible = hiddenSources.size === 0
  const allAssigneesVisible = teamMembers.every((member) => !hiddenAssignees.has(member.name))

  // map date → events
  const eventsByDate = visibleEvents.reduce<Record<string, CalendarEvent[]>>((acc, ev) => {
    enumerateEventDates(ev).forEach((key) => {
      if (!acc[key]) acc[key] = []
      acc[key].push(ev)
    })
    return acc
  }, {})

  const prevMonth = () => {
    if (month === 1) { setYear(y => y - 1); setMonth(12) }
    else setMonth(m => m - 1)
    setSelectedDate(null)
  }
  const nextMonth = () => {
    if (month === 12) { setYear(y => y + 1); setMonth(1) }
    else setMonth(m => m + 1)
    setSelectedDate(null)
  }

  // ─── CRUD ──────────────────────────────────────────────────────
  const handleSave = async (data: EventFormData) => {
    setFormLoading(true)
    try {
      const payload = {
        ...data,
        assignees: data.assignees ? data.assignees.split(",").map(s => s.trim()).filter(Boolean) : [],
        endDate: data.endDate || undefined,
        time: data.time || undefined,
        endTime: data.endTime || undefined,
        description: data.description || undefined,
      }
      if (editingEvent) {
        const response = await adminFetch(`/api/admin/calendar/${editingEvent.id}`, {
          method: "PATCH", body: JSON.stringify(payload),
        })
        await readJsonOrThrow(response)
      } else {
        const response = await adminFetch("/api/admin/calendar", {
          method: "POST", body: JSON.stringify(payload),
        })
        await readJsonOrThrow(response)
      }
      setShowForm(false)
      setEditingEvent(null)
      setErrorMessage(null)
      await fetchEvents()
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "일정 저장에 실패했습니다.")
    }
    finally { setFormLoading(false) }
  }

  const handleDelete = async (ev: CalendarEvent) => {
    if (ev.readonly) return
    setFormLoading(true)
    try {
      const response = await adminFetch(`/api/admin/calendar/${ev.id}`, { method: "DELETE" })
      await readJsonOrThrow(response)
      setDeleteTarget(null)
      if (selectedDate === ev.date && eventsByDate[ev.date]?.length === 1) {
        setSelectedDate(null)
      }
      setErrorMessage(null)
      await fetchEvents()
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "일정 삭제에 실패했습니다.")
    }
    finally { setFormLoading(false) }
  }

  const openCreate = (date?: string) => {
    setEditingEvent(null)
    setShowForm(true)
    if (date) setSelectedDate(date)
  }

  const openEdit = (ev: CalendarEvent) => {
    if (ev.readonly) return
    setEditingEvent(ev)
    setShowForm(true)
  }

  const defaultCreateDate =
    selectedDate ??
    (year === today.getFullYear() && month === today.getMonth() + 1
      ? todayStr
      : toDateStr(year, month, 1))

  const initialForm: EventFormData = {
    ...EMPTY_FORM,
    date: defaultCreateDate,
  }
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

  // ─── Selected day events ───────────────────────────────────────
  const selectedEvents = selectedDate ? (eventsByDate[selectedDate] ?? []) : []

  // ─── Upcoming (next 7 days) ────────────────────────────────────
  const upcomingEvents = visibleEvents
    .filter((e) => (e.endDate ?? e.date) >= todayStr)
    .slice(0, 8)

  const monthLabel = `${year}년 ${month}월`

  return (
    <div className="px-4 pt-6 pb-24 sm:px-6 sm:pt-8 lg:px-8 lg:pt-10 lg:pb-20">
      {/* Header */}
      <div className="mb-6 flex flex-col gap-4 sm:mb-8 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-[11px] font-medium text-[#1a1a1a]/30 uppercase tracking-widest mb-1">Admin</p>
          <h1 className="text-2xl font-bold text-[#111110] tracking-[-0.02em]">운영 캘린더</h1>
          <p className="mt-2 text-[13px] leading-6 text-[#1a1a1a]/50">
            팀 일정과 파트너 운영 일정, 공개 행사, 마케팅(노션), 쇼룸 예약(구글), 팀원 행사(구글)를 함께 보되 외부 소스 일정은 읽기 전용으로 표시합니다.
          </p>
        </div>
        <Button size="sm" onClick={() => openCreate()} className="w-full sm:w-auto">
          <Plus className="w-4 h-4 mr-1.5" />
          일정 추가
        </Button>
      </div>

      {errorMessage && (
        <div className="mb-6 rounded-2xl border border-[#F6D5C5] bg-[#FEF3EE] px-5 py-4 text-[12px] leading-5 text-[#B85C33]">
          <strong className="mr-2">캘린더 오류:</strong>
          <span>{errorMessage}</span>
        </div>
      )}

      {/* Filter bar */}
      <div className="mb-6 overflow-hidden rounded-2xl border border-[#e8e8e4] bg-white">
        {/* 소스 필터 */}
        <div className="flex flex-wrap items-center gap-1.5 px-4 py-2.5">
          <span className="mr-1 shrink-0 text-[11px] font-semibold uppercase tracking-wider text-[#1a1a1a]/35">
            소스
          </span>
          {SOURCE_OPTIONS.map((option) => (
            <CheckChip
              key={option.value}
              checked={!hiddenSources.has(option.value)}
              label={option.label}
              count={sourceCounts[option.value] ?? 0}
              onToggle={() => toggleSource(option.value)}
              dot={option.dot}
            />
          ))}
          <button
            type="button"
            onClick={() => setAllSources(!allSourcesVisible)}
            className="ml-auto shrink-0 rounded-md px-2 py-1 text-[11px] font-medium text-[#1a1a1a]/45 transition-colors hover:bg-[#f5f5f2] hover:text-[#111110]"
          >
            {allSourcesVisible ? "모두 해제" : "모두 선택"}
          </button>
        </div>

        {/* 담당자 필터 — 팀(공용) + 팀원 개인. 팀 칩은 팀 일정 소스와 연동 */}
        {showAssigneeRow && (
          <div className="flex flex-wrap items-center gap-1.5 border-t border-[#f0f0ec] px-4 py-2.5">
            <span className="mr-1 shrink-0 text-[11px] font-semibold uppercase tracking-wider text-[#1a1a1a]/35">
              담당자
            </span>
            <CheckChip
              checked={!hiddenSources.has("calendar")}
              label="팀"
              count={sourceCounts.calendar ?? 0}
              onToggle={() => toggleSource("calendar")}
              dot="#084734"
            />
            {teamMembers.map((member) => (
              <CheckChip
                key={member.name}
                checked={!hiddenAssignees.has(member.name)}
                label={member.name}
                count={member.count}
                onToggle={() => toggleAssignee(member.name)}
                avatar
                dim={!teamEventSourceVisible}
              />
            ))}
            <button
              type="button"
              onClick={() => setAllAssignees(!allAssigneesVisible)}
              className="ml-auto shrink-0 rounded-md px-2 py-1 text-[11px] font-medium text-[#1a1a1a]/45 transition-colors hover:bg-[#f5f5f2] hover:text-[#111110]"
            >
              {allAssigneesVisible ? "모두 해제" : "모두 선택"}
            </button>
          </div>
        )}

        {/* 요약 + 유형 범례 */}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 border-t border-[#f0f0ec] bg-[#fafaf8] px-4 py-2.5 text-[12px] text-[#1a1a1a]/45">
          <span>
            표시중 <span className="font-semibold text-[#111110]">{visibleEvents.length}개</span>
            <span className="text-[#1a1a1a]/30"> / 이번달 {events.length}개</span>
          </span>
          {EVENT_TYPES.slice(0, 4).map((t) => {
            const cnt = visibleEvents.filter((e) => e.type === t.value).length
            if (cnt === 0) return null
            return (
              <span key={t.value} className="flex items-center gap-1.5">
                <span className={`h-2 w-2 rounded-full ${t.dot}`} />
                {t.label} {cnt}
              </span>
            )
          })}
        </div>
      </div>

      {/* Main grid */}
      <div className="flex flex-col gap-6 items-stretch xl:flex-row xl:items-start">
        {/* Calendar */}
        <div className="min-w-0 flex-1 overflow-hidden rounded-2xl border border-[#e8e8e4] bg-white">
          {/* Month nav */}
          <div className="flex items-center justify-between px-5 py-4 border-b border-[#e8e8e4]">
            <button
              onClick={prevMonth}
              className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-[#f0f0ec] transition-colors"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <div className="flex items-center gap-3">
              <h2 className="text-[15px] font-semibold text-[#111110]">{monthLabel}</h2>
              {loading && <div className="w-4 h-4 rounded-full border-2 border-[#111110]/20 border-t-[#111110] animate-spin" />}
            </div>
            <button
              onClick={nextMonth}
              className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-[#f0f0ec] transition-colors"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          {/* Weekday headers */}
          <div className="grid grid-cols-7 border-b border-[#e8e8e4]">
            {WEEKDAYS.map((d, i) => (
              <div
                key={d}
                className={`py-2.5 text-center text-[11px] font-medium ${
                  i === 0 ? "text-[#B85C33]" : i === 6 ? "text-[#615D59]" : "text-[#1a1a1a]/40"
                }`}
              >
                {d}
              </div>
            ))}
          </div>

          {/* Day cells */}
          <div className="grid grid-cols-7">
            {/* Empty cells before month start */}
            {Array.from({ length: firstDay }).map((_, i) => (
              <div key={`empty-${i}`} className="h-20 border-b border-r border-[#f0f0ec] sm:h-24" />
            ))}

            {/* Day cells */}
            {Array.from({ length: daysInMonth }).map((_, i) => {
              const day = i + 1
              const dateStr = toDateStr(year, month, day)
              const dayEvents = eventsByDate[dateStr] ?? []
              const isToday = dateStr === todayStr
              const isSelected = dateStr === selectedDate
              const isWeekend = (firstDay + i) % 7 === 0 || (firstDay + i) % 7 === 6
              const isSun = (firstDay + i) % 7 === 0

              return (
                <div
                  key={day}
                  onClick={() => setSelectedDate(isSelected ? null : dateStr)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault()
                      setSelectedDate(isSelected ? null : dateStr)
                    }
                  }}
                  role="button"
                  tabIndex={0}
                  aria-label={`${monthLabel} ${day}일 일정 보기`}
                  className={`relative h-20 cursor-pointer border-b border-r border-[#f0f0ec] p-1 transition-colors group sm:h-24 sm:p-1.5 ${
                    isSelected
                      ? "bg-[#111110]/5"
                      : "hover:bg-[#fafaf8]"
                  }`}
                >
                  {/* Day number */}
                  <div className="flex items-center justify-between mb-1">
                    <span className={`w-6 h-6 flex items-center justify-center rounded-full text-[12px] font-medium transition-colors ${
                      isToday
                        ? "bg-[#111110] text-white"
                        : isSun
                          ? "text-[#B85C33]"
                          : isWeekend
                            ? "text-[#615D59]"
                            : "text-[#1a1a1a]/70"
                    }`}>
                      {day}
                    </span>
                    {/* Quick add on hover */}
                    <button
                      onClick={(e) => { e.stopPropagation(); openCreate(dateStr) }}
                      aria-label={`${monthLabel} ${day}일에 일정 추가`}
                      className="w-5 h-5 flex items-center justify-center rounded text-[#1a1a1a]/30 hover:text-[#111110] hover:bg-[#e8e8e4] transition-all opacity-100 sm:opacity-0 sm:group-hover:opacity-100"
                    >
                      <Plus className="w-3 h-3" />
                    </button>
                  </div>

                  {/* 모바일: 일정 존재 신호 — 소스색 도트 최대 3개 + 초과 개수 (칩은 sm+ 전용) */}
                  {dayEvents.length > 0 && (
                    <div className="flex items-center gap-0.5 px-0.5 sm:hidden" aria-hidden="true">
                      {dayEvents.slice(0, 3).map((ev) => (
                        <span
                          key={`dot-${ev.id}`}
                          className="h-1.5 w-1.5 shrink-0 rounded-full"
                          style={{ backgroundColor: getSourceColor(getEventSource(ev)) }}
                        />
                      ))}
                      {dayEvents.length > 3 && (
                        <span className="text-[9px] font-medium leading-none text-[#1a1a1a]/40">
                          +{dayEvents.length - 3}
                        </span>
                      )}
                    </div>
                  )}

                  {/* Event dots/chips */}
                  <div className="hidden space-y-0.5 overflow-hidden sm:block">
                    {dayEvents.slice(0, 3).map((ev) => {
                      const style = getTypeStyle(ev.type)
                      const evSource = getEventSource(ev)
                      const sourceBadge = evSource === "partner" ? "P" : evSource === "notion" ? "M" : evSource === "showroom" ? "S" : evSource === "team_event" ? "행" : null
                      return (
                        <div
                          key={ev.id}
                          style={{ boxShadow: `inset 2px 0 0 0 ${getSourceColor(evSource)}` }}
                          className={`flex items-center gap-1 rounded border py-0.5 pl-2 pr-1.5 text-[10px] font-medium truncate ${style.bg} ${style.color}`}
                        >
                          <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${style.dot}`} />
                          {sourceBadge && (
                            <span
                              title={evSource === "notion" ? "마케팅(노션)" : evSource === "showroom" ? "쇼룸 예약" : evSource === "team_event" ? "팀원 행사" : "파트너"}
                              className="rounded bg-white/80 px-1 py-0 text-[9px] font-semibold text-[#111110]/70"
                            >
                              {sourceBadge}
                            </span>
                          )}
                          <span className="truncate">{ev.title}</span>
                        </div>
                      )
                    })}
                    {dayEvents.length > 3 && (
                      <div className="text-[10px] text-[#1a1a1a]/40 px-1.5">
                        +{dayEvents.length - 3}개 더
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* Right panel */}
        <div className="w-full shrink-0 space-y-4 xl:w-72">
          {/* Selected day */}
          {selectedDate && (
            <div className="bg-white rounded-2xl border border-[#e8e8e4] overflow-hidden">
              <div className="flex items-center justify-between px-4 py-3 border-b border-[#e8e8e4]">
                <div>
                  <p className="text-[11px] text-[#1a1a1a]/40 mb-0.5">선택된 날짜</p>
                  <p className="text-[13px] font-semibold text-[#111110]">{formatDate(selectedDate)}</p>
                </div>
                <button
                  onClick={() => openCreate(selectedDate)}
                  aria-label={`${formatDate(selectedDate)}에 일정 추가`}
                  className="w-7 h-7 flex items-center justify-center rounded-lg bg-[#111110] text-white hover:bg-[#111110]/80 transition-colors"
                >
                  <Plus className="w-3.5 h-3.5" />
                </button>
              </div>

              {selectedEvents.length === 0 ? (
                <div className="py-8 text-center text-[13px] text-[#1a1a1a]/30">
                  일정 없음
                </div>
              ) : (
                <div className="divide-y divide-[#f0f0ec]">
                  {selectedEvents.map((ev) => {
                    const style = getTypeStyle(ev.type)
                    const source = getEventSource(ev)
                    const isExternalReadonly = Boolean(ev.readonly)
                    const isExternalHref = Boolean(ev.href && ev.href.startsWith("http"))
                    const actionLabel =
                      source === "event"
                        ? "행사 관리 열기"
                        : source === "notion"
                          ? "노션에서 열기"
                          : source === "showroom" || source === "team_event"
                            ? "구글 캘린더에서 열기"
                            : "파트너 열기"
                    const readonlyHelp =
                      source === "event"
                        ? "공개 행사는 행사 관리에서 수정합니다."
                        : source === "notion"
                          ? "마케팅 캘린더는 노션에서 수정합니다."
                          : source === "showroom"
                            ? "쇼룸 예약은 구글 캘린더에서 수정합니다."
                            : source === "team_event"
                              ? "팀원 행사는 구글 캘린더에서 수정합니다."
                              : "파트너 일정은 파트너 운영 상세에서 수정합니다."
                    return (
                      <div key={ev.id} className="px-4 py-3">
                        <div className="flex items-start justify-between gap-2 mb-1.5">
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5 min-w-0">
                              <span className={`w-2 h-2 rounded-full shrink-0 ${style.dot}`} />
                              <p className="text-[13px] font-medium text-[#111110] truncate">{ev.title}</p>
                            </div>
                            <div className="mt-1 flex flex-wrap items-center gap-1.5">
                              <span className="rounded-full bg-[#f0f0ec] px-2 py-0.5 text-[10px] font-medium text-[#1a1a1a]/55">
                                {getEventSourceLabel(ev)}
                              </span>
                              <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${style.bg} ${style.color}`}>
                                {getTypeStyle(ev.type).label}
                              </span>
                              {ev.partnerName && (
                                <span className="rounded-full border border-[#e8e8e4] px-2 py-0.5 text-[10px] text-[#1a1a1a]/45">
                                  {ev.partnerName}
                                </span>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center gap-1 shrink-0">
                            {isExternalReadonly ? (
                              ev.href ? (
                                <Link
                                  href={ev.href}
                                  target={isExternalHref ? "_blank" : undefined}
                                  rel={isExternalHref ? "noopener noreferrer" : undefined}
                                  aria-label={isExternalHref ? `${actionLabel} (새 탭에서 열림)` : undefined}
                                  className="rounded-lg border border-[#e8e8e4] px-2.5 py-1 text-[11px] font-medium text-[#1a1a1a]/55 transition-colors hover:border-[#111110]/20 hover:text-[#111110]"
                                >
                                  {actionLabel}
                                </Link>
                              ) : (
                                <span className="rounded-lg border border-[#e8e8e4] px-2.5 py-1 text-[11px] font-medium text-[#1a1a1a]/40">
                                  읽기 전용
                                </span>
                              )
                            ) : (
                              <>
                                <button
                                  onClick={() => openEdit(ev)}
                                  aria-label={`${ev.title} 일정 수정`}
                                  className="w-6 h-6 flex items-center justify-center rounded hover:bg-[#f0f0ec] text-[#1a1a1a]/30 hover:text-[#111110] transition-colors"
                                >
                                  <Pencil className="w-3 h-3" />
                                </button>
                                <button
                                  onClick={() => setDeleteTarget(ev)}
                                  aria-label={`${ev.title} 일정 삭제`}
                                  className="w-6 h-6 flex items-center justify-center rounded hover:bg-[#FEF3EE] text-[#1a1a1a]/30 hover:text-[#B85C33] transition-colors"
                                >
                                  <Trash2 className="w-3 h-3" />
                                </button>
                              </>
                            )}
                          </div>
                        </div>
                        <div className="space-y-1 text-[11px] text-[#1a1a1a]/50">
                          {ev.time && (
                            <div className="flex items-center gap-1.5">
                              <Clock className="w-3 h-3" />
                              {ev.time}{ev.endTime ? ` ~ ${ev.endTime}` : ""}
                            </div>
                          )}
                          {ev.assignees && ev.assignees.length > 0 && (
                            <div className="flex items-center gap-1.5">
                              <Users className="w-3 h-3" />
                              {ev.assignees.join(", ")}
                            </div>
                          )}
                          {ev.dealTitle && (
                            <div className="flex items-start gap-1.5">
                              <span className="mt-[2px] h-3 w-3 shrink-0 rounded-full bg-[#111110]/8" />
                              <span>연결 거래: {ev.dealTitle}</span>
                            </div>
                          )}
                          {ev.description && (
                            <div className="flex items-start gap-1.5">
                              <AlignLeft className="w-3 h-3 mt-0.5 shrink-0" />
                              <span className="line-clamp-2">{ev.description}</span>
                            </div>
                          )}
                          {isExternalReadonly && (
                            <div className="rounded-lg bg-[#fafaf8] px-2.5 py-2 text-[11px] text-[#1a1a1a]/45">
                              {readonlyHelp}
                            </div>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )}

          {/* Upcoming events */}
          <div className="bg-white rounded-2xl border border-[#e8e8e4] overflow-hidden">
            <div className="px-4 py-3 border-b border-[#e8e8e4]">
              <p className="text-[13px] font-semibold text-[#111110]">다가오는 일정</p>
            </div>
            {upcomingEvents.length === 0 ? (
              <div className="py-8 text-center">
                <CalendarDays className="w-8 h-8 text-[#1a1a1a]/15 mx-auto mb-2" />
                <p className="text-[13px] text-[#1a1a1a]/30">예정된 일정 없음</p>
              </div>
            ) : (
              <div className="divide-y divide-[#f0f0ec]">
                {upcomingEvents.map((ev) => {
                  const style = getTypeStyle(ev.type)
                  const daysLeft = Math.ceil(
                    (new Date(ev.date + "T00:00:00").getTime() - new Date(todayStr + "T00:00:00").getTime())
                    / 86400000
                  )
                  const isPartnerEvent = getEventSource(ev) === "partner"
                  return (
                    <div
                      key={ev.id}
                      className="px-4 py-2.5 cursor-pointer hover:bg-[#fafaf8] transition-colors"
                      onClick={() => setSelectedDate(ev.date)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault()
                          setSelectedDate(ev.date)
                        }
                      }}
                      role="button"
                      tabIndex={0}
                      aria-label={`${ev.title} 일정 보기`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className={`w-2 h-2 rounded-full shrink-0 ${style.dot}`} />
                          <span className="text-[13px] font-medium text-[#111110] truncate">{ev.title}</span>
                        </div>
                        <span className={`text-[11px] shrink-0 ${daysLeft === 0 ? "text-[#B85C33] font-semibold" : "text-[#1a1a1a]/35"}`}>
                          {daysLeft === 0 ? "오늘" : `D-${daysLeft}`}
                        </span>
                      </div>
                      <div className="ml-4 mt-0.5 flex flex-wrap items-center gap-1.5">
                        <p className="text-[11px] text-[#1a1a1a]/40">
                          {formatDate(ev.date)}{ev.time ? ` · ${ev.time}` : ""}
                        </p>
                        <span className="rounded-full bg-[#f0f0ec] px-2 py-0.5 text-[10px] font-medium text-[#1a1a1a]/50">
                          {getEventSourceLabel(ev)}
                        </span>
                        {isPartnerEvent && ev.partnerName && (
                          <span className="rounded-full border border-[#e8e8e4] px-2 py-0.5 text-[10px] text-[#1a1a1a]/45">
                            {ev.partnerName}
                          </span>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Add / Edit Modal */}
      <Dialog open={showForm} onOpenChange={(open) => {
        if (!open && !formLoading) {
          setShowForm(false)
          setEditingEvent(null)
        }
      }}>
        <DialogContent className="max-h-[90vh] max-w-md overflow-y-auto bg-white">
          <DialogHeader>
            <DialogTitle>{editingEvent ? "일정 수정" : "일정 추가"}</DialogTitle>
            <DialogDescription>
              팀 일정은 여기서 수정하고, 파트너 일정은 파트너 운영 상세에서 수정합니다.
            </DialogDescription>
          </DialogHeader>
          <EventForm
            initial={editForm}
            onSave={handleSave}
            onCancel={() => { setShowForm(false); setEditingEvent(null) }}
            loading={formLoading}
            isEdit={!!editingEvent}
          />
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <Dialog open={Boolean(deleteTarget)} onOpenChange={(open) => {
        if (!open && !formLoading) setDeleteTarget(null)
      }}>
        <DialogContent className="max-w-sm bg-white">
          <DialogHeader>
            <DialogTitle>일정 삭제</DialogTitle>
            <DialogDescription>
              {deleteTarget
                ? <><span className="font-medium text-[#111110]">&ldquo;{deleteTarget.title}&rdquo;</span>을 삭제하시겠습니까?</>
                : "선택한 일정을 삭제하시겠습니까?"}
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
