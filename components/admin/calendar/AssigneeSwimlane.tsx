"use client"

import { useMemo } from "react"

import type { CalendarEvent } from "@/lib/calendar-data"
import { groupByAssignee, layoutLanes } from "@/lib/admin-calendar/layout"
import { enumerateDates, getWeekday, type CalendarRange } from "@/lib/admin-calendar/range"
import { getTeamMemberColor } from "@/lib/team-member-colors"

import { CalendarEmpty } from "./CalendarEmpty"
import { EventBar } from "./EventChip"
import { UNASSIGNED_LABEL, getEventSource } from "./event-style"

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"]
const LANE_HEIGHT_PX = 22
/** 담당자 한 명이 세로로 먹는 최대 줄 수. 사람 행이 화면을 통째로 먹지 않게 한다. */
const MAX_LANES = 5

/**
 * 담당자가 붙지 않는 소스. 사람 행에 억지로 배정하는 대신 최상단 "공통" 행에 모은다 —
 * 공휴일과 공개 행사는 팀 전체에 걸리는 사실이지 누구의 업무가 아니다.
 */
const SHARED_SOURCES = new Set(["holiday", "event"])

interface AssigneeSwimlaneProps {
  range: CalendarRange
  todayStr: string
  visibleEvents: CalendarEvent[]
  onSelectDate: (date: string) => void
}

export function AssigneeSwimlane({
  range,
  todayStr,
  visibleEvents,
  onSelectDate,
}: AssigneeSwimlaneProps) {
  const days = useMemo(() => enumerateDates(range.from, range.to), [range.from, range.to])

  const rows = useMemo(() => {
    const shared: CalendarEvent[] = []
    const owned: CalendarEvent[] = []
    for (const event of visibleEvents) {
      if (SHARED_SOURCES.has(getEventSource(event))) shared.push(event)
      else owned.push(event)
    }

    const grouped = groupByAssignee(owned, UNASSIGNED_LABEL)
    const people = Array.from(grouped.entries())
      // 미지정은 항상 맨 아래 — 사람 행을 먼저 읽게 한다.
      .sort(([a], [b]) => {
        if (a === UNASSIGNED_LABEL) return 1
        if (b === UNASSIGNED_LABEL) return -1
        return a.localeCompare(b, "ko")
      })
      .map(([name, events]) => ({ key: name, label: name, color: getTeamMemberColor(name), events }))

    return [
      ...(shared.length > 0
        ? [{ key: "__shared__", label: "공통", color: "#A39E98", events: shared }]
        : []),
      ...people,
    ]
  }, [visibleEvents])

  if (rows.length === 0) {
    return <CalendarEmpty message="이 기간에 표시할 담당자가 없습니다" hint="담당자가 지정된 일정이 아직 없습니다" />
  }

  return (
    <div className="overflow-x-auto">
      <div className="min-w-[860px]">
        {/* 날짜 헤더 */}
        <div
          className="sticky top-0 z-10 grid border-b border-[#e8e8e4] bg-white"
          style={{ gridTemplateColumns: `104px repeat(${days.length}, minmax(0, 1fr))` }}
        >
          <div className="px-3 py-2 text-[11px] font-semibold uppercase tracking-wider text-[#1a1a1a]/35">
            담당자
          </div>
          {days.map((date) => {
            const weekday = getWeekday(date)
            const isToday = date === todayStr
            return (
              <button
                key={date}
                type="button"
                onClick={() => onSelectDate(date)}
                className={`flex flex-col items-center border-l border-[#f0f0ec] py-1.5 transition-colors hover:bg-[#fafaf8] ${
                  weekday === 0 || weekday === 6 ? "bg-[#fafaf8]" : ""
                }`}
              >
                <span
                  className={`text-[9px] ${
                    weekday === 0 ? "text-[#B85C33]" : weekday === 6 ? "text-[#615D59]" : "text-[#1a1a1a]/35"
                  }`}
                >
                  {WEEKDAYS[weekday]}
                </span>
                <span
                  className={`flex h-5 w-5 items-center justify-center rounded-full text-[11px] font-medium ${
                    isToday ? "bg-[#111110] text-white" : "text-[#111110]"
                  }`}
                >
                  {Number(date.slice(8, 10))}
                </span>
              </button>
            )
          })}
        </div>

        {/* 담당자 행 */}
        {rows.map((row) => {
          const { spans, overflow, lanes } = layoutLanes(row.events, range, MAX_LANES)

          return (
            <div
              key={row.key}
              className="grid border-b border-[#f0f0ec]"
              style={{ gridTemplateColumns: `104px repeat(${days.length}, minmax(0, 1fr))` }}
            >
              <div className="flex items-center gap-1.5 px-3 py-2">
                <span
                  className="h-2 w-2 shrink-0 rounded-full"
                  style={{ backgroundColor: row.color }}
                />
                <span className="truncate text-[12px] font-medium text-[#111110]">{row.label}</span>
                <span className="ml-auto text-[10px] text-[#1a1a1a]/30">{row.events.length}</span>
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
                {/* 날짜 구분선 — 막대 아래 깔린다 */}
                <div
                  className="pointer-events-none absolute inset-0 grid"
                  style={{ gridTemplateColumns: `repeat(${days.length}, minmax(0, 1fr))` }}
                  aria-hidden="true"
                >
                  {days.map((date) => (
                    <div
                      key={date}
                      className={`border-l border-[#f0f0ec] ${
                        date === todayStr ? "bg-[#111110]/[0.04]" : ""
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
