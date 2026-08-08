"use client"

import { Plus } from "lucide-react"

import type { CalendarEvent } from "@/lib/calendar-data"
import { getWeekday, toDateString } from "@/lib/admin-calendar/range"

import { EventChip } from "./EventChip"
import { getEventDotColor } from "./event-style"

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"]

/** 셀 하나에 접히지 않고 들어가는 칩 수. 넘치면 "+N개 더". */
const MAX_CHIPS_PER_CELL = 3

interface MonthGridProps {
  year: number
  month: number
  todayStr: string
  selectedDate: string | null
  eventsByDate: Record<string, CalendarEvent[]>
  onSelectDate: (date: string | null) => void
  onCreateAt: (date: string) => void
}

export function MonthGrid({
  year,
  month,
  todayStr,
  selectedDate,
  eventsByDate,
  onSelectDate,
  onCreateAt,
}: MonthGridProps) {
  const firstDay = getWeekday(toDateString(year, month, 1))
  const daysInMonth = new Date(year, month, 0).getDate()
  const monthLabel = `${year}년 ${month}월`

  return (
    <div>
      <div className="grid grid-cols-7 border-b border-[#e8e8e4]">
        {WEEKDAYS.map((day, index) => (
          <div
            key={day}
            className={`py-2.5 text-center text-[11px] font-medium ${
              index === 0 ? "text-[#B85C33]" : index === 6 ? "text-[#615D59]" : "text-[#1a1a1a]/40"
            }`}
          >
            {day}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7">
        {Array.from({ length: firstDay }).map((_, index) => (
          <div key={`empty-${index}`} className="h-20 border-b border-r border-[#f0f0ec] sm:h-24" />
        ))}

        {Array.from({ length: daysInMonth }).map((_, index) => {
          const day = index + 1
          const dateStr = toDateString(year, month, day)
          const dayEvents = eventsByDate[dateStr] ?? []
          const isToday = dateStr === todayStr
          const isSelected = dateStr === selectedDate
          const weekday = (firstDay + index) % 7
          const isSun = weekday === 0
          const isWeekend = isSun || weekday === 6

          return (
            <div
              key={day}
              onClick={() => onSelectDate(isSelected ? null : dateStr)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault()
                  onSelectDate(isSelected ? null : dateStr)
                }
              }}
              role="button"
              tabIndex={0}
              aria-label={`${monthLabel} ${day}일 일정 보기`}
              className={`group relative h-20 cursor-pointer border-b border-r border-[#f0f0ec] p-1 transition-colors sm:h-24 sm:p-1.5 ${
                isSelected ? "bg-[#111110]/5" : "hover:bg-[#fafaf8]"
              }`}
            >
              <div className="mb-1 flex items-center justify-between">
                <span
                  className={`flex h-6 w-6 items-center justify-center rounded-full text-[12px] font-medium transition-colors ${
                    isToday
                      ? "bg-[#111110] text-white"
                      : isSun
                        ? "text-[#B85C33]"
                        : isWeekend
                          ? "text-[#615D59]"
                          : "text-[#1a1a1a]/70"
                  }`}
                >
                  {day}
                </span>
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation()
                    onCreateAt(dateStr)
                  }}
                  aria-label={`${monthLabel} ${day}일에 일정 추가`}
                  className="flex h-5 w-5 items-center justify-center rounded text-[#1a1a1a]/30 opacity-100 transition-all hover:bg-[#e8e8e4] hover:text-[#111110] sm:opacity-0 sm:group-hover:opacity-100"
                >
                  <Plus className="h-3 w-3" />
                </button>
              </div>

              {/* 모바일: 일정 존재 신호 — 소스색 도트 최대 3개 + 초과 개수 (칩은 sm+ 전용) */}
              {dayEvents.length > 0 && (
                <div className="flex items-center gap-0.5 px-0.5 sm:hidden" aria-hidden="true">
                  {dayEvents.slice(0, MAX_CHIPS_PER_CELL).map((event) => (
                    <span
                      key={`dot-${event.id}`}
                      className="h-1.5 w-1.5 shrink-0 rounded-full"
                      style={{ backgroundColor: getEventDotColor(event) }}
                    />
                  ))}
                  {dayEvents.length > MAX_CHIPS_PER_CELL && (
                    <span className="text-[9px] font-medium leading-none text-[#1a1a1a]/40">
                      +{dayEvents.length - MAX_CHIPS_PER_CELL}
                    </span>
                  )}
                </div>
              )}

              <div className="hidden space-y-0.5 overflow-hidden sm:block">
                {dayEvents.slice(0, MAX_CHIPS_PER_CELL).map((event) => (
                  <EventChip key={event.id} event={event} onClick={() => onSelectDate(dateStr)} />
                ))}
                {dayEvents.length > MAX_CHIPS_PER_CELL && (
                  <div className="px-1.5 text-[10px] text-[#1a1a1a]/40">
                    +{dayEvents.length - MAX_CHIPS_PER_CELL}개 더
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
