"use client"

import { useMemo } from "react"

import type { CalendarEvent, EventSource } from "@/lib/calendar-data"
import { layoutLanes } from "@/lib/admin-calendar/layout"
import {
  enumerateDates,
  getWeekday,
  type CalendarRange,
  type TimelineSpan,
} from "@/lib/admin-calendar/range"

import { CalendarEmpty } from "./CalendarEmpty"
import { EventBar } from "./EventChip"
import { SOURCE_OPTIONS, getEventSource } from "./event-style"

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"]

/**
 * 범위별 밀도. 4차 개편(2026-08-28)에서 8주 고정 하드코딩
 * (LANE_HEIGHT_PX=22 / MAX_LANES=4)을 이 맵으로 대체했다.
 */
interface TimelineDensity {
  /** 왼쪽 소스 라벨 열 폭(px) */
  sourceColumnPx: number
  /** 하루 열의 최소 폭(px). null 이면 폭을 강제하지 않고 컨테이너를 꽉 채운다. */
  minDayWidthPx: number | null
  /** 소스 한 행이 쓸 수 있는 최대 줄 수. 넘치면 "+N" 으로 접는다. */
  maxLanes: number
  /** 줄 하나의 높이(px) */
  laneHeightPx: number
  /** 헤더 눈금 문법 — 날짜별 열 머리(day) 또는 주 단위 눈금(week) */
  header: "day" | "week"
  /**
   * 하루짜리 막대에도 시각을 넣을 만큼 한 칸이 넓은가.
   * EventBar 는 spanDays 를 "시각을 넣을 폭이 되는가"의 대용치로만 쓴다(EventChip.tsx).
   */
  showTimeOnSingleDay: boolean
}

/**
 * 각 값의 근거:
 *
 * - 소스 열 124px: 가장 긴 소스 라벨이 "마케팅(노션)"(7자, 12px 기준 ≈84px)이고
 *   좌우 패딩 24px + 도트 14px + 건수·접힘 배지 자리가 필요하다. 104px 이던 것을
 *   늘려 "+N" 배지가 라벨을 밀어내지 않게 했다.
 *
 * - week 하루 폭 없음 + min-w-[900px]: 7칸뿐이라 폭을 강제할 필요가 없다.
 *   900px 컨테이너에서 한 칸이 (900-124)/7 ≈ 110px — 하루짜리도 제목과 시각이
 *   다 들어간다. 그래서 showTimeOnSingleDay=true.
 *
 * - month 하루 폭 34px: EventBar 의 크롬(보더 1+1 · 좌측 레일 3 · px-1.5 12 ≈ 17px)에
 *   글자 한 자(12px)와 말줄임이 얹히는 하한. 31일 × 34 + 124 = 1,178px 로
 *   본문 카드에 남는 폭(≈1,330px = 어드민 본문 1,680 − 좌우 패딩 64 − 우측 레일 264 − 간격 20)
 *   안에 가로 스크롤 없이 들어간다.
 *
 * - wide 하루 폭 20px: 글자는 안 들어가는 폭이다. 넓게 보기는 "무엇인지"가 아니라
 *   "어디에 몰려 있나"를 보는 렌즈라 제목 가독성보다 8주(56일)가 한 화면에 들어오는 쪽을
 *   택했다 — 56 × 20 + 124 = 1,244px 로 역시 카드 안에 들어간다.
 *
 * - 레인 상한 12/8/6: 옛 상한 4가 최대 결함이었다. 8주 창(8/24~10/18) 실측에서
 *   MKT 데모일정 71건 중 45건이 이 상한 때문에 화면에 없었다. 상한은 "행 하나가 화면을
 *   통째로 먹는" 것만 막으면 되므로, 담는 기간에 반비례로 풀었다: week 는 실측 주당
 *   총량이 10건 안팎이라 12줄이면 접힘이 사실상 사라지고, month 8줄 × 26px = 208px,
 *   wide 6줄 × 24px = 144px 로 행 높이가 한 화면을 넘지 않는다.
 *
 * - 레인 높이 30/26/24px: EventBar 본문이 10px 글꼴 + py-0.5 라 22px면 글자가 테두리에
 *   닿는다. 담는 기간이 짧을수록(=막대가 길고 글자가 많을수록) 여유를 더 준다.
 */
const TIMELINE_DENSITY: Record<TimelineSpan, TimelineDensity> = {
  week: {
    sourceColumnPx: 124,
    minDayWidthPx: null,
    maxLanes: 12,
    laneHeightPx: 30,
    header: "day",
    showTimeOnSingleDay: true,
  },
  month: {
    sourceColumnPx: 124,
    minDayWidthPx: 34,
    maxLanes: 8,
    laneHeightPx: 26,
    header: "week",
    showTimeOnSingleDay: false,
  },
  wide: {
    sourceColumnPx: 124,
    minDayWidthPx: 20,
    maxLanes: 6,
    laneHeightPx: 24,
    header: "week",
    showTimeOnSingleDay: false,
  },
}

