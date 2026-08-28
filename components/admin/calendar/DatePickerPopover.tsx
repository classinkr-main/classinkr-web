"use client"

/**
 * DatePickerPopover.tsx — 기간 라벨 트리거로 여는 미니 달력 (캘린더 4차 P2)
 *
 * 툴바의 "2026년 8월" 같은 기간 라벨을 눌러서 여는 자족형 팝오버다. 월요일 시작
 * 7열 그리드에 지금 화면이 담고 있는 range 를 연한 배경으로 이어 붙여 하이라이트
 * 한다 — 주 범위를 고를 때 어느 주로 이동하는지 클릭하기 전에 보이는 것이 이
 * 컴포넌트의 핵심 가치다(스펙 P2). 툴바(오케스트레이터)가 그대로 마운트하므로
 * 바깥 클릭·Escape 처리까지 이 파일 안에서 전부 자족한다.
 *
 * 날짜 산술은 lib/admin-calendar/range.ts 의 지정된 순수 함수만 쓴다 — new Date()
 * 로 직접 하루/한 달을 계산하면 KST(UTC+9)에서 로컬 타임존 보정 때문에 하루가
 * 밀리는 고전적인 버그가 난다.
 */
import { useEffect, useMemo, useRef, useState } from "react"
import { ChevronDown, ChevronLeft, ChevronRight } from "lucide-react"

import { addDays, addMonths, getWeekday, isDateString, startOfMonth } from "@/lib/admin-calendar/range"

const WEEKDAYS_MON_FIRST = ["월", "화", "수", "목", "금", "토", "일"]

/**
 * 월요일 시작 6주(42칸) 고정 그리드. 어떤 달이든 앞칸 최대 6 + 최장 31일 = 37칸이라
 * 6주면 항상 넘치지 않고, 행 수를 달마다 4~6으로 가변시키지 않아 이전/다음 달을
 * 넘길 때 팝오버 높이가 들쭉날쭉하지 않는다.
 */
const GRID_WEEKS = 6
const GRID_CELLS = GRID_WEEKS * 7

export interface DatePickerPopoverProps {
  /** 현재 기준일 YYYY-MM-DD */
  anchor: string
  /** 지금 화면이 담고 있는 기간 — 미니 달력에서 하이라이트한다 */
  range: { from: string; to: string }
  todayStr: string
  /** 트리거 버튼에 표시할 문구(= formatRangeLabel 결과) */
  label: string
  onPick: (date: string) => void
  /** 로딩 스피너를 라벨 옆에 붙일지 */
  loading?: boolean
}

/**
 * 그 달 1일이 속한 주의 월요일. range.ts 의 startOfWeek 와 같은 식이지만, 이
 * 파일은 지정된 7개 순수 함수만 쓰기로 돼 있어(P2 스펙) getWeekday+addDays 로
 * 인라인한다: 요일을 "0=월…6=일"로 재정렬한 만큼만 앞으로 물린다.
 */
function mondayGridStart(monthStart: string): string {
  const weekday = getWeekday(monthStart) // 0=일 … 6=토
  const mondayOffset = (weekday + 6) % 7 // 0=월 … 6=일
  return addDays(monthStart, -mondayOffset)
}

function monthLabel(monthStart: string): string {
  const [year, month] = monthStart.split("-")
  return `${year}년 ${Number(month)}월`
}

function dateAriaLabel(date: string): string {
  const [year, month, day] = date.split("-").map(Number)
  return `${year}년 ${month}월 ${day}일로 이동`
}

