"use client"

import { useMemo, useState } from "react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  addMinutesToTime,
  formatAssignees,
  formatDateLabel,
  getFormIssues,
  hasBlockingIssue,
  isTimeString,
  minutesBetweenTimes,
  parseAssignees,
  shiftEndDate,
  summarizeSchedule,
  type EventFormData,
  type EventFormIssues,
} from "@/lib/admin-calendar/event-form"
import { addDays, isDateString, startOfWeek, toDateString } from "@/lib/admin-calendar/range"
import { TEAM_MEMBER_COLORS } from "@/lib/team-member-colors"

import { AssigneePicker } from "./AssigneePicker"
import { EVENT_TYPES } from "./event-style"

type IssueField = keyof EventFormIssues

const LABEL_CLASS = "text-[12px] font-semibold text-[#615D59]"
/** 회의·업무가 실제로 몰리는 시각. 손으로 치는 대신 한 번 눌러 채운다. */
const QUICK_TIMES = ["09:00", "10:00", "11:00", "14:00", "15:00", "16:00"]
/** 종료 시간 자동 계산용 길이(분). */
const QUICK_DURATIONS = [
  { minutes: 30, label: "30분" },
  { minutes: 60, label: "1시간" },
  { minutes: 120, label: "2시간" },
]
const DEFAULT_DURATION_MINUTES = 60

function todayString() {
  const now = new Date()
  return toDateString(now.getFullYear(), now.getMonth() + 1, now.getDate())
}

/** 폼 안에서만 쓰는 작은 토글 칩. 눌린 상태는 그린 서피스로만 표시한다. */
function QuickChip({
  active,
  onClick,
  children,
  disabled,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={active}
      className={`rounded-full border px-2 py-1 text-[11px] font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#084734] disabled:cursor-not-allowed disabled:opacity-40 ${
        active
          ? "border-[#084734]/25 bg-[#ECFDF5] text-[#084734]"
          : "border-black/[0.08] bg-white text-[#615D59] hover:border-[#084734]/25 hover:text-[#084734]"
      }`}
    >
      {children}
    </button>
  )
}

function FieldError({ id, message }: { id: string; message?: string }) {
  if (!message) return null
  return (
    <p id={id} role="alert" className="text-[11px] font-medium text-[#B43E3E]">
      {message}
    </p>
  )
}

interface EventFormProps {
  initial: EventFormData
  onSave: (data: EventFormData) => void
  onCancel: () => void
  loading: boolean
  isEdit: boolean
  /** 최근 일정에서 실제로 쓰인 담당자 이름. 팀 명부와 합쳐 추천으로 뜬다. */
  assigneeSuggestions?: string[]
}

