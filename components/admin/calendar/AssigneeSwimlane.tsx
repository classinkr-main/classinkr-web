"use client"

import { useMemo } from "react"

import type { CalendarEvent } from "@/lib/calendar-data"
import { buildEventsByDate, groupByAssignee } from "@/lib/admin-calendar/layout"
import { enumerateDates, getWeekday, type CalendarRange } from "@/lib/admin-calendar/range"
import { getTeamMemberColor } from "@/lib/team-member-colors"

import { CalendarEmpty } from "./CalendarEmpty"
import { SolidEventBar } from "./EventChip"
import { UNASSIGNED_LABEL, getAssigneeInitial, getEventSource, sortByTimeOfDay } from "./event-style"

/**
 * 담당자 스윔레인 — 3차 개편(2b×1c 통합안, 2026-08-28)에서 간트 레인(줄 배치+가로 막대)을
 * 폐기하고 날짜 셀 스택으로 바꿨다. 사람 행 × 7일 그리드, 각 셀에 그 날 그 사람 몫의
 * SolidEventBar 를 쌓는다 — assignLanes 의 줄 계산 없이 "셀 하나 = 하루 하나"로 읽는다.
 * 대신 담당자 뷰는 2주에서 1주로 좁아졌다(lib/admin-calendar/range.ts ASSIGNEE_VIEW_DAYS) —
 * 이 밀도(사람마다 여러 줄짜리 카드)로 2주치를 한 화면에 넣으면 다시 요약 문법이 필요해진다.
 */

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"]

/**
 * 담당자가 붙지 않는 소스. 사람 행에 억지로 배정하는 대신 최상단 "공통" 행에 모은다 —
 * 공휴일과 공개 행사는 팀 전체에 걸리는 사실이지 누구의 업무가 아니다.
 */
const SHARED_SOURCES = new Set(["holiday", "event"])

/** "공통" 레인 색 — 특정 팀원이 아니므로 팀원 색상표 밖의 중립 회색을 쓴다. */
const SHARED_LANE_COLOR = "#A39E98"

/** 날짜 셀 하나에 쌓아 보여줄 최대 일정 수. 넘치면 "+N". */
const MAX_EVENTS_PER_CELL = 3

interface AssigneeSwimlaneProps {
  range: CalendarRange
  todayStr: string
  visibleEvents: CalendarEvent[]
  onSelectDate: (date: string) => void
  /** 최초 로드 이후의 배경 새로고침 중인가 — AgendaList와 같은 이유로 거짓 빈 상태를 막는다. */
  refreshing?: boolean
}

interface SwimlaneRow {
  key: string
  label: string
  color: string
  events: CalendarEvent[]
  /** "공통" 레인 전용 — 사람이 아니므로 이니셜 대신 점을 찍는다. */
  useDot: boolean
}

/** 날짜 셀 바탕 — 오늘/주말/평일 세 가지뿐이다(파스텔 틴트 금지, DESIGN.md §1). */
function cellSurface(isToday: boolean, isWeekend: boolean): string {
  if (isToday) return "bg-[#F5FAF7] hover:bg-[#ECFDF5]"
  if (isWeekend) return "bg-[#FCFCFA] hover:bg-[#FAFAF8]"
  return "bg-white hover:bg-[#FAFAF8]"
}

