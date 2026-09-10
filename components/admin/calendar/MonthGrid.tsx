"use client"

import { Plus } from "lucide-react"

import type { CalendarEvent } from "@/lib/calendar-data"
import { getWeekday, toDateString } from "@/lib/admin-calendar/range"

import { SolidEventBar } from "./EventChip"
import { getEventDotColor } from "./event-style"

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"]

/**
 * 데스크톱 셀 하나에 접히지 않고 들어가는 항목 수(솔리드 바·도트 공통). 넘치면 "+N".
 * 4개 + "+N개 더" 한 줄이 128px 셀에 정확히 들어간다.
 */
const MAX_ITEMS_PER_CELL = 4

/**
 * 모바일 셀은 375px 뷰포트에서 폭이 45px 남짓이라 6px 도트 4개 + "+N" 이 넘친다.
 * 데스크톱보다 하나 적게 찍고 나머지를 숫자로 넘긴다 — 기존(3개) 밀도 유지.
 */
const MAX_DOTS_MOBILE = 3

/**
 * 월 그리드가 셀 안을 채우는 방식.
 *  - detail: 솔리드 일정 바(제목·시각·담당자까지 읽힌다). 월 뷰 기본.
 *  - summary: 소스색 도트만(일정이 "있다"는 신호). 레일·스윔레인과 나란히 놓여
 *    월 그리드가 요약 역할만 맡을 때, 또는 셀 폭이 좁을 때.
 * 모바일(<sm)은 density 와 무관하게 항상 도트다 — 셀에 바가 들어가지 않는다.
 */
export type MonthGridDensity = "detail" | "summary"

interface MonthGridProps {
  year: number
  month: number
  todayStr: string
  selectedDate: string | null
  eventsByDate: Record<string, CalendarEvent[]>
  onSelectDate: (date: string | null) => void
  onCreateAt: (date: string) => void
  /** 기본 "detail". 호출부가 안 넘기면 기존 동작(셀 안에 일정 표시)과 같다. */
  density?: MonthGridDensity
}

/** 소스색 도트 행 — 모바일 요약과 summary 밀도가 공유한다. */
function DayDots({
  events,
  max,
  className = "",
}: {
  events: CalendarEvent[]
  max: number
  className?: string
}) {
  const shown = events.slice(0, max)
  const hidden = events.length - shown.length

  return (
    <div className={`flex items-center gap-[3px] ${className}`} aria-hidden="true">
      {shown.map((event) => (
        <span
          key={`dot-${event.id}`}
          className="h-1.5 w-1.5 shrink-0 rounded-full"
          style={{ backgroundColor: getEventDotColor(event) }}
        />
      ))}
      {hidden > 0 && (
        <span className="text-[9px] font-medium leading-none text-[#1a1a1a]/40">+{hidden}</span>
      )}
    </div>
  )
}

/**
 * 셀 바탕 — 오늘/주말/평일 세 가지뿐이다(파스텔 틴트 금지, DESIGN.md §1).
 * 선택 상태는 바탕을 덮지 않고 인셋 링으로 표시한다: 바탕을 또 갈아끼우면
 * "오늘인데 선택됨" 같은 조합에서 오늘 표시가 사라진다.
 */
function cellSurface(isToday: boolean, isWeekend: boolean): string {
  if (isToday) return "bg-[#F5FAF7] hover:bg-[#ECFDF5]"
  if (isWeekend) return "bg-[#FCFCFA] hover:bg-[#FAFAF8]"
  return "bg-white hover:bg-[#FAFAF8]"
}

export function MonthGrid({
  year,
  month,
  todayStr,
  selectedDate,
  eventsByDate,
  onSelectDate,
  onCreateAt,
  density = "detail",
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
          <div
            key={`empty-${index}`}
            className="min-h-[80px] border-b border-r border-[#f0f0ec] bg-[#FCFCFA] sm:min-h-[128px]"
          />
        ))}

        {Array.from({ length: daysInMonth }).map((_, index) => {
          const day = index + 1
          const dateStr = toDateString(year, month, day)
          // buildEventsByDate(lib/admin-calendar/layout.ts)가 멀티데이를 걸치는 날마다
          // 펼쳐 넣으므로, 여기서는 이어짐 계산 없이 그 날의 목록을 그대로 그린다.
          const dayEvents = eventsByDate[dateStr] ?? []
          const isToday = dateStr === todayStr
          const isSelected = dateStr === selectedDate
          const weekday = (firstDay + index) % 7
          const isSun = weekday === 0
          const isWeekend = isSun || weekday === 6
          const hiddenCount = dayEvents.length - MAX_ITEMS_PER_CELL

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
              className={`group relative min-h-[80px] cursor-pointer border-b border-r border-[#f0f0ec] p-1 transition-colors sm:min-h-[128px] sm:p-1.5 ${cellSurface(
                isToday,
                isWeekend
              )} ${isSelected ? "ring-1 ring-inset ring-[#111110]/30" : ""}`}
            >
              <div className="mb-1 flex items-center justify-between">
                <span
                  className={`flex h-[26px] w-[26px] items-center justify-center rounded-full text-[13px] font-semibold transition-colors ${
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

              {/* 모바일: 일정 존재 신호 — 소스색 도트 (바는 sm+ 전용) */}
              {dayEvents.length > 0 && (
                <DayDots events={dayEvents} max={MAX_DOTS_MOBILE} className="px-0.5 sm:hidden" />
              )}

              <div className="hidden overflow-hidden sm:block">
                {density === "summary"
                  ? dayEvents.length > 0 && (
                      <DayDots events={dayEvents} max={MAX_ITEMS_PER_CELL} className="px-0.5 pt-0.5" />
                    )
                  : dayEvents.length > 0 && (
                      <div className="space-y-[3px]">
                        {dayEvents.slice(0, MAX_ITEMS_PER_CELL).map((event) => (
                          <SolidEventBar
                            key={event.id}
                            event={event}
                            showTime
                            onClick={() => onSelectDate(dateStr)}
                          />
                        ))}
                        {hiddenCount > 0 && (
                          <button
                            type="button"
                            onClick={(clickEvent) => {
                              clickEvent.stopPropagation()
                              onSelectDate(dateStr)
                            }}
                            className="w-full rounded-[3px] px-[7px] py-px text-left text-[10px] font-medium text-[#1a1a1a]/40 transition-colors hover:bg-[#f0f0ec] hover:text-[#111110]"
                          >
                            +{hiddenCount}개 더
                          </button>
                        )}
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
