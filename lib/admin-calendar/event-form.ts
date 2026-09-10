/**
 * event-form.ts — 일정 추가/수정 폼의 순수 규칙
 *
 * 폼 컴포넌트는 입력 위젯만 그리고, "무엇이 유효한가 / 무엇이 자동으로 따라오는가"는
 * 전부 여기서 계산한다. 날짜·시간 산술을 컴포넌트 안에 흩뿌리면 종료일이 시작일보다
 * 앞선 채로 저장되거나, 시작일을 옮길 때 종료일만 제자리에 남는 사고가 화면마다
 * 다시 만들어진다.
 *
 * 날짜는 range.ts 와 같은 "YYYY-MM-DD" 문자열 축 위에서만 다룬다 — Date 객체를 로컬
 * 타임존으로 다루면 KST(UTC+9)에서 하루가 밀린다. 시간도 마찬가지로 "HH:mm" 문자열
 * 위에서 분 단위 정수로만 계산한다.
 */
import type { EventType } from "@/lib/calendar-data"

import { addDays, daysBetween, isDateString } from "./range"

export interface EventFormData {
  title: string
  date: string
  endDate: string
  time: string
  endTime: string
  type: EventType
  description: string
  /** 쉼표로 구분된 담당자 원문. 저장 직전에 parseAssignees() 로 배열이 된다. */
  assignees: string
  allDay: boolean
}

export const EMPTY_EVENT_FORM: EventFormData = {
  title: "",
  date: "",
  endDate: "",
  time: "",
  endTime: "",
  type: "team",
  description: "",
  assignees: "",
  allDay: false,
}

/** 폼이 짚어주는 필드별 문제. 비어 있으면 저장 가능. */
export type EventFormIssues = Partial<
  Record<"title" | "date" | "endDate" | "time" | "endTime", string>
>

const TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/
const WEEKDAY_LABELS = ["일", "월", "화", "수", "목", "금", "토"] as const
const MINUTES_PER_DAY = 24 * 60
/** 하루 안에서 표현 가능한 마지막 시각. 자동 계산이 다음 날로 넘어가지 않게 여기서 멈춘다. */
const LAST_MINUTE_OF_DAY = MINUTES_PER_DAY - 1

export function isTimeString(value: string): boolean {
  return TIME_PATTERN.test(value)
}

function toMinutes(time: string): number {
  const [hour, minute] = time.split(":").map(Number)
  return hour * 60 + minute
}

function fromMinutes(total: number): string {
  const clamped = Math.max(0, Math.min(LAST_MINUTE_OF_DAY, Math.round(total)))
  return `${String(Math.floor(clamped / 60)).padStart(2, "0")}:${String(clamped % 60).padStart(2, "0")}`
}

/**
 * "HH:mm" 에 분을 더한다. 자정을 넘기면 23:59 에서 멈춘다 —
 * 종료 시간 자동 계산이 다음 날 새벽으로 넘어가면 같은 날 안에서 역전돼 보인다.
 */
export function addMinutesToTime(time: string, minutes: number): string {
  if (!isTimeString(time)) return ""
  return fromMinutes(toMinutes(time) + minutes)
}

/** 두 시각의 간격(분). 역전이면 음수. */
export function minutesBetweenTimes(from: string, to: string): number {
  if (!isTimeString(from) || !isTimeString(to)) return 0
  return toMinutes(to) - toMinutes(from)
}

/** 90 → "1시간 30분", 45 → "45분", 120 → "2시간" */
export function formatDuration(minutes: number): string {
  if (minutes <= 0) return ""
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  if (hours === 0) return `${rest}분`
  if (rest === 0) return `${hours}시간`
  return `${hours}시간 ${rest}분`
}

export function getWeekdayLabel(date: string): string {
  if (!isDateString(date)) return ""
  // UTC 로 파싱해 UTC 로 읽는다(range.ts 와 같은 규칙).
  return WEEKDAY_LABELS[new Date(`${date}T00:00:00Z`).getUTCDay()]
}

/** "2026-08-21" → "8월 21일 (금)" */
export function formatDateLabel(date: string): string {
  if (!isDateString(date)) return ""
  const [, month, day] = date.split("-").map(Number)
  return `${month}월 ${day}일 (${getWeekdayLabel(date)})`
}

