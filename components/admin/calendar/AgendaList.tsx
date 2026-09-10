"use client"

import { useMemo } from "react"
import { Clock, Users } from "lucide-react"

import type { CalendarEvent } from "@/lib/calendar-data"
import { buildEventsByDate } from "@/lib/admin-calendar/layout"
import { enumerateDates, getWeekday, type CalendarRange } from "@/lib/admin-calendar/range"
import { getTeamMemberColor } from "@/lib/team-member-colors"

import { CalendarEmpty } from "./CalendarEmpty"
import {
  getEventDotColor,
  getEventSourceLabel,
  getTypeStyle,
  sortByTimeOfDay,
  sortEventFirst,
} from "./event-style"

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"]

interface AgendaListProps {
  range: CalendarRange
  todayStr: string
  visibleEvents: CalendarEvent[]
  onSelectDate: (date: string) => void
  /**
   * 최초 로드 이후의 배경 새로고침 중인가(기간 이동/뷰 전환 직후, 새 데이터 도착 전).
   * visibleEvents는 아직 이전 기간의 결과라 range와 안 맞아떨어져 0건으로 보일 수 있다 —
   * 그 순간에는 "일정이 없다"고 단정하지 않고 조용히 비워 둔다(거짓 빈 상태 방지).
   */
  refreshing?: boolean
}

/**
 * 날짜별로 쭉 내려가는 목록. 일정이 없는 날은 아예 건너뛴다 —
 * 빈 날까지 그리면 스크롤만 길어지고 "언제 뭐가 있나"가 안 읽힌다.
 * 모바일에서 월 그리드보다 훨씬 쓸모 있다(셀이 좁아 제목이 안 보이므로).
 */
export function AgendaList({ range, todayStr, visibleEvents, onSelectDate, refreshing = false }: AgendaListProps) {
  const groups = useMemo(() => {
    const byDate = buildEventsByDate(visibleEvents)
    return enumerateDates(range.from, range.to)
      .filter((date) => (byDate[date]?.length ?? 0) > 0)
      .map((date) => ({ date, events: sortByTimeOfDay(sortEventFirst(byDate[date])) }))
  }, [visibleEvents, range.from, range.to])

  if (groups.length === 0) {
    if (refreshing) return null
    return <CalendarEmpty message="이 기간에 일정이 없습니다" />
  }

  return (
    <div className="divide-y divide-[#f0f0ec]">
      {groups.map(({ date, events }) => {
        const weekday = getWeekday(date)
        const isToday = date === todayStr
        const isPast = date < todayStr

        return (
          <div key={date} className={`flex gap-3 px-4 py-3 sm:px-5 ${isPast ? "opacity-60" : ""}`}>
            <button
              type="button"
              onClick={() => onSelectDate(date)}
              className="w-12 shrink-0 text-left"
            >
              <span
                className={`flex h-7 w-7 items-center justify-center rounded-full text-[13px] font-semibold ${
                  isToday ? "bg-[#111110] text-white" : "text-[#111110]"
                }`}
              >
                {Number(date.slice(8, 10))}
              </span>
              <span
                className={`ml-1 text-[10px] ${
                  weekday === 0 ? "text-[#B85C33]" : weekday === 6 ? "text-[#615D59]" : "text-[#1a1a1a]/35"
                }`}
              >
                {WEEKDAYS[weekday]}
              </span>
            </button>

            <div className="min-w-0 flex-1 space-y-1.5">
              {events.map((event) => {
                const style = getTypeStyle(event.type)
                return (
                  <button
                    key={event.id}
                    type="button"
                    onClick={() => onSelectDate(event.date)}
                    style={{ boxShadow: `inset 3px 0 0 0 ${getEventDotColor(event)}` }}
                    className="w-full rounded-lg border border-[#f0f0ec] bg-white py-1.5 pl-3 pr-2 text-left transition-colors hover:border-[#1a1a1a]/15 hover:bg-[#fafaf8]"
                  >
                    <div className="flex items-center gap-2">
                      {event.time ? (
                        <span className="shrink-0 text-[11px] tabular-nums text-[#1a1a1a]/45">
                          {event.time}
                        </span>
                      ) : (
                        <span className="shrink-0 text-[11px] text-[#1a1a1a]/30">종일</span>
                      )}
                      <span className="truncate text-[13px] font-medium text-[#111110]">
                        {event.title}
                      </span>
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-1.5">
                      <span className="rounded-full bg-[#f0f0ec] px-2 py-0.5 text-[10px] font-medium text-[#1a1a1a]/50">
                        {getEventSourceLabel(event)}
                      </span>
                      <span className="rounded-full border border-[#e8e8e4] px-2 py-0.5 text-[10px] font-medium text-[#1a1a1a]/50">
                        {style.label}
                      </span>
                      {event.endDate && event.endDate !== event.date && (
                        <span className="inline-flex items-center gap-1 text-[10px] text-[#1a1a1a]/35">
                          <Clock className="h-2.5 w-2.5" />~{event.endDate.slice(5).replace("-", "/")}
                        </span>
                      )}
                      {event.assignees && event.assignees.length > 0 && (
                        <span className="inline-flex items-center gap-1 text-[10px] text-[#1a1a1a]/45">
                          <Users className="h-2.5 w-2.5" />
                          {event.assignees.map((name, index) => (
                            <span key={name} className="inline-flex items-center gap-0.5">
                              <span
                                className="h-1.5 w-1.5 rounded-full"
                                style={{ backgroundColor: getTeamMemberColor(name) }}
                              />
                              {name}
                              {index < (event.assignees?.length ?? 0) - 1 && ","}
                            </span>
                          ))}
                        </span>
                      )}
                    </div>
                  </button>
                )
              })}
            </div>
          </div>
        )
      })}
    </div>
  )
}