export function AssigneeSwimlane({
  range,
  todayStr,
  visibleEvents,
  onSelectDate,
  refreshing = false,
}: AssigneeSwimlaneProps) {
  const days = useMemo(() => enumerateDates(range.from, range.to), [range.from, range.to])

  const rows = useMemo<SwimlaneRow[]>(() => {
    const shared: CalendarEvent[] = []
    const owned: CalendarEvent[] = []
    for (const event of visibleEvents) {
      if (SHARED_SOURCES.has(getEventSource(event))) shared.push(event)
      else owned.push(event)
    }

    const grouped = groupByAssignee(owned, UNASSIGNED_LABEL)
    const people = Array.from(grouped.entries())
      // 사람 레인은 주간 건수 내림차순. 동수는 ko 정렬. 미지정은 항상 마지막.
      .sort(([aName, aEvents], [bName, bEvents]) => {
        if (aName === UNASSIGNED_LABEL) return 1
        if (bName === UNASSIGNED_LABEL) return -1
        if (aEvents.length !== bEvents.length) return bEvents.length - aEvents.length
        return aName.localeCompare(bName, "ko")
      })
      .map(([name, events]) => ({
        key: name,
        label: name,
        color: getTeamMemberColor(name),
        events,
        // 미지정도 사람이 아니다 — 이니셜("지")을 찍으면 사람으로 오독되므로 공통처럼 점.
        useDot: name === UNASSIGNED_LABEL,
      }))

    return [
      ...(shared.length > 0
        ? [{ key: "__shared__", label: "공통", color: SHARED_LANE_COLOR, events: shared, useDot: true }]
        : []),
      ...people,
    ]
  }, [visibleEvents])

  if (rows.length === 0) {
    if (refreshing) return null
    return <CalendarEmpty message="이 기간에 표시할 담당자가 없습니다" hint="담당자가 지정된 일정이 아직 없습니다" />
  }

  return (
    <div className="overflow-x-auto">
      <div className="min-w-[900px]">
        {/* 날짜 헤더 */}
        <div
          className="sticky top-0 z-10 grid border-b border-[#e8e8e4] bg-[#FCFCFA]"
          style={{ gridTemplateColumns: `180px repeat(${days.length}, minmax(0, 1fr))` }}
        >
          <div className="flex items-center px-3 py-2 text-[11px] font-semibold uppercase tracking-wider text-[#1a1a1a]/35">
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
                className="flex flex-col items-center gap-1 border-l border-[#f0f0ec] py-2 transition-colors hover:bg-[#FAFAF8]"
              >
                <span
                  className={`text-[11px] font-semibold ${
                    weekday === 0 ? "text-[#B85C33]" : weekday === 6 ? "text-[#615D59]" : "text-[#1a1a1a]/35"
                  }`}
                >
                  {WEEKDAYS[weekday]}
                </span>
                <span
                  className={`flex h-5 w-5 items-center justify-center rounded-full text-[11px] font-medium ${
                    isToday
                      ? "bg-[#111110] text-white"
                      : weekday === 0
                        ? "text-[#B85C33]"
                        : weekday === 6
                          ? "text-[#615D59]"
                          : "text-[#111110]"
                  }`}
                >
                  {Number(date.slice(8, 10))}
                </span>
                {isToday && (
                  <span className="rounded-full bg-[#084734] px-1.5 py-[1px] text-[9px] font-semibold leading-none text-white">
                    오늘
                  </span>
                )}
              </button>
            )
          })}
        </div>

        {/* 담당자 행 — 날짜 셀 스택. 멀티데이는 buildEventsByDate가 걸치는 날마다 반복해 넣는다. */}
        {rows.map((row) => {
          const byDate = buildEventsByDate(row.events)

          return (
            <div
              key={row.key}
              className="grid border-b border-[#f0f0ec]"
              style={{ gridTemplateColumns: `180px repeat(${days.length}, minmax(0, 1fr))` }}
            >
              <div className="flex items-center gap-2 px-3 py-2.5">
                <span
                  className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold"
                  style={{ backgroundColor: `${row.color}22`, color: row.color }}
                >
                  {row.useDot ? (
                    <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: row.color }} />
                  ) : (
                    getAssigneeInitial(row.label)
                  )}
                </span>
                <div className="min-w-0">
                  <p className="truncate text-[12px] font-semibold text-[#111110]">{row.label}</p>
                  <p className="text-[10px] text-[#1a1a1a]/40">이 주 {row.events.length}건</p>
                </div>
              </div>

              {days.map((date) => {
                const dayEvents = sortByTimeOfDay(byDate[date] ?? [])
                const shown = dayEvents.slice(0, MAX_EVENTS_PER_CELL)
                const hidden = dayEvents.length - shown.length
                const weekday = getWeekday(date)
                const isToday = date === todayStr
                const isWeekend = weekday === 0 || weekday === 6

                return (
                  <div
                    key={date}
                    onClick={() => onSelectDate(date)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault()
                        onSelectDate(date)
                      }
                    }}
                    role="button"
                    tabIndex={0}
                    aria-label={`${row.label} ${date} 일정 보기`}
                    className={`flex min-h-[52px] cursor-pointer flex-col gap-[3px] border-l border-[#f0f0ec] px-2 py-1.5 transition-colors ${cellSurface(
                      isToday,
                      isWeekend
                    )}`}
                  >
                    {shown.map((event) => (
                      <SolidEventBar
                        key={event.id}
                        event={event}
                        showTime
                        excludeAssignee={row.label}
                        onClick={() => onSelectDate(event.date)}
                      />
                    ))}
                    {hidden > 0 && (
                      <button
                        type="button"
                        onClick={(clickEvent) => {
                          clickEvent.stopPropagation()
                          onSelectDate(date)
                        }}
                        className="w-full rounded-[3px] px-[7px] py-px text-left text-[10px] font-medium text-[#1a1a1a]/40 transition-colors hover:bg-[#f0f0ec] hover:text-[#111110]"
                      >
                        +{hidden}
                      </button>
                    )}
                  </div>
                )
              })}
            </div>
          )
        })}
      </div>
    </div>
  )
}
