/**
 * event-style.ts — 캘린더 이벤트의 색·라벨 단일 진실원
 *
 * 월 그리드·주간·스윔레인·타임라인·목록·일 상세가 전부 같은 색을 써야 한다.
 * 뷰마다 색을 다시 정의하면 같은 일정이 화면마다 다른 색으로 보인다.
 *
 * 색 규칙(DESIGN.md §2):
 *   - 소스는 각자 고정색을 쓴다. 단 "팀원 행사"는 예외로 담당자 고정색을 쓴다 —
 *     그 소스는 "누구 건지"가 소스 단위가 아니라 사람 단위로 구분돼야 하기 때문(회의 2026-07-29).
 *   - 공휴일은 캐논 Danger 레드. 한국 캘린더 관례이기도 하고, 앰버(공개 행사)·
 *     테라코타(파트너)와 색상군이 갈려야 라벨 없이 점만 찍히는 모바일 요약에서 구분된다.
 */
import type { CalendarEvent, EventSource, EventType } from "@/lib/calendar-data"
import { getTeamMemberColor } from "@/lib/team-member-colors"

export interface EventTypeStyle {
  value: EventType
  label: string
  /** 텍스트 색 유틸리티 */
  color: string
  /** 배경 + 테두리 유틸리티 */
  bg: string
  /** 점 배경 유틸리티 */
  dot: string
}

export const EVENT_TYPES: EventTypeStyle[] = [
  { value: "team", label: "팀 일정", color: "text-[#084734]", bg: "bg-[#ECFDF5] border-[#D1FAE5]", dot: "bg-[#084734]" },
  { value: "meeting", label: "회의", color: "text-[#065c41]", bg: "bg-[#D1FAE5] border-[#A7F3D0]", dot: "bg-[#065c41]" },
  { value: "deadline", label: "마감", color: "text-[#B85C33]", bg: "bg-[#FEF3EE] border-[#F6D5C5]", dot: "bg-[#B85C33]" },
  { value: "launch", label: "런칭", color: "text-emerald-700", bg: "bg-emerald-50 border-emerald-200", dot: "bg-emerald-500" },
  { value: "holiday", label: "휴일", color: "text-amber-700", bg: "bg-amber-50 border-amber-200", dot: "bg-amber-400" },
  { value: "other", label: "기타", color: "text-[#615D59]", bg: "bg-[#f0f0ec] border-[#e8e8e4]", dot: "bg-[#A39E98]" },
]

export interface SourceOption {
  value: EventSource
  label: string
  /** 소스 고정색(hex) */
  dot: string
  /** 읽기 전용 소스를 어디서 고치는지 알려주는 안내문 */
  readonlyHelp?: string
  /** 상세 패널의 바깥 링크 라벨 */
  openLabel?: string
}

export const SOURCE_OPTIONS: SourceOption[] = [
  { value: "calendar", label: "팀 일정", dot: "#084734" },
  {
    value: "partner",
    label: "파트너 일정",
    dot: "#B85C33",
    readonlyHelp: "파트너 일정은 파트너 운영 상세에서 수정합니다.",
    openLabel: "파트너 열기",
  },
  {
    value: "event",
    label: "공개 행사",
    dot: "#A8741A",
    readonlyHelp: "공개 행사는 행사 관리에서 수정합니다.",
    openLabel: "행사 관리 열기",
  },
  {
    value: "notion",
    label: "마케팅(노션)",
    dot: "#0E766E",
    readonlyHelp: "마케팅 캘린더는 노션에서 수정합니다.",
    openLabel: "노션에서 열기",
  },
  {
    value: "showroom",
    label: "쇼룸 예약",
    dot: "#5B6470",
    readonlyHelp: "쇼룸 예약은 구글 캘린더에서 수정합니다.",
    openLabel: "구글 캘린더에서 열기",
  },
  {
    value: "team_event",
    label: "팀원 행사",
    dot: "#6D4AA8",
    readonlyHelp: "팀원 행사는 구글 캘린더에서 수정합니다.",
    openLabel: "구글 캘린더에서 열기",
  },
  { value: "holiday", label: "공휴일", dot: "#B43E3E", readonlyHelp: "공휴일은 자동으로 채워집니다." },
]

const SOURCE_BY_VALUE = new Map(SOURCE_OPTIONS.map((option) => [option.value, option]))

export const UNASSIGNED_LABEL = "미지정"

export function getEventSource(event: CalendarEvent): EventSource {
  return event.source ?? "calendar"
}

export function getSourceOption(source: EventSource): SourceOption | undefined {
  return SOURCE_BY_VALUE.get(source)
}

export function getSourceColor(source: EventSource): string {
  return SOURCE_BY_VALUE.get(source)?.dot ?? "#A39E98"
}

export function getTypeStyle(type: EventType): EventTypeStyle {
  return EVENT_TYPES.find((item) => item.value === type) ?? EVENT_TYPES[EVENT_TYPES.length - 1]
}

export function getEventSourceLabel(event: CalendarEvent): string {
  return event.sourceLabel ?? SOURCE_BY_VALUE.get(getEventSource(event))?.label ?? "팀"
}

/** 팀원 행사만 담당자 색, 나머지는 소스 색. (파일 상단 색 규칙 참고) */
export function getEventDotColor(event: CalendarEvent): string {
  const source = getEventSource(event)
  if (source === "team_event") return getTeamMemberColor(event.assignees?.[0])
  return getSourceColor(source)
}

export function getReadonlyHelp(event: CalendarEvent): string {
  return (
    SOURCE_BY_VALUE.get(getEventSource(event))?.readonlyHelp ??
    "외부 소스 일정은 원본에서 수정합니다."
  )
}

export function getOpenLabel(event: CalendarEvent): string {
  return SOURCE_BY_VALUE.get(getEventSource(event))?.openLabel ?? "원본 열기"
}

/**
 * 같은 날짜 안에서 공개 행사를 최상단으로 올리는 안정 정렬 —
 * 회의: "행사가 가장 우선으로 캘린더에 붙여진다."
 * 행사가 아닌 항목끼리는 0을 반환해 기존(날짜·시간·제목) 순서를 보존한다.
 */
export function sortEventFirst(list: CalendarEvent[]): CalendarEvent[] {
  return [...list].sort((a, b) => {
    const aIsEvent = getEventSource(a) === "event"
    const bIsEvent = getEventSource(b) === "event"
    if (aIsEvent === bIsEvent) return 0
    return aIsEvent ? -1 : 1
  })
}

/**
 * 하루 안에서의 표시 순서: 시간 있는 일정 오름차순 → 종일/멀티데이.
 * 일 상세와 목록 뷰가 공유한다.
 */
export function sortByTimeOfDay(list: CalendarEvent[]): CalendarEvent[] {
  return [...list].sort((a, b) => {
    const aTimed = Boolean(a.time)
    const bTimed = Boolean(b.time)
    if (aTimed !== bTimed) return aTimed ? -1 : 1
    if (aTimed && bTimed) return (a.time ?? "").localeCompare(b.time ?? "")
    return 0
  })
}
