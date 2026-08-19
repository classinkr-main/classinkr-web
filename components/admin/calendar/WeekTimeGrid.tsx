"use client"

import { useMemo } from "react"

import type { CalendarEvent } from "@/lib/calendar-data"
import { assignLanes, countLanes } from "@/lib/admin-calendar/layout"
import { enumerateDates, getWeekday, type CalendarRange } from "@/lib/admin-calendar/range"

import { EventBar, EventChip } from "./EventChip"
import { getEventDotColor } from "./event-style"

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"]

/** 시간 격자가 담는 범위. 이 밖의 일정은 잘리지 않고 종일 띠 아래 "시간 외" 줄로 내려간다. */
const GRID_START_HOUR = 7
const GRID_END_HOUR = 22
const GRID_MINUTES = (GRID_END_HOUR - GRID_START_HOUR) * 60
const HOUR_ROW_PX = 44

function toMinutes(time: string | undefined): number | null {
  if (!time) return null
  const [hour, minute] = time.split(":").map(Number)
  if (!Number.isInteger(hour) || !Number.isInteger(minute)) return null
  return hour * 60 + minute
}

interface PositionedEvent {
  event: CalendarEvent
  startMinutes: number
  endMinutes: number
  lane: number
  laneCount: number
}

/**
 * 하루 안에서 시간이 겹치는 일정을 좌우로 나눠 놓는다.
 * 막대 배치(layout.ts)와 같은 탐욕 해법이지만 축이 날짜가 아니라 분(minute)이다.
 */
function positionTimedEvents(events: CalendarEvent[]): PositionedEvent[] {
  const timed = events
    .map((event) => {
      const start = toMinutes(event.time)
      if (start === null) return null
      // 종료 시각이 없으면 1시간짜리로 본다 — 구글 캘린더의 기본 동작과 같다.
      const rawEnd = toMinutes(event.endTime)
      const end = rawEnd !== null && rawEnd > start ? rawEnd : start + 60
      return { event, startMinutes: start, endMinutes: end }
    })
    .filter((item): item is { event: CalendarEvent; startMinutes: number; endMinutes: number } =>
      Boolean(item)
    )
    .sort((a, b) => a.startMinutes - b.startMinutes || b.endMinutes - a.endMinutes)

  const laneEnds: number[] = []
  const placed = timed.map((item) => {
    let lane = laneEnds.findIndex((end) => end <= item.startMinutes)
    if (lane === -1) {
      lane = laneEnds.length
      laneEnds.push(item.endMinutes)
    } else {
      laneEnds[lane] = item.endMinutes
    }
    return { ...item, lane }
  })

  return placed.map((item) => ({ ...item, laneCount: Math.max(1, laneEnds.length) }))
}

interface WeekTimeGridProps {
  range: CalendarRange
  todayStr: string
  selectedDate: string | null
  eventsByDate: Record<string, CalendarEvent[]>
  visibleEvents: CalendarEvent[]
  onSelectDate: (date: string) => void
  onCreateAt: (date: string) => void
}

