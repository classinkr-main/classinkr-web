"use client"

import { useMemo } from "react"

import type { CalendarEvent, EventSource } from "@/lib/calendar-data"
import { layoutLanes } from "@/lib/admin-calendar/layout"
import { addDays, enumerateDates, type CalendarRange } from "@/lib/admin-calendar/range"

import { CalendarEmpty } from "./CalendarEmpty"
import { EventBar } from "./EventChip"
import { SOURCE_OPTIONS, getEventSource } from "./event-style"

const LANE_HEIGHT_PX = 22
/** 소스 한 줄이 세로로 먹는 최대 줄 수. 넘치면 "+N" 로 접는다. */
const MAX_LANES = 4

interface SourceTimelineProps {
  range: CalendarRange
  todayStr: string
  visibleEvents: CalendarEvent[]
  onSelectDate: (date: string) => void
  /** 최초 로드 이후의 배경 새로고침 중인가 — AgendaList와 같은 이유로 거짓 빈 상태를 막는다. */
  refreshing?: boolean
}

/**
 * 행 = 소스, 열 = 날짜(주 눈금). 캠페인·행사처럼 여러 주에 걸치는 일정이 서로
 * 어떻게 겹치는지 보려는 뷰라 월 그리드보다 넓은 기간을 얕게 본다.
 *
 * 열은 주가 아니라 날(day)로 잡는다 — 막대 시작·끝이 실제 날짜에 붙어야
 * "8월 3일 시작"이 "8월 첫 주"로 뭉개지지 않는다. 눈금만 주 단위로 찍는다.
 */
export function SourceTimeline({
  range,
  todayStr,
  visibleEvents,
  onSelectDate,
  refreshing = false,
}: SourceTimelineProps) {
  const days = useMemo(() => enumerateDates(range.from, range.to), [range.from, range.to])

  const rows = useMemo(() => {
    const grouped = new Map<EventSource, CalendarEvent[]>()
    for (const event of visibleEvents) {
      const source = getEventSource(event)
      const bucket = grouped.get(source)
      if (bucket) bucket.push(event)
      else grouped.set(source, [event])
    }
    // 일정이 하나도 없는 소스 행은 그리지 않는다 — 빈 행이 늘어나면 겹침이 안 읽힌다.
    return SOURCE_OPTIONS.filter((option) => (grouped.get(option.value)?.length ?? 0) > 0).map(
      (option) => ({ option, events: grouped.get(option.value) ?? [] })
    )
  }, [visibleEvents])

  const weekStarts = useMemo(
    () => days.map((date, index) => ({ date, index })).filter(({ index }) => index % 7 === 0),
    [days]
  )

  if (rows.length === 0) {
    if (refreshing) return null
    return <CalendarEmpty message="이 기간에 표시할 일정이 없습니다" />
  }

  return (
    <div className="overflow-x-auto">
      <div className="min-w-[900px]">
        {/* 주 눈금 헤더 */}
        <div
          className="grid border-b border-[#e8e8e4]"
          style={{ gridTemplateColumns: `104px repeat(${days.length}, minmax(0, 1fr))` }}
        >
          <div className="px-3 py-2 text-[11px] font-semibold uppercase tracking-wider text-[#1a1a1a]/35">
            소스
          </div>
          {weekStarts.map(({ date, index }) => (
            <button
              key={date}
              type="button"
              onClick={() => onSelectDate(date)}
              style={{ gridColumn: `${index + 2} / span 7` }}
              className="border-l border-[#e8e8e4] py-2 text-center text-[11px] text-[#1a1a1a]/45 transition-colors hover:bg-[#fafaf8]"
            >
              {Number(date.slice(5, 7))}/{Number(date.slice(8, 10))}
              <span className="ml-1 text-[#1a1a1a]/25">~{Number(addDays(date, 6).slice(8, 10))}일</span>
            </button>
          ))}
        </div>

        {rows.map(({ option, events }) => {
          const { spans, overflow, lanes } = layoutLanes(events, range, MAX_LANES)

          return (
            <div
              key={option.value}
              className="grid border-b border-[#f0f0ec]"
              style={{ gridTemplateColumns: `104px repeat(${days.length}, minmax(0, 1fr))` }}
            >
              <div className="flex items-center gap-1.5 px-3 py-2">
                <span
                  className="h-2 w-2 shrink-0 rounded-full"
                  style={{ backgroundColor: option.dot }}
                />
                <span className="truncate text-[12px] font-medium text-[#111110]">{option.label}</span>
                <span className="ml-auto text-[10px] text-[#1a1a1a]/30">{events.length}</span>
                {overflow.length > 0 && (
                  <span
                    title={`${overflow.length}건이 줄 수 상한(${MAX_LANES})을 넘어 접혔습니다`}
                    className="rounded bg-[#f0f0ec] px-1 text-[9px] font-medium text-[#1a1a1a]/45"
                  >
                    +{overflow.length}
                  </span>
                )}
              </div>

              <div className="relative col-span-full col-start-2 py-1">
                <div
                  className="pointer-events-none absolute inset-0 grid"
                  style={{ gridTemplateColumns: `repeat(${days.length}, minmax(0, 1fr))` }}
                  aria-hidden="true"
                >
                  {days.map((date, index) => (
                    <div
                      key={date}
                      className={`${index % 7 === 0 ? "border-l border-[#e8e8e4]" : ""} ${
                        date === todayStr ? "bg-[#111110]/[0.05]" : ""
                      }`}
                    />
                  ))}
                </div>

                <div
                  className="relative grid gap-0.5"
                  style={{
                    gridTemplateColumns: `repeat(${days.length}, minmax(0, 1fr))`,
                    gridTemplateRows: `repeat(${lanes}, ${LANE_HEIGHT_PX}px)`,
                  }}
                >
                  {spans.map((span) => (
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
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
