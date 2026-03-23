"use client"

import { useState, useEffect, useCallback } from "react"
import {
  ChevronLeft, ChevronRight, Plus, X, Clock, Users,
  AlignLeft, Trash2, Pencil, CalendarDays,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import type { CalendarEvent, EventType } from "@/lib/calendar-data"

// ─── 상수 ─────────────────────────────────────────────────────────────────────

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"]

const EVENT_TYPES: { value: EventType; label: string; color: string; bg: string; dot: string }[] = [
  { value: "team",     label: "팀 일정",  color: "text-blue-700",  bg: "bg-blue-50 border-blue-200",   dot: "bg-blue-500" },
  { value: "meeting",  label: "회의",     color: "text-violet-700", bg: "bg-violet-50 border-violet-200", dot: "bg-violet-500" },
  { value: "deadline", label: "마감",     color: "text-red-700",   bg: "bg-red-50 border-red-200",     dot: "bg-red-500" },
  { value: "launch",   label: "런칭",     color: "text-emerald-700", bg: "bg-emerald-50 border-emerald-200", dot: "bg-emerald-500" },
  { value: "holiday",  label: "휴일",     color: "text-orange-700", bg: "bg-orange-50 border-orange-200", dot: "bg-orange-400" },
  { value: "other",    label: "기타",     color: "text-gray-600",  bg: "bg-gray-50 border-gray-200",   dot: "bg-gray-400" },
]

function getTypeStyle(type: EventType) {
  return EVENT_TYPES.find((t) => t.value === type) ?? EVENT_TYPES[EVENT_TYPES.length - 1]
}

function toDateStr(y: number, m: number, d: number) {
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`
}

function formatDate(dateStr: string) {
  const d = new Date(dateStr + "T00:00:00")
  return d.toLocaleDateString("ko-KR", { month: "long", day: "numeric", weekday: "short" })
}

// ─── 인증 헬퍼 ────────────────────────────────────────────────────────────────

function getToken() {
  return sessionStorage.getItem("admin_password") ?? ""
}

function adminFetch(url: string, options?: RequestInit) {
  return fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${getToken()}`,
      ...options?.headers,
    },
  })
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
        <div className="grid grid-cols-3 gap-1.5">
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

      <div className="grid grid-cols-2 gap-3">
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
        <div className="grid grid-cols-2 gap-3">
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

      <div className="flex justify-end gap-2 pt-1">
        <Button type="button" variant="outline" onClick={onCancel} disabled={loading}>취소</Button>
        <Button type="submit" disabled={loading}>
          {loading ? "저장 중..." : isEdit ? "수정" : "추가"}
        </Button>
      </div>
    </form>
  )
}

// ─── 메인 페이지 ──────────────────────────────────────────────────────────────