export function WeekTimeGrid({
  range,
  todayStr,
  selectedDate,
  eventsByDate,
  visibleEvents,
  onSelectDate,
  onCreateAt,
}: WeekTimeGridProps) {
  const days = useMemo(() => enumerateDates(range.from, range.to), [range.from, range.to])

  // 종일·멀티데이는 시간 축에 놓을 자리가 없으므로 상단 띠에 막대로 눕힌다.
  const allDaySpans = useMemo(
    () => assignLanes(visibleEvents.filter((event) => !event.time), range),
    [visibleEvents, range]
  )
  const allDayLanes = countLanes(allDaySpans)

  const hours = Array.from({ length: GRID_END_HOUR - GRID_START_HOUR }, (_, i) => GRID_START_HOUR + i)

  return (
    <div className="overflow-x-auto">
      <div className="min-w-[720px]">
        {/* 날짜 헤더 */}
        <div className="grid border-b border-[#e8e8e4]" style={{ gridTemplateColumns: "48px repeat(7, minmax(0, 1fr))" }}>
          <div />
          {days.map((date) => {
            const weekday = getWeekday(date)
            const isToday = date === todayStr
            return (
              <button
                key={date}
                type="button"
                onClick={() => onSelectDate(date)}
                className={`flex flex-col items-center gap-0.5 border-l border-[#f0f0ec] py-2 transition-colors hover:bg-[#fafaf8] ${
                  date === selectedDate ? "bg-[#111110]/5" : ""
                }`}
              >
                <span
                  className={`text-[11px] font-medium ${
                    weekday === 0 ? "text-[#B85C33]" : weekday === 6 ? "text-[#615D59]" : "text-[#1a1a1a]/40"
                  }`}
                >
                  {WEEKDAYS[weekday]}
                </span>
                <span
                  className={`flex h-6 w-6 items-center justify-center rounded-full text-[12px] font-medium ${
                    isToday ? "bg-[#111110] text-white" : "text-[#111110]"
                  }`}
                >
                  {Number(date.slice(8, 10))}
                </span>
              </button>
            )
          })}
        </div>

        {/* 종일 띠 */}
        <div
          className="grid border-b border-[#e8e8e4] bg-[#fafaf8]"
          style={{ gridTemplateColumns: "48px repeat(7, minmax(0, 1fr))" }}
        >
          <div className="flex items-start justify-end py-1.5 pr-1.5 text-[10px] text-[#1a1a1a]/35">종일</div>
          <div className="relative col-span-7 py-1.5" style={{ minHeight: 26 }}>
            {allDayLanes === 0 ? (
              <div className="px-2 text-[11px] text-[#1a1a1a]/25">종일 일정 없음</div>
            ) : (
              <div
                className="grid gap-0.5"
                style={{
                  gridTemplateColumns: "repeat(7, minmax(0, 1fr))",
                  gridTemplateRows: `repeat(${allDayLanes}, 20px)`,
                }}
              >
                {allDaySpans.map((span) => (
                  <div
                    key={span.item.id}
                    style={{
                      gridColumn: `${span.startIndex + 1} / span ${span.endIndex - span.startIndex + 1}`,
                      gridRow: span.lane + 1,
                    }}
                    className="min-w-0 px-0.5"
                  >
                    <EventBar
                      event={span.item}
                      spanDays={span.endIndex - span.startIndex + 1}
                      clippedStart={span.clippedStart}
                      clippedEnd={span.clippedEnd}
                      onClick={() => onSelectDate(span.item.date)}
                    />
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* 시간 격자 */}
        <div className="grid" style={{ gridTemplateColumns: "48px repeat(7, minmax(0, 1fr))" }}>
          <div>
            {hours.map((hour) => (
              <div
                key={hour}
                style={{ height: HOUR_ROW_PX }}
                className="relative border-b border-[#f0f0ec] pr-1.5 text-right text-[10px] text-[#1a1a1a]/35"
              >
                <span className="absolute right-1.5 -top-1.5 bg-white px-0.5">{hour}시</span>
              </div>
            ))}
          </div>

          {days.map((date) => {
            const dayEvents = eventsByDate[date] ?? []
            const positioned = positionTimedEvents(dayEvents)
            // 격자 밖(새벽·심야) 일정은 위치를 속이지 않고 따로 알린다.
            const isOutside = (item: PositionedEvent) =>
              item.endMinutes <= GRID_START_HOUR * 60 || item.startMinutes >= GRID_END_HOUR * 60
            const outsideGrid = positioned.filter(isOutside)

            return (
              <div
                key={date}
                onDoubleClick={() => onCreateAt(date)}
                className={`relative border-l border-[#f0f0ec] ${date === selectedDate ? "bg-[#111110]/[0.03]" : ""}`}
              >
                {hours.map((hour) => (
                  <div key={hour} style={{ height: HOUR_ROW_PX }} className="border-b border-[#f0f0ec]" />
                ))}

                {positioned
                  .filter((item) => !isOutside(item))
                  .map((item) => {
                    const top = ((Math.max(item.startMinutes, GRID_START_HOUR * 60) - GRID_START_HOUR * 60) / GRID_MINUTES) * 100
                    const bottom = ((Math.min(item.endMinutes, GRID_END_HOUR * 60) - GRID_START_HOUR * 60) / GRID_MINUTES) * 100
                    return (
                      <button
                        key={item.event.id}
                        type="button"
                        onClick={() => onSelectDate(date)}
                        title={`${item.event.time} ${item.event.title}`}
                        style={{
                          top: `${top}%`,
                          height: `${Math.max(bottom - top, 2.5)}%`,
                          left: `${(item.lane / item.laneCount) * 100}%`,
                          width: `${(1 / item.laneCount) * 100}%`,
                          borderLeftColor: getEventDotColor(item.event),
                        }}
                        className="absolute overflow-hidden rounded-r-[3px] border border-[#ecebe7] border-l-[3px] bg-white px-1 py-0.5 text-left text-[10px] font-medium leading-tight text-[#3a3733] transition-colors hover:bg-[#fafaf8]"
                      >
                        <span className="block truncate tabular-nums opacity-70">{item.event.time}</span>
                        <span className="block truncate">{item.event.title}</span>
                      </button>
                    )
                  })}

                {outsideGrid.length > 0 && (
                  <div className="absolute inset-x-0 bottom-0 space-y-0.5 border-t border-dashed border-[#e8e8e4] bg-white/90 p-0.5">
                    <p className="px-1 text-[9px] text-[#1a1a1a]/35">시간 외</p>
                    {outsideGrid.map((item) => (
                      <EventChip
                        key={item.event.id}
                        event={item.event}
                        showTime
                        onClick={() => onSelectDate(date)}
                      />
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