/** week 범위가 컨테이너를 꽉 채울 때 쓰는 하한 — 한 칸 ≈110px 을 보장한다. */
const WEEK_MIN_WIDTH_PX = 900

/** 주 눈금 라벨에 "~N일" 꼬리를 붙일 최소 칸 수. 그보다 좁으면 시작일만 찍는다. */
const WEEK_TICK_SUFFIX_MIN_DAYS = 4

interface WeekTick {
  /** 눈금이 시작하는 날짜 */
  date: string
  /** days 배열에서의 0-기반 인덱스 */
  index: number
  /** 눈금이 덮는 칸 수(월 범위의 첫·마지막 주는 7보다 짧다) */
  days: number
  /** 눈금이 덮는 마지막 날짜 */
  endDate: string
}

interface SourceTimelineProps {
  range: CalendarRange
  todayStr: string
  visibleEvents: CalendarEvent[]
  onSelectDate: (date: string) => void
  /** 최초 로드 이후의 배경 새로고침 중인가 — AgendaList와 같은 이유로 거짓 빈 상태를 막는다. */
  refreshing?: boolean
  /** 담는 기간. 밀도(칸 폭·레인 상한·눈금 문법)를 정한다. 전환 컨트롤은 툴바가 그린다. */
  span: TimelineSpan
}

/**
 * 행 = 소스, 열 = 날짜. 캠페인·행사처럼 여러 날에 걸치는 일정이 서로 어떻게 겹치는지
 * 보려는 뷰다.
 *
 * 열은 주가 아니라 날(day)로 잡는다 — 막대 시작·끝이 실제 날짜에 붙어야
 * "8월 3일 시작"이 "8월 첫 주"로 뭉개지지 않는다. 담는 기간만 range 가 정하고,
 * 이 컴포넌트는 span 으로 밀도를 고른다(TIMELINE_DENSITY).
 *
 * 정직성: 현재 데이터에는 기간형(멀티데이) 일정이 0건이다(2026-08-28 실측). 하루짜리
 * 막대가 짧게 보이는 것이 정상이며, 겹침이 있어 보이게 늘리거나 묶지 않는다.
 */
