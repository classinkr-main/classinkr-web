"use client"

import type { CalendarEvent } from "@/lib/calendar-data"

import { getAssigneeInitial, getEventDotColor, getEventSourceLabel } from "./event-style"

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

/**
 * 솔리드 일정 바 — 2026-08-28 3차 개편(2b×1c 통합안)의 칩 문법.
 *
 * 아웃라인 칩(EventChip)과 반대 방향: 배경을 소스색(팀원 행사·compass 다중 표기는
 * getEventDotColor 규칙 그대로)으로 가득 칠하고 텍스트는 흰색이다. "누구·어디 것인지"가
 * 칠해진 면으로 즉시 갈리는 것이 목적. 월 그리드·이번 주 스트립·담당자 스윔레인이 공유한다.
 *
 * 다중 담당자(동행 데모 실측 ~10%): 이니셜 아바타를 최대 2개 겹쳐 찍고 나머지는 +N.
 * 이니셜은 getAssigneeInitial(이름 첫 자) — 성 충돌(김정무·김민재) 때문에 성을 안 쓴다.
 * excludeAssignee 는 스윔레인용 — 자기 레인 사람은 빼고 "같이 가는" 사람만 보여준다.
 */
export function SolidEventBar({
  event,
  onClick,
  showTime = true,
  showAssignees = true,
  excludeAssignee,
  className = "",
}: {
  event: CalendarEvent
  onClick?: () => void
  showTime?: boolean
  /** 담당자 이니셜 아바타 표시 여부 */
  showAssignees?: boolean
  /** 이 이름은 아바타에서 제외한다(스윔레인 자기 행) */
  excludeAssignee?: string
  className?: string
}) {
  const color = getEventDotColor(event)
  const assignees = (event.assignees ?? []).filter((name) => name !== excludeAssignee)
  const shownInitials = showAssignees ? assignees.slice(0, 2) : []
  const extraCount = showAssignees ? assignees.length - shownInitials.length : 0
  const label = `${event.title}${event.time ? ` ${event.time}` : ""} · ${getEventSourceLabel(event)}${
    event.assignees?.length ? ` · ${event.assignees.join(", ")}` : ""
  }`

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
      style={{ backgroundColor: color }}
      className={`flex w-full min-w-0 items-center gap-1 rounded-[3px] px-[7px] py-[2.5px] text-left text-[10.5px] font-medium text-white transition-[filter] ${
        onClick ? "cursor-pointer hover:brightness-110" : "cursor-default"
      } ${className}`}
    >
      {showTime && event.time && (
        <span className="shrink-0 tabular-nums opacity-75">{event.time}</span>
      )}
      <span className="min-w-0 flex-1 truncate">{event.title}</span>
      {shownInitials.length > 0 && (
        <span aria-hidden="true" className="flex shrink-0 items-center">
          {shownInitials.map((name, index) => (
            <span
              key={name}
              className={`flex h-[14px] w-[14px] items-center justify-center rounded-full bg-white/28 text-[9px] font-semibold leading-none ${
                index > 0 ? "-ml-1 ring-1 ring-inset ring-white/40" : ""
              }`}
            >
              {getAssigneeInitial(name)}
            </span>
          ))}
          {extraCount > 0 && (
            <span className="ml-0.5 text-[8.5px] font-semibold opacity-80">+{extraCount}</span>
          )}
        </span>
      )}
    </button>
  )
}
