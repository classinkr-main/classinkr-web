"use client"

import type { WeekStripDay } from "@/lib/admin-calendar/insights"
import { getWeekday } from "@/lib/admin-calendar/range"

import { getEventDotColor } from "./event-style"

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"]

/** 한 열에 펼쳐 적는 일정 수. 넘치면 "+N" 한 줄로 접는다. */
const MAX_ROWS_PER_DAY = 3

interface WeekStripProps {
  /** buildWeekStripDays(lib/admin-calendar/insights) 결과 — 보통 7개. */
  days: WeekStripDay[]
  todayStr: string
  /** "8월 24일 (월) – 30일 (일)" — 포맷은 호출부가 만든다. */
  rangeLabel: string
  /** 이 주의 전체 건수(헤더에 찍히는 값). days 합계와 다를 수 있는 게 아니라, 호출부가 정본을 넘긴다. */
  total: number
  onSelectDate: (date: string) => void
}

/**
 * 월 그리드 위에 얹는 "이번 주" 한 줄 — 3차 개편(2b×1c 통합안)의 상단 스트립.
 *
 * 월 뷰는 한 달을 보여주느라 "지금 당장 이번 주에 뭐가 있나"를 눈으로 스캔해야 한다.
 * 그 질문 하나만 떼어 7열로 고정해 둔 띠다. 여기서는 색면(솔리드 바)을 쓰지 않는다 —
 * 아래 그리드가 이미 솔리드로 칠해져 있어서 위아래가 같은 문법이면 어느 쪽이 요약인지
 * 구분되지 않는다. 스트립은 도트 + 제목(뉴트럴)만 쓴다.
 */
export function WeekStrip({ days, todayStr, rangeLabel, total, onSelectDate }: WeekStripProps) {
  if (days.length === 0) return null

  return (
    <div className="border-b border-[#e8e8e4]">
      <div className="flex items-baseline gap-1.5 bg-[#ECFDF5] px-3 py-2">
        <span className="shrink-0 text-[12px] font-semibold text-[#084734]">이번 주</span>
        <span className="truncate text-[12px] text-[#084734]/55">{rangeLabel}</span>
        <span className="shrink-0 text-[12px] text-[#084734]/55">· {total}건</span>
      </div>

      <div className="grid grid-cols-7">
        {days.map((day, index) => {
          const dayNumber = Number(day.date.slice(8, 10))
          const monthNumber = Number(day.date.slice(5, 7))
          const weekday = getWeekday(day.date)
          const isToday = day.date === todayStr
          const isSun = weekday === 0
          const isWeekend = isSun || weekday === 6
          const shown = day.events.slice(0, MAX_ROWS_PER_DAY)
          const hiddenCount = day.events.length - shown.length

          return (
            <div
              key={day.date}
              className={`flex flex-col gap-1.5 p-[10px] ${
                index > 0 ? "border-l border-[#f0f0ec]" : ""
              } ${isToday ? "bg-[#ECFDF5]" : isWeekend ? "bg-[#fafaf8]" : "bg-white"}`}
            >
              <button
                type="button"
                onClick={() => onSelectDate(day.date)}
                aria-label={`${monthNumber}월 ${dayNumber}일 일정 보기`}
                className="flex w-full items-center gap-1 text-left"
              >
                <span
                  className={`flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full text-[12px] font-semibold ${
                    isToday
                      ? "bg-[#111110] text-white"
                      : isSun
                        ? "text-[#B85C33]"
                        : isWeekend
                          ? "text-[#615D59]"
                          : "text-[#1a1a1a]/70"
                  }`}
                >
                  {dayNumber}
                </span>
                <span
                  className={`text-[10px] font-medium ${
                    isSun ? "text-[#B85C33]" : isWeekend ? "text-[#615D59]" : "text-[#1a1a1a]/40"
                  }`}
                >
                  {WEEKDAYS[weekday]}
                </span>
                {day.count > 0 && (
                  <span className="ml-auto shrink-0 text-[10px] tabular-nums text-[#1a1a1a]/30">
                    {day.count}
                  </span>
                )}
              </button>

              <div className="min-h-[40px] space-y-[2px]">
                {shown.map((event) => (
                  <button
                    key={event.id}
                    type="button"
                    onClick={() => onSelectDate(day.date)}
                    title={`${event.time ? `${event.time} ` : ""}${event.title}`}
                    className="flex w-full min-w-0 items-center gap-1.5 rounded-[3px] px-0.5 py-px text-left transition-colors hover:bg-[#111110]/5"
                  >
                    <span
                      aria-hidden="true"
                      className="h-2 w-2 shrink-0 rounded-full"
                      style={{ backgroundColor: getEventDotColor(event) }}
                    />
                    <span className="truncate text-[10px] text-[#3a3733]">{event.title}</span>
                  </button>
                ))}

                {hiddenCount > 0 && (
                  <button
                    type="button"
                    onClick={() => onSelectDate(day.date)}
                    className="w-full rounded-[3px] px-0.5 py-px text-left text-[11px] font-medium text-[#1a1a1a]/40 transition-colors hover:bg-[#111110]/5 hover:text-[#111110]"
                  >
                    +{hiddenCount}
                  </button>
                )}

                {day.events.length === 0 && (
                  <span className="block px-0.5 text-[10px] text-[#1a1a1a]/22">일정 없음</span>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