export function SourceTimeline({
  range,
  todayStr,
  visibleEvents,
  onSelectDate,
  refreshing = false,
  span,
}: SourceTimelineProps) {
  const density = TIMELINE_DENSITY[span]
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

  /**
   * 주 눈금은 인덱스 7칸이 아니라 월요일에서 끊는다 — 월 범위는 1일이 주 중간일 수
   * 있어서, 7칸씩 세면 눈금과 실제 주가 어긋난다. 첫 칸은 짧은 주로 남는다.
   */
  const weekTicks = useMemo(() => {
    const ticks: WeekTick[] = []
    days.forEach((date, index) => {
      const previous = ticks[ticks.length - 1]
      if (!previous || getWeekday(date) === 1) {
        ticks.push({ date, index, days: 1, endDate: date })
        return
      }
      previous.days += 1
      previous.endDate = date
    })
    return ticks
  }, [days])

  if (rows.length === 0) {
    if (refreshing) return null
    return <CalendarEmpty message="이 기간에 표시할 일정이 없습니다" />
  }

  const gridTemplateColumns = `${density.sourceColumnPx}px repeat(${days.length}, minmax(0, 1fr))`
  const minWidthPx =
    density.minDayWidthPx === null
      ? WEEK_MIN_WIDTH_PX
      : density.sourceColumnPx + days.length * density.minDayWidthPx
  // 날짜별 헤더를 쓰는 범위에서만 하루 단위 구분선을 켠다. 20~34px 칸에 매일 선을 그으면
  // 격자가 막대보다 강해진다.
  const showDayDividers = density.header === "day"

  return (
    <div className="overflow-x-auto">
      <div style={{ minWidth: `${minWidthPx}px` }}>
        {/* 헤더 — week 는 날짜별 열 머리(담당자 스윔레인과 같은 문법), 나머지는 주 눈금 */}
        <div
          className="sticky top-0 z-10 grid border-b border-[#e8e8e4] bg-[#FCFCFA]"
          style={{ gridTemplateColumns }}
        >
          <div className="flex items-center px-3 py-2 text-[11px] font-semibold uppercase tracking-wider text-[#1a1a1a]/35">
            소스
          </div>

          {density.header === "day"
            ? days.map((date) => {
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
                        weekday === 0
                          ? "text-[#B85C33]"
                          : weekday === 6
                            ? "text-[#615D59]"
                            : "text-[#1a1a1a]/35"
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
              })
            : weekTicks.map((tick) => {
                const containsToday = todayStr >= tick.date && todayStr <= tick.endDate
                return (
                  <button
                    key={tick.date}
                    type="button"
                    onClick={() => onSelectDate(tick.date)}
                    style={{ gridColumn: `${tick.index + 2} / span ${tick.days}` }}
                    className={`overflow-hidden whitespace-nowrap border-l border-[#e8e8e4] px-1 py-2 text-center text-[11px] transition-colors hover:bg-[#FAFAF8] ${
                      containsToday ? "font-semibold text-[#111110]" : "text-[#1a1a1a]/45"
                    }`}
                  >
                    {Number(tick.date.slice(5, 7))}/{Number(tick.date.slice(8, 10))}
                    {tick.days >= WEEK_TICK_SUFFIX_MIN_DAYS && (
                      <span className={containsToday ? "ml-1 text-[#1a1a1a]/45" : "ml-1 text-[#1a1a1a]/25"}>
                        ~{Number(tick.endDate.slice(8, 10))}일
                      </span>
                    )}
                  </button>
                )
              })}
        </div>

        {rows.map(({ option, events }) => {
          const { spans, overflow, lanes } = layoutLanes(events, range, density.maxLanes)

          return (
            <div
              key={option.value}
              className="grid border-b border-[#f0f0ec]"
              style={{ gridTemplateColumns }}
            >
              <div className="flex items-center gap-1.5 px-3 py-2">
                <span
                  className="h-2 w-2 shrink-0 rounded-full"
                  style={{ backgroundColor: option.dot }}
                />
                <span className="truncate text-[12px] font-medium text-[#111110]">{option.label}</span>
                <span className="ml-auto shrink-0 text-[10px] text-[#1a1a1a]/30">{events.length}</span>
                {overflow.length > 0 && (
                  <span
                    title={`${overflow.length}건이 줄 수 상한(${density.maxLanes})을 넘어 접혔습니다`}
                    className="shrink-0 rounded bg-[#f0f0ec] px-1 text-[9px] font-medium text-[#1a1a1a]/45"
                  >
                    +{overflow.length}
                  </span>
                )}
              </div>

              <div className="relative col-span-full col-start-2 py-2">
                <div
                  className="pointer-events-none absolute inset-0 grid"
                  style={{ gridTemplateColumns: `repeat(${days.length}, minmax(0, 1fr))` }}
                  aria-hidden="true"
                >
                  {days.map((date, index) => {
                    const weekday = getWeekday(date)
                    const isWeekStart = index === 0 || weekday === 1
                    const surface =
                      date === todayStr
                        ? "bg-[#111110]/[0.05]"
                        : weekday === 0 || weekday === 6
                          ? "bg-[#FCFCFA]"
                          : ""
                    const divider = isWeekStart
                      ? "border-l border-[#e8e8e4]"
                      : showDayDividers
                        ? "border-l border-[#f0f0ec]"
                        : ""
                    return <div key={date} className={`${divider} ${surface}`} />
                  })}
                </div>

                {/*
                 * 세로 간격만 gap 으로 준다. 열 gap 을 주면 막대 격자의 칸 폭이 배경 격자보다
                 * 좁아져 막대가 날짜에서 밀린다(넓게 보기 56칸이면 누적 오차가 100px 을 넘는다).
                 * 가로 간격은 래퍼의 px-0.5 가 만든다 — 이웃한 막대 사이 2+2 = 4px 로 gap-1 과 같다.
                 */}
                <div
                  className="relative grid gap-y-1"
                  style={{
                    gridTemplateColumns: `repeat(${days.length}, minmax(0, 1fr))`,
                    gridTemplateRows: `repeat(${lanes}, ${density.laneHeightPx}px)`,
                  }}
                >
                  {spans.map((bar) => {
                    const barDays = bar.endIndex - bar.startIndex + 1
                    return (
                      <div
                        key={bar.item.id}
                        style={{
                          gridColumn: `${bar.startIndex + 1} / span ${barDays}`,
                          gridRow: bar.lane + 1,
                        }}
                        className="min-w-0 px-0.5"
                      >
                        <EventBar
                          event={bar.item}
                          // EventBar 는 spanDays 를 폭 대용치로 삼아 2칸 미만이면 시각을 접는다.
                          // week 범위는 한 칸이 ≈110px 라 하루짜리도 제목+시각이 들어가므로,
                          // 칸 수가 아니라 "시각을 넣을 폭이 된다"는 사실을 전한다.
                          spanDays={density.showTimeOnSingleDay ? Math.max(2, barDays) : barDays}
                          clippedStart={bar.clippedStart}
                          clippedEnd={bar.clippedEnd}
                          onClick={() => onSelectDate(bar.item.date)}
                        />
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