export default function AdminCalendarPage() {
  const today = new Date()
  const [year, setYear] = useState(today.getFullYear())
  const [month, setMonth] = useState(today.getMonth() + 1)
  const [events, setEvents] = useState<CalendarEvent[]>([])
  const [loading, setLoading] = useState(false)
  const [formLoading, setFormLoading] = useState(false)

  const [selectedDate, setSelectedDate] = useState<string | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [editingEvent, setEditingEvent] = useState<CalendarEvent | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<CalendarEvent | null>(null)

  const fetchEvents = useCallback(async () => {
    setLoading(true)
    try {
      const res = await adminFetch(`/api/admin/calendar?year=${year}&month=${month}`)
      if (res.ok) setEvents(await res.json())
    } catch { /* silent */ }
    finally { setLoading(false) }
  }, [year, month])

  useEffect(() => { fetchEvents() }, [fetchEvents])

  // ─── Calendar Math ─────────────────────────────────────────────
  const firstDay = new Date(year, month - 1, 1).getDay()
  const daysInMonth = new Date(year, month, 0).getDate()
  const todayStr = toDateStr(today.getFullYear(), today.getMonth() + 1, today.getDate())

  // map date → events
  const eventsByDate = events.reduce<Record<string, CalendarEvent[]>>((acc, ev) => {
    const key = ev.date
    if (!acc[key]) acc[key] = []
    acc[key].push(ev)
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
        await adminFetch(`/api/admin/calendar/${editingEvent.id}`, {
          method: "PATCH", body: JSON.stringify(payload),
        })
      } else {
        await adminFetch("/api/admin/calendar", {
          method: "POST", body: JSON.stringify(payload),
        })
      }
      setShowForm(false)
      setEditingEvent(null)
      await fetchEvents()
    } catch { /* silent */ }
    finally { setFormLoading(false) }
  }

  const handleDelete = async (ev: CalendarEvent) => {
    setFormLoading(true)
    try {
      await adminFetch(`/api/admin/calendar/${ev.id}`, { method: "DELETE" })
      setDeleteTarget(null)
      if (selectedDate === ev.date && eventsByDate[ev.date]?.length === 1) {
        setSelectedDate(null)
      }
      await fetchEvents()
    } catch { /* silent */ }
    finally { setFormLoading(false) }
  }

  const openCreate = (date?: string) => {
    setEditingEvent(null)
    setShowForm(true)
    if (date) setSelectedDate(date)
  }

  const openEdit = (ev: CalendarEvent) => {
    setEditingEvent(ev)
    setShowForm(true)
  }

  const initialForm: EventFormData = {
    ...EMPTY_FORM,
    date: selectedDate ?? toDateStr(year, month, today.getDate()),
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
  const upcomingEvents = events
    .filter((e) => e.date >= todayStr)
    .slice(0, 8)

  const monthLabel = `${year}년 ${month}월`
  const totalThisMonth = events.length

  return (
    <div className="px-8 pt-12 pb-20">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <p className="text-[11px] font-medium text-[#1a1a1a]/30 uppercase tracking-widest mb-1">Admin</p>
          <h1 className="text-2xl font-bold text-[#111110] tracking-[-0.02em]">팀 캘린더</h1>
        </div>
        <Button size="sm" onClick={() => openCreate()}>
          <Plus className="w-4 h-4 mr-1.5" />
          일정 추가
        </Button>
      </div>

      {/* Stats strip */}
      <div className="flex items-center gap-6 mb-6 text-[13px]">
        <span className="text-[#1a1a1a]/40">
          이번달 <span className="font-semibold text-[#111110]">{totalThisMonth}개</span>
        </span>
        {EVENT_TYPES.slice(0, 4).map((t) => {
          const cnt = events.filter(e => e.type === t.value).length
          if (cnt === 0) return null
          return (
            <span key={t.value} className="flex items-center gap-1.5 text-[#1a1a1a]/50">
              <span className={`w-2 h-2 rounded-full ${t.dot}`} />
              {t.label} {cnt}
            </span>
          )
        })}
      </div>

      {/* Main grid */}
      <div className="flex gap-6 items-start">
        {/* Calendar */}
        <div className="flex-1 min-w-0 bg-white rounded-2xl border border-[#e8e8e4] overflow-hidden">
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
                  i === 0 ? "text-red-400" : i === 6 ? "text-blue-400" : "text-[#1a1a1a]/40"
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
              <div key={`empty-${i}`} className="h-24 border-b border-r border-[#f0f0ec]" />
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
                  className={`h-24 border-b border-r border-[#f0f0ec] p-1.5 cursor-pointer transition-colors relative group ${
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
                          ? "text-red-400"
                          : isWeekend
                            ? "text-blue-400"
                            : "text-[#1a1a1a]/70"
                    }`}>
                      {day}
                    </span>
                    {/* Quick add on hover */}
                    <button
                      onClick={(e) => { e.stopPropagation(); openCreate(dateStr) }}
                      className="opacity-0 group-hover:opacity-100 w-5 h-5 flex items-center justify-center rounded text-[#1a1a1a]/30 hover:text-[#111110] hover:bg-[#e8e8e4] transition-all"
                    >
                      <Plus className="w-3 h-3" />
                    </button>
                  </div>

                  {/* Event dots/chips */}
                  <div className="space-y-0.5 overflow-hidden">
                    {dayEvents.slice(0, 3).map((ev) => {
                      const style = getTypeStyle(ev.type)
                      return (
                        <div
                          key={ev.id}
                          className={`flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium truncate border ${style.bg} ${style.color}`}
                        >
                          <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${style.dot}`} />
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
        <div className="w-72 shrink-0 space-y-4">
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
                    return (
                      <div key={ev.id} className="px-4 py-3">
                        <div className="flex items-start justify-between gap-2 mb-1.5">
                          <div className="flex items-center gap-1.5 min-w-0">
                            <span className={`w-2 h-2 rounded-full shrink-0 ${style.dot}`} />
                            <p className="text-[13px] font-medium text-[#111110] truncate">{ev.title}</p>
                          </div>
                          <div className="flex items-center gap-0.5 shrink-0">
                            <button
                              onClick={() => openEdit(ev)}
                              className="w-6 h-6 flex items-center justify-center rounded hover:bg-[#f0f0ec] text-[#1a1a1a]/30 hover:text-[#111110] transition-colors"
                            >
                              <Pencil className="w-3 h-3" />
                            </button>
                            <button
                              onClick={() => setDeleteTarget(ev)}
                              className="w-6 h-6 flex items-center justify-center rounded hover:bg-red-50 text-[#1a1a1a]/30 hover:text-red-500 transition-colors"
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
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
                          {ev.description && (
                            <div className="flex items-start gap-1.5">
                              <AlignLeft className="w-3 h-3 mt-0.5 shrink-0" />
                              <span className="line-clamp-2">{ev.description}</span>
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
                  return (
                    <div
                      key={ev.id}
                      className="px-4 py-2.5 cursor-pointer hover:bg-[#fafaf8] transition-colors"
                      onClick={() => setSelectedDate(ev.date)}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className={`w-2 h-2 rounded-full shrink-0 ${style.dot}`} />
                          <span className="text-[13px] font-medium text-[#111110] truncate">{ev.title}</span>
                        </div>
                        <span className={`text-[11px] shrink-0 ${daysLeft === 0 ? "text-red-500 font-semibold" : "text-[#1a1a1a]/35"}`}>
                          {daysLeft === 0 ? "오늘" : `D-${daysLeft}`}
                        </span>
                      </div>
                      <p className="text-[11px] text-[#1a1a1a]/40 ml-4 mt-0.5">
                        {formatDate(ev.date)}{ev.time ? ` · ${ev.time}` : ""}
                      </p>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Add / Edit Modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-[#e8e8e4]">
              <h3 className="text-[15px] font-semibold text-[#111110]">
                {editingEvent ? "일정 수정" : "일정 추가"}
              </h3>
              <button
                onClick={() => { setShowForm(false); setEditingEvent(null) }}
                className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-[#f0f0ec] text-[#1a1a1a]/40 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="px-6 py-4">
              <EventForm
                initial={editForm}
                onSave={handleSave}
                onCancel={() => { setShowForm(false); setEditingEvent(null) }}
                loading={formLoading}
                isEdit={!!editingEvent}
              />
            </div>
          </div>
        </div>
      )}

      {/* Delete confirm */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-xl">
            <p className="font-semibold text-[#111110] mb-1">일정 삭제</p>
            <p className="text-[13px] text-[#1a1a1a]/60 mb-5">
              <span className="font-medium text-[#111110]">&ldquo;{deleteTarget.title}&rdquo;</span>을 삭제하시겠습니까?
            </p>
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => setDeleteTarget(null)} disabled={formLoading}>
                취소
              </Button>
              <Button
                className="flex-1 bg-red-500 hover:bg-red-600 text-white"
                onClick={() => handleDelete(deleteTarget)}
                disabled={formLoading}
              >
                {formLoading ? "삭제 중..." : "삭제"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
