"use client"

import type { CalendarEvent } from "@/lib/calendar-data"

import { getEventDotColor, getEventSourceLabel } from "./event-style"

/**
 * 그리드·레인 어디에나 들어가는 한 줄짜리 일정 칩.
 *
 * 색축은 소스 하나뿐이다(2026-08-19 개편): 왼쪽 레일 = 소스 색, 본문은 뉴트럴.
 * 이전에는 유형색 배경·유형색 도트가 소스 레일 위에 겹쳐 한 칩에서 색이 세 번
 * 말을 걸었다 — 유형은 일 상세·목록의 텍스트 라벨로 내려갔다.
 * 파스텔 채움 없이 흰 바탕 + 헤어라인 보더(아웃라인 지향, DESIGN.md §1).
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
      style={{ borderLeftColor: getEventDotColor(event) }}
      className={`flex w-full items-center gap-1 truncate rounded-[4px] border border-[#ecebe7] border-l-[3px] bg-white py-[2px] pl-1.5 pr-1 text-left text-[10px] font-medium text-[#3a3733] ${
        onClick ? "cursor-pointer transition-colors hover:bg-[#fafaf8]" : "cursor-default"
      } ${className}`}
    >
      {showTime && event.time && (
        <span className="shrink-0 text-[9px] tabular-nums text-[#1a1a1a]/40">{event.time}</span>
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
        borderLeftWidth: clippedStart ? 1 : 3,
        borderLeftColor: clippedStart ? "#ecebe7" : getEventDotColor(event),
        borderTopLeftRadius: clippedStart ? 0 : 4,
        borderBottomLeftRadius: clippedStart ? 0 : 4,
        borderTopRightRadius: clippedEnd ? 0 : 4,
        borderBottomRightRadius: clippedEnd ? 0 : 4,
      }}
      className={`flex h-full w-full min-w-0 items-center gap-1 overflow-hidden border border-[#ecebe7] bg-white px-1.5 py-0.5 text-left text-[10px] font-medium text-[#3a3733] ${
        onClick ? "cursor-pointer transition-colors hover:bg-[#fafaf8]" : "cursor-default"
      }`}
    >
      {clippedStart && <span aria-hidden="true" className="shrink-0 opacity-50">‹</span>}
      {showTime && (
        <span className="shrink-0 text-[9px] tabular-nums text-[#1a1a1a]/40">{event.time}</span>
      )}
      <span className="truncate">{event.title}</span>
      {clippedEnd && <span aria-hidden="true" className="ml-auto shrink-0 opacity-50">›</span>}
    </button>
  )
}