/** 쉼표 구분 원문 → 담당자 배열. 공백 제거하고 중복은 첫 등장만 남긴다. */
export function parseAssignees(raw: string): string[] {
  const seen = new Set<string>()
  const result: string[] = []
  for (const piece of raw.split(",")) {
    const name = piece.trim()
    if (!name || seen.has(name)) continue
    seen.add(name)
    result.push(name)
  }
  return result
}

export function formatAssignees(names: string[]): string {
  return names.join(", ")
}

/** 이미 있으면 빼고 없으면 더한다(칩 토글). 입력 순서를 보존한다. */
export function toggleAssignee(names: string[], name: string): string[] {
  const target = name.trim()
  if (!target) return names
  return names.includes(target) ? names.filter((item) => item !== target) : [...names, target]
}

/**
 * 시작일을 옮길 때 종료일도 같은 간격만큼 따라온다 — 구글 캘린더와 같은 동작.
 * 옮기기 전 범위가 이미 역전돼 있었다면 따라가지 않고 비운다(잘못된 값을 보존할 이유가 없다).
 */
export function shiftEndDate(prevDate: string, prevEndDate: string, nextDate: string): string {
  if (!prevEndDate || !isDateString(prevEndDate) || !isDateString(nextDate)) return prevEndDate
  if (!isDateString(prevDate)) return prevEndDate
  const span = daysBetween(prevDate, prevEndDate)
  if (span < 0) return ""
  return addDays(nextDate, span)
}

/**
 * 저장을 막아야 하는 문제만 담는다. 여기 비어 있으면 서버로 보낼 수 있다.
 * 화면은 필드를 건드린 뒤에만 메시지를 노출해, 폼을 열자마자 빨간 글씨가 뜨지 않게 한다.
 */
export function getFormIssues(form: EventFormData): EventFormIssues {
  const issues: EventFormIssues = {}

  if (!form.title.trim()) issues.title = "제목을 입력해 주세요."

  if (!isDateString(form.date)) {
    issues.date = "시작일을 선택해 주세요."
  }

  if (form.endDate) {
    if (!isDateString(form.endDate)) issues.endDate = "종료일 형식이 올바르지 않습니다."
    else if (isDateString(form.date) && form.endDate < form.date) {
      issues.endDate = "종료일은 시작일과 같거나 이후여야 합니다."
    }
  }

  if (!form.allDay) {
    if (form.time && !isTimeString(form.time)) issues.time = "시작 시간 형식이 올바르지 않습니다."
    if (form.endTime && !isTimeString(form.endTime)) {
      issues.endTime = "종료 시간 형식이 올바르지 않습니다."
    } else if (form.endTime && !form.time) {
      issues.endTime = "시작 시간을 먼저 입력해 주세요."
    } else if (
      isTimeString(form.time) &&
      isTimeString(form.endTime) &&
      // 멀티데이면 18:00 시작 → 09:00 종료가 정상이므로 하루짜리일 때만 본다.
      (!form.endDate || form.endDate === form.date) &&
      form.endTime <= form.time
    ) {
      issues.endTime = "종료 시간은 시작 시간보다 늦어야 합니다."
    }
  }

  return issues
}

export function hasBlockingIssue(issues: EventFormIssues): boolean {
  return Object.keys(issues).length > 0
}

/**
 * 저장 버튼 옆에 붙는 한 줄 요약 — "8월 21일 (금) · 14:00–15:00 (1시간)".
 * 폼을 다 채우기 전에도 지금까지 고른 값이 무엇을 뜻하는지 즉시 읽히게 한다.
 */
export function summarizeSchedule(form: EventFormData): string {
  if (!isDateString(form.date)) return ""

  const start = formatDateLabel(form.date)

  if (isDateString(form.endDate) && form.endDate > form.date) {
    const days = daysBetween(form.date, form.endDate) + 1
    return `${start} → ${formatDateLabel(form.endDate)} · ${days}일간`
  }

  if (form.allDay) return `${start} · 종일`

  if (isTimeString(form.time) && isTimeString(form.endTime) && form.endTime > form.time) {
    const span = formatDuration(minutesBetweenTimes(form.time, form.endTime))
    return `${start} · ${form.time}–${form.endTime}${span ? ` (${span})` : ""}`
  }

  if (isTimeString(form.time)) return `${start} · ${form.time}`

  return `${start} · 시간 미정`
}
