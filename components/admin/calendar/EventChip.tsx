"use client"

import type { CalendarEvent } from "@/lib/calendar-data"

import {
  getEventBadge,
  getEventDotColor,
  getEventSourceLabel,
  getTypeStyle,
} from "./event-style"

/**
 * 그리드·레인 어디에나 들어가는 한 줄짜리 일정 칩.
 *
 * 왼쪽 inset 라인 = 소스 색, 배경·글자 = 유형 색. 두 축을 겹쳐 쓰는 이유는
 * "어디서 온 일정인가"(소스)와 "무슨 성격인가"(유형)가 독립적이기 때문이다.
 */
export function EventChip({
  event,
  onClick,
  showTime = false,
  className = "",
}: {
  event: CalendarEvent
  onClick?: () => void
  showTime?: boolean
  className?: string
}) {
  const style = getTypeStyle(event.type)
  const badge = getEventBadge(event)
  const label = `${event.title}${event.time ? ` ${event.time}` : ""} · ${getEventSourceLabel(event)}`

  return (
    <button
      type="button"
      onClick={
        onClick
          ? (mouseEvent) => {
              mouseEvent.stopPropagation()
              onClick()
            }
          : undefined
      }
      disabled={!onClick}
      title={label}
      aria-label={label}
      style={{ boxShadow: `inset 2px 0 0 0 ${getEventDotColor(event)}` }}
      className={`flex w-full items-center gap-1 truncate rounded border py-0.5 pl-2 pr-1.5 text-left text-[10px] font-medium ${style.bg} ${style.color} ${
        onClick ? "cursor-pointer hover:brightness-95" : "cursor-default"
      } ${className}`}
    >
      <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${style.dot}`} />
      {badge && (
        <span className="rounded bg-white/80 px-1 py-0 text-[9px] font-semibold text-[#111110]/70">
          {badge}
        </span>
      )}
      {showTime && event.time && (
        <span className="shrink-0 tabular-nums opacity-70">{event.time}</span>
      )}
      <span className="truncate">{event.title}</span>
    </button>
  )
}

/** 멀티데이 막대. 기간 밖으로 잘린 쪽은 모서리를 각지게 둬서 이어짐을 표시한다. */
export function EventBar({
  event,
  onClick,
  clippedStart = false,
  clippedEnd = false,
  spanDays = 1,
}: {
  event: CalendarEvent
  onClick?: () => void
  clippedStart?: boolean
  clippedEnd?: boolean
  /** 막대가 차지하는 칸 수. 좁으면 시각을 접고 제목만 남긴다. */
  spanDays?: number
}) {
  const style = getTypeStyle(event.type)
  const label = `${event.title}${event.time ? ` ${event.time}` : ""} · ${getEventSourceLabel(event)}`
  // 하루짜리 막대는 폭이 한 칸(≈40px)뿐이라 시각을 넣으면 제목이 통째로 밀려난다.
  // 시각은 어차피 일 상세에서 읽으므로, 좁을 때는 무엇인지(제목)를 우선한다.
  const showTime = Boolean(event.time) && spanDays >= 2

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!onClick}
      title={label}
      aria-label={label}
      style={{
        backgroundColor: `${getEventDotColor(event)}1F`,
        borderColor: `${getEventDotColor(event)}59`,
        borderLeftWidth: clippedStart ? 0 : 3,
        borderLeftColor: getEventDotColor(event),
        borderTopLeftRadius: clippedStart ? 0 : 4,
        borderBottomLeftRadius: clippedStart ? 0 : 4,
        borderTopRightRadius: clippedEnd ? 0 : 4,
        borderBottomRightRadius: clippedEnd ? 0 : 4,
      }}
      className={`flex h-full w-full min-w-0 items-center gap-1 overflow-hidden border px-1.5 py-0.5 text-left text-[10px] font-medium ${style.color} ${
        onClick ? "cursor-pointer hover:brightness-95" : "cursor-default"
      }`}
    >
      {clippedStart && <span aria-hidden="true" className="shrink-0 opacity-50">‹</span>}
      {showTime && <span className="shrink-0 tabular-nums opacity-70">{event.time}</span>}
      <span className="truncate">{event.title}</span>
      {clippedEnd && <span aria-hidden="true" className="ml-auto shrink-0 opacity-50">›</span>}
    </button>
  )
}