export function DatePickerPopover(props: DatePickerPopoverProps): React.JSX.Element {
  const { anchor, range, todayStr, label, onPick, loading = false } = props

  const [open, setOpen] = useState(false)
  const [prevOpen, setPrevOpen] = useState(false)
  const [displayMonth, setDisplayMonth] = useState(() =>
    startOfMonth(isDateString(anchor) ? anchor : todayStr)
  )

  const containerRef = useRef<HTMLDivElement | null>(null)
  const panelRef = useRef<HTMLDivElement | null>(null)
  const triggerRef = useRef<HTMLButtonElement | null>(null)

  // 닫힘→열림으로 바뀌는 그 렌더에서만 미니 달력을 현재 기준일의 달로 되돌린다.
  // effect 안에서 setState 하면 프레임 하나가 더 돌아 "열리자마자 지난달이
  // 잠깐 보이는" 깜빡임이 생기므로, React 공식 패턴대로 렌더 중 조건부로 맞춘다.
  if (open !== prevOpen) {
    setPrevOpen(open)
    if (open) {
      setDisplayMonth(startOfMonth(isDateString(anchor) ? anchor : todayStr))
    }
  }

  // 포커스 이동은 DOM 부수효과라 effect 로 남긴다(위 상태 조정과 달리 이건
  // setState 가 아니다). 포커스 트랩까지는 하지 않는다 — 스펙 P2 의 "과설계" 경고.
  useEffect(() => {
    if (!open) return
    panelRef.current?.focus()
  }, [open])

  // 바깥 클릭 · Escape 로 닫기.
  useEffect(() => {
    if (!open) return

    function handlePointerDown(event: MouseEvent) {
      if (containerRef.current?.contains(event.target as Node)) return
      setOpen(false)
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false)
        triggerRef.current?.focus()
      }
    }

    document.addEventListener("mousedown", handlePointerDown)
    document.addEventListener("keydown", handleKeyDown)
    return () => {
      document.removeEventListener("mousedown", handlePointerDown)
      document.removeEventListener("keydown", handleKeyDown)
    }
  }, [open])

  const cells = useMemo(() => {
    const start = mondayGridStart(displayMonth)
    return Array.from({ length: GRID_CELLS }, (_, index) => addDays(start, index))
  }, [displayMonth])

  function handlePick(date: string) {
    onPick(date)
    setOpen(false)
    triggerRef.current?.focus()
  }

  const todayMonthStart = startOfMonth(todayStr)
  const shortcuts = [
    { key: "thisWeek", label: "이번 주", date: todayStr },
    { key: "nextMonth", label: "다음 달", date: addMonths(todayMonthStart, 1) },
    { key: "lastMonth", label: "지난달", date: addMonths(todayMonthStart, -1) },
  ]

  return (
    <div className="relative min-w-0" ref={containerRef}>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((current) => !current)}
        aria-expanded={open}
        aria-haspopup="dialog"
        className="flex min-w-0 items-center gap-1 rounded-lg px-2 py-1 text-[15px] font-semibold tabular-nums text-[#111110] transition-colors hover:bg-[#f0f0ec] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#084734] focus-visible:ring-offset-1"
      >
        <span className="truncate">{label}</span>
        {loading && (
          <span
            aria-hidden="true"
            className="h-3.5 w-3.5 shrink-0 animate-spin rounded-full border-2 border-[#111110]/20 border-t-[#111110]"
          />
        )}
        <ChevronDown
          aria-hidden="true"
          className={`h-3.5 w-3.5 shrink-0 text-[#1a1a1a]/40 transition-transform duration-150 ${
            open ? "rotate-180" : ""
          }`}
        />
      </button>

      {open && (
        <div
          ref={panelRef}
          role="dialog"
          aria-label="날짜 선택"
          tabIndex={-1}
          className="absolute left-0 top-[calc(100%+6px)] z-40 w-[258px] rounded-xl border border-[#e8e8e4] bg-white p-3 shadow-[0_8px_24px_-4px_rgba(17,17,16,0.16)] focus:outline-none"
        >
          <div className="mb-2 flex items-center justify-between">
            <button
              type="button"
              onClick={() => setDisplayMonth((current) => addMonths(current, -1))}
              aria-label="이전 달"
              className="flex h-6 w-6 items-center justify-center rounded-md text-[#1a1a1a]/50 transition-colors hover:bg-[#f0f0ec] hover:text-[#111110]"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
            </button>
            <span className="text-[12px] font-semibold tabular-nums text-[#111110]">
              {monthLabel(displayMonth)}
            </span>
            <button
              type="button"
              onClick={() => setDisplayMonth((current) => addMonths(current, 1))}
              aria-label="다음 달"
              className="flex h-6 w-6 items-center justify-center rounded-md text-[#1a1a1a]/50 transition-colors hover:bg-[#f0f0ec] hover:text-[#111110]"
            >
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>

          <div className="grid grid-cols-7">
            {WEEKDAYS_MON_FIRST.map((day, index) => (
              <div
                key={day}
                className={`py-1 text-center text-[10px] font-medium ${
                  index === 6 ? "text-[#B85C33]" : index === 5 ? "text-[#615D59]" : "text-[#1a1a1a]/40"
                }`}
              >
                {day}
              </div>
            ))}
          </div>

          <div className="grid grid-cols-7 gap-y-0.5">
            {cells.map((date) => {
              const inMonth = date.slice(0, 7) === displayMonth.slice(0, 7)
              const isToday = date === todayStr
              const inRange = date >= range.from && date <= range.to
              const isRangeStart = date === range.from
              const isRangeEnd = date === range.to
              const weekday = getWeekday(date) // 0=일 … 6=토
              const isSun = weekday === 0
              const isSat = weekday === 6
              const day = Number(date.slice(8, 10))

              // 이어 붙인 하이라이트: range 안에서는 배경이 칸마다 끊기지 않고
              // 쭉 이어지되, 시작/끝 칸만 모서리를 둥글게 마감한다.
              const rangeEdgeRounding =
                isRangeStart && isRangeEnd
                  ? "rounded-full"
                  : isRangeStart
                    ? "rounded-l-full"
                    : isRangeEnd
                      ? "rounded-r-full"
                      : ""

              const textTone = isToday
                ? "text-white"
                : isSun
                  ? inMonth
                    ? "text-[#B85C33]"
                    : "text-[#B85C33]/40"
                  : isSat
                    ? inMonth
                      ? "text-[#615D59]"
                      : "text-[#615D59]/40"
                    : inMonth
                      ? "text-[#1a1a1a]/70"
                      : "text-[#1a1a1a]/30"

              return (
                <div
                  key={date}
                  className={`flex h-8 items-center justify-center ${
                    inRange ? `bg-[#f0f0ec] ${rangeEdgeRounding}` : ""
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => handlePick(date)}
                    aria-label={dateAriaLabel(date)}
                    aria-current={isToday ? "date" : undefined}
                    className={`flex h-8 w-8 items-center justify-center rounded-full text-[12px] font-medium tabular-nums transition-colors ${
                      isToday ? "bg-[#111110]" : "hover:bg-[#111110]/10"
                    } ${textTone}`}
                  >
                    {day}
                  </button>
                </div>
              )
            })}
          </div>

          <div className="mt-2.5 flex items-center gap-1.5 border-t border-[#f0f0ec] pt-2.5">
            {shortcuts.map((shortcut) => (
              <button
                key={shortcut.key}
                type="button"
                onClick={() => handlePick(shortcut.date)}
                className="flex-1 rounded-lg border border-[#e8e8e4] px-1.5 py-1 text-center text-[11px] font-medium text-[#1a1a1a]/60 transition-colors hover:border-[#1a1a1a]/25 hover:text-[#111110]"
              >
                {shortcut.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