export function EventForm({
  initial,
  onSave,
  onCancel,
  loading,
  isEdit,
  assigneeSuggestions = [],
}: EventFormProps) {
  const [form, setForm] = useState<EventFormData>(initial)
  const [touched, setTouched] = useState<Partial<Record<IssueField, boolean>>>({})
  const [today] = useState(todayString)

  const set = (key: keyof EventFormData, value: string | boolean) =>
    setForm((prev) => ({ ...prev, [key]: value }))

  const markTouched = (field: IssueField) => setTouched((prev) => ({ ...prev, [field]: true }))

  const issues = useMemo(() => getFormIssues(form), [form])
  const summary = useMemo(() => summarizeSchedule(form), [form])
  const assignees = useMemo(() => parseAssignees(form.assignees), [form.assignees])

  // 팀 명부가 먼저(손으로 고정한 순서), 명부에 없지만 실제로 쓰인 이름이 뒤에 붙는다.
  const suggestions = useMemo(() => {
    const merged = Object.keys(TEAM_MEMBER_COLORS)
    for (const name of assigneeSuggestions) {
      const trimmed = name.trim()
      if (trimmed && !merged.includes(trimmed)) merged.push(trimmed)
    }
    return merged
  }, [assigneeSuggestions])

  const errorFor = (field: IssueField) => (touched[field] ? issues[field] : undefined)

  /**
   * 시작일을 옮기면 종료일도 같은 간격만큼 따라온다 — 3일짜리 일정을 하루 미룰 때
   * 종료일만 제자리에 남아 범위가 뒤집히는 걸 막는다.
   */
  const handleStartDate = (nextDate: string) =>
    setForm((prev) => ({
      ...prev,
      date: nextDate,
      endDate: shiftEndDate(prev.date, prev.endDate, nextDate),
    }))

  /** 시작 시간을 정하면 종료 시간이 따라온다. 기존 길이가 있으면 그 길이를 유지한다. */
  const handleStartTime = (nextTime: string) =>
    setForm((prev) => {
      if (!isTimeString(nextTime)) return { ...prev, time: nextTime }
      const previousSpan =
        isTimeString(prev.time) && isTimeString(prev.endTime)
          ? minutesBetweenTimes(prev.time, prev.endTime)
          : 0
      const span = previousSpan > 0 ? previousSpan : DEFAULT_DURATION_MINUTES
      return { ...prev, time: nextTime, endTime: addMinutesToTime(nextTime, span) }
    })

  /** 종일로 바꾸면 시각을 비운다 — "종일 + 14:00" 같은 모순을 저장하지 않는다. */
  const handleAllDay = (allDay: boolean) =>
    setForm((prev) => (allDay ? { ...prev, allDay, time: "", endTime: "" } : { ...prev, allDay }))

  const submit = () => {
    if (loading) return
    if (hasBlockingIssue(issues)) {
      setTouched({ title: true, date: true, endDate: true, time: true, endTime: true })
      return
    }
    onSave(form)
  }

  const quickDates = [
    { label: "오늘", value: today },
    { label: "내일", value: addDays(today, 1) },
    { label: "다음 주 월", value: startOfWeek(addDays(today, 7)) },
  ]

  return (
    <form
      noValidate
      onSubmit={(event) => {
        event.preventDefault()
        submit()
      }}
      onKeyDown={(event) => {
        // 메모(textarea)에서도 저장할 수 있게 ⌘/Ctrl+Enter 를 폼 전체에 건다.
        if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
          event.preventDefault()
          submit()
        }
      }}
      className="space-y-4"
    >
      {/* 제목 — 폼의 주인공이라 한 단계 크게 둔다 */}
      <div className="space-y-1.5">
        <Label htmlFor="event-title" className={LABEL_CLASS}>
          제목 <span className="text-[#084734]">*</span>
        </Label>
        <Input
          id="event-title"
          value={form.title}
          onChange={(event) => set("title", event.target.value)}
          onBlur={() => markTouched("title")}
          placeholder="예) 3분기 파트너 정기 회의"
          aria-required
          aria-invalid={Boolean(errorFor("title"))}
          aria-describedby={errorFor("title") ? "event-title-error" : undefined}
          className="h-11 text-[15px] font-medium"
          autoFocus
        />
        <FieldError id="event-title-error" message={errorFor("title")} />
      </div>

      {/* 유형 */}
      <fieldset className="space-y-1.5">
        <legend className={LABEL_CLASS}>
          유형 <span className="text-[#084734]">*</span>
        </legend>
        <div className="grid grid-cols-3 gap-1.5">
          {EVENT_TYPES.map((type) => {
            const active = form.type === type.value
            return (
              <button
                key={type.value}
                type="button"
                onClick={() => set("type", type.value)}
                aria-pressed={active}
                className={`inline-flex items-center justify-center gap-1.5 rounded-full border px-2 py-1.5 text-[12px] font-medium transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-[#084734] ${
                  active
                    ? `${type.bg} ${type.color} shadow-[0_1px_2px_rgba(17,17,16,0.05)]`
                    : "border-black/[0.08] bg-white text-[#615D59] hover:border-[#1a1a1a]/20 hover:text-[#111110]"
                }`}
              >
                <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${type.dot}`} />
                {type.label}
              </button>
            )
          })}
        </div>
      </fieldset>

      {/* 일시 — 날짜·종일·시간을 한 블록으로 묶는다 */}
      <div className="space-y-3 rounded-xl border border-black/[0.08] bg-[#F6F5F4] p-3">
        <div className="flex items-center justify-between gap-2">
          <span className={LABEL_CLASS}>일시</span>
          <div className="flex items-center gap-2">
            <span id="event-allday-label" className="text-[12px] font-medium text-[#615D59]">
              종일
            </span>
            <button
              type="button"
              role="switch"
              aria-checked={form.allDay}
              aria-labelledby="event-allday-label"
              onClick={() => handleAllDay(!form.allDay)}
              className={`relative h-5 w-9 shrink-0 rounded-full transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#084734] focus-visible:ring-offset-2 ${
                form.allDay ? "bg-[#084734]" : "bg-[#D8D8D2]"
              }`}
            >
              {/* left-0 을 명시한다 — 버튼의 기본 text-align:center 가 static position 을
                  가운데로 밀어 손잡이가 꺼진 상태에서도 오른쪽에 붙는다. */}
              <span
                className={`absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-white shadow-sm transition-transform ${
                  form.allDay ? "translate-x-4" : "translate-x-0"
                }`}
              />
            </button>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="event-start-date" className={LABEL_CLASS}>
              시작일 <span className="text-[#084734]">*</span>
            </Label>
            <Input
              id="event-start-date"
              type="date"
              value={form.date}
              onChange={(event) => handleStartDate(event.target.value)}
              onBlur={() => markTouched("date")}
              aria-required
              aria-invalid={Boolean(errorFor("date"))}
              aria-describedby={errorFor("date") ? "event-start-date-error" : undefined}
            />
            <div className="flex flex-wrap gap-1">
              {quickDates.map((quick) => (
                <QuickChip
                  key={quick.label}
                  active={form.date === quick.value}
                  onClick={() => handleStartDate(quick.value)}
                >
                  {quick.label}
                </QuickChip>
              ))}
            </div>
            <FieldError id="event-start-date-error" message={errorFor("date")} />
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <Label htmlFor="event-end-date" className={LABEL_CLASS}>
                종료일
              </Label>
              {form.endDate && (
                <button
                  type="button"
                  onClick={() => set("endDate", "")}
                  className="text-[11px] font-medium text-[#615D59] underline-offset-2 hover:text-[#084734] hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-[#084734]"
                >
                  지우기
                </button>
              )}
            </div>
            <Input
              id="event-end-date"
              type="date"
              value={form.endDate}
              onChange={(event) => set("endDate", event.target.value)}
              onBlur={() => markTouched("endDate")}
              min={isDateString(form.date) ? form.date : undefined}
              aria-invalid={Boolean(errorFor("endDate"))}
              aria-describedby={
                errorFor("endDate") ? "event-end-date-error" : "event-end-date-hint"
              }
            />
            {/* 오류가 뜬 자리에 안내문까지 겹치면 "8월 19일까지" 와 "시작일 이후여야" 가 서로 부딪힌다. */}
            <p
              id="event-end-date-hint"
              hidden={Boolean(errorFor("endDate"))}
              className="text-[11px] text-[#A39E98]"
            >
              {isDateString(form.endDate)
                ? `${formatDateLabel(form.endDate)}까지`
                : "비워두면 하루 일정입니다"}
            </p>
            <FieldError id="event-end-date-error" message={errorFor("endDate")} />
          </div>
        </div>

        {!form.allDay && (
          <div className="grid gap-3 border-t border-black/[0.06] pt-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="event-start-time" className={LABEL_CLASS}>
                시작 시간
              </Label>
              <Input
                id="event-start-time"
                type="time"
                value={form.time}
                onChange={(event) => handleStartTime(event.target.value)}
                onBlur={() => markTouched("time")}
                aria-invalid={Boolean(errorFor("time"))}
                aria-describedby={errorFor("time") ? "event-start-time-error" : undefined}
              />
              <div className="grid grid-cols-3 gap-1">
                {QUICK_TIMES.map((time) => (
                  <QuickChip
                    key={time}
                    active={form.time === time}
                    onClick={() => handleStartTime(time)}
                  >
                    {time}
                  </QuickChip>
                ))}
              </div>
              <FieldError id="event-start-time-error" message={errorFor("time")} />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="event-end-time" className={LABEL_CLASS}>
                종료 시간
              </Label>
              <Input
                id="event-end-time"
                type="time"
                value={form.endTime}
                onChange={(event) => set("endTime", event.target.value)}
                onBlur={() => markTouched("endTime")}
                min={isTimeString(form.time) ? form.time : undefined}
                aria-invalid={Boolean(errorFor("endTime"))}
                aria-describedby={errorFor("endTime") ? "event-end-time-error" : undefined}
              />
              <div className="grid grid-cols-3 gap-1">
                {QUICK_DURATIONS.map((duration) => {
                  const value = isTimeString(form.time)
                    ? addMinutesToTime(form.time, duration.minutes)
                    : ""
                  return (
                    <QuickChip
                      key={duration.minutes}
                      active={Boolean(value) && form.endTime === value}
                      disabled={!value}
                      onClick={() => set("endTime", value)}
                    >
                      {duration.label}
                    </QuickChip>
                  )
                })}
              </div>
              <FieldError id="event-end-time-error" message={errorFor("endTime")} />
            </div>
          </div>
        )}
      </div>

      {/* 담당자 */}
      <div className="space-y-1.5">
        <Label htmlFor="event-assignees" className={LABEL_CLASS}>
          담당자
        </Label>
        <AssigneePicker
          id="event-assignees"
          value={assignees}
          onChange={(next) => set("assignees", formatAssignees(next))}
          suggestions={suggestions}
          describedBy="event-assignees-hint"
          disabled={loading}
        />
        <p id="event-assignees-hint" className="text-[11px] text-[#A39E98]">
          이름을 눌러 담고, 명부에 없는 사람은 직접 입력한 뒤 Enter를 누릅니다.
        </p>
      </div>

      {/* 메모 */}
      <div className="space-y-1.5">
        <Label htmlFor="event-description" className={LABEL_CLASS}>
          메모
        </Label>
        <textarea
          id="event-description"
          value={form.description}
          onChange={(event) => set("description", event.target.value)}
          placeholder="안건, 장소, 참고 링크"
          rows={3}
          className="flex w-full resize-y rounded-[6px] border border-[#E5E5E0] bg-white px-3 py-2 text-[14px] leading-6 text-[#111110] shadow-[0_1px_2px_rgba(17,17,16,0.04)] transition-all duration-150 placeholder:text-[#A39E98] hover:border-[#D8D8D2] focus-visible:border-[#084734] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#084734]/20"
        />
      </div>

      {/*
        저장 바 — 폼이 길어 스크롤이 생겨도 요약과 저장 버튼이 항상 보이게 고정한다.
        음수 마진은 DialogContent 의 패딩(모바일은 safe-area 포함)을 그대로 되돌려 전폭으로 깐다.
      */}
      <div
        className={[
          "sticky bottom-0 z-10 flex flex-col gap-2 border-t border-black/[0.06] bg-white/95 pt-3 backdrop-blur",
          "-mx-4 px-4 pb-4 sm:-mx-6 sm:-mb-6 sm:px-6 sm:pb-6",
          "sm:rounded-b-2xl max-sm:rounded-b-[1.25rem]",
          "max-sm:[margin-bottom:calc(-1rem-env(safe-area-inset-bottom))]",
          "max-sm:[margin-left:calc(-1rem-env(safe-area-inset-left))]",
          "max-sm:[margin-right:calc(-1rem-env(safe-area-inset-right))]",
          "max-sm:[padding-bottom:calc(1rem+env(safe-area-inset-bottom))]",
          "max-sm:[padding-left:calc(1rem+env(safe-area-inset-left))]",
          "max-sm:[padding-right:calc(1rem+env(safe-area-inset-right))]",
          "sm:flex-row sm:items-center sm:justify-between",
        ].join(" ")}
      >
        <p className="min-w-0 truncate text-[12px] text-[#615D59]" aria-live="polite">
          {summary || "시작일을 선택하면 일정 요약이 표시됩니다"}
        </p>
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center">
          <Button type="button" variant="outline" size="sm" onClick={onCancel} disabled={loading}>
            취소
          </Button>
          <Button type="submit" size="sm" disabled={loading}>
            {loading ? "저장 중..." : isEdit ? "수정" : "추가"}
          </Button>
        </div>
      </div>
    </form>
  )
}
