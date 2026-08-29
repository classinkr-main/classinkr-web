"use client"

import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react"
import { ChevronLeft, ChevronRight } from "lucide-react"

import {
  WEEKDAY_LABELS,
  addDays,
  buildMonthGrid,
  clampToRange,
  compareIsoDate,
  formatDesiredDateLabel,
  formatMonthLabel,
  getWeekday,
  getYearMonth,
  isDesiredDateSelectable,
  isSameMonth,
  shiftMonth,
  toIsoDate,
  type DesiredDateRange,
  type YearMonth,
} from "@/components/checkout/request-date"

interface Props {
  /** 선택된 날짜('YYYY-MM-DD'). 미선택은 빈 문자열. */
  value: string
  onChange: (iso: string) => void
  /** KST 기준 오늘 — 오늘 표식용. */
  todayIso: string
  minIso: string
  maxIso: string
  /**
   * 범위 안이지만 개별로 선택 불가인 날짜(쇼룸 예약의 주말·공휴일·마감 등). 선택적
   * prop 이라 안 넘기면(undefined) /checkout 의 기존 렌더링과 1픽셀도 다르지 않다.
   */
  disabledIsoDates?: ReadonlySet<string>
  /** 필드 에러 하이라이트 */
  invalid?: boolean
  labelledById?: string
  describedById?: string
}

/**
 * 의존성 없는 경량 월 그리드. 날짜 산술은 전부 request-date.ts 가 맡고
 * 여기서는 렌더와 포커스 이동만 다룬다.
 *
 * 접근성: roving tabindex — 그리드 전체의 탭 정지점은 1개(포커스 날짜)뿐이고
 * 방향키로 날짜를, Home/End 로 주 경계를, PageUp/PageDown 으로 4주를 옮긴다.
 */
export function DesiredDateCalendar({
  value,
  onChange,
  todayIso,
  minIso,
  maxIso,
  disabledIsoDates,
  invalid = false,
  labelledById,
  describedById,
}: Props) {
  const range = useMemo<DesiredDateRange>(
    () => ({ minIso, maxIso, disabledIsoDates }),
    [minIso, maxIso, disabledIsoDates]
  )
  // value 가 막힌 날짜여도 fallback 은 항상 minIso 로 안전하다 — 아래 셀 렌더에서
  // disabledIsoDates 로 막힌 날짜는 native disabled 가 아니라 aria-disabled 로만
  // 표시해 포커스는 유지하므로(포커스는 허용, 선택만 차단 — 방침은 clampToRange 주석
  // 참고) minIso 는 disabledIsoDates 에 들어 있어도 DOM 상 항상 포커스 가능하다.
  const initialFocus = value && isDesiredDateSelectable(value, range) ? value : minIso

  const [visibleMonth, setVisibleMonth] = useState<YearMonth>(() => getYearMonth(initialFocus))
  const [focusedIso, setFocusedIso] = useState<string>(initialFocus)
  // 키보드로 옮겼을 때만 DOM 포커스를 강제한다(마운트 직후 포커스를 낚아채지 않게).
  const shouldRestoreFocus = useRef(false)
  const gridRef = useRef<HTMLDivElement | null>(null)

  // value 는 이 컴포넌트의 onChange 로만 바뀌고(선택 시 focusedIso 도 함께 갱신),
  // 폼 초기화 때는 다이얼로그가 통째로 언마운트된다 — 별도 동기화 이펙트가 필요 없다.
  useEffect(() => {
    if (!shouldRestoreFocus.current) return
    shouldRestoreFocus.current = false
    gridRef.current?.querySelector<HTMLButtonElement>(`[data-iso="${focusedIso}"]`)?.focus()
  }, [focusedIso])

  const moveFocus = useCallback(
    (nextIso: string) => {
      const clamped = clampToRange(nextIso, range)
      shouldRestoreFocus.current = true
      setFocusedIso(clamped)
      if (!isSameMonth(clamped, visibleMonth)) {
        setVisibleMonth(getYearMonth(clamped))
      }
    },
    [range, visibleMonth]
  )

  const firstOfVisibleMonth = toIsoDate(visibleMonth.year, visibleMonth.month, 1)
  // 이전 달에 선택 가능한 날이 하나라도 있는지 = 그 달 마지막 날이 최소일 이상인지.
  const canGoPrev = compareIsoDate(addDays(firstOfVisibleMonth, -1), minIso) >= 0
  const nextMonth = shiftMonth(visibleMonth, 1)
  const canGoNext =
    compareIsoDate(toIsoDate(nextMonth.year, nextMonth.month, 1), maxIso) <= 0

  function goToMonth(delta: number) {
    const target = shiftMonth(visibleMonth, delta)
    // 같은 '일'을 유지하되 말일 차이는 28로 잘라 안전하게 옮긴다.
    const day = Math.min(Number(focusedIso.slice(8, 10)) || 1, 28)
    const clamped = clampToRange(toIsoDate(target.year, target.month, day), range)
    setFocusedIso(clamped)
    setVisibleMonth(getYearMonth(clamped))
  }

  const weeks = useMemo(() => buildMonthGrid(visibleMonth), [visibleMonth])

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    let next: string | null = null

    switch (event.key) {
      case "ArrowLeft":
        next = addDays(focusedIso, -1)
        break
      case "ArrowRight":
        next = addDays(focusedIso, 1)
        break
      case "ArrowUp":
        next = addDays(focusedIso, -7)
        break
      case "ArrowDown":
        next = addDays(focusedIso, 7)
        break
      case "Home":
        next = addDays(focusedIso, -getWeekday(focusedIso))
        break
      case "End":
        next = addDays(focusedIso, 6 - getWeekday(focusedIso))
        break
      case "PageUp":
        next = addDays(focusedIso, -28)
        break
      case "PageDown":
        next = addDays(focusedIso, 28)
        break
      default:
        return
    }

    event.preventDefault()
    moveFocus(next)
  }

  return (
    <div
      className={`rounded-xl border bg-white p-3 ${
        invalid ? "border-[#B43E3E]" : "border-black/[0.08]"
      }`}
    >
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={() => goToMonth(-1)}
          disabled={!canGoPrev}
          aria-label="이전 달"
          className="flex h-9 w-9 items-center justify-center rounded-md text-[#44514A] transition-colors hover:bg-[#F6F5F4] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#084734] disabled:cursor-not-allowed disabled:opacity-30"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>

        <p aria-live="polite" className="text-[13px] font-semibold text-[#111110]">
          {formatMonthLabel(visibleMonth)}
        </p>

        <button
          type="button"
          onClick={() => goToMonth(1)}
          disabled={!canGoNext}
          aria-label="다음 달"
          className="flex h-9 w-9 items-center justify-center rounded-md text-[#44514A] transition-colors hover:bg-[#F6F5F4] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#084734] disabled:cursor-not-allowed disabled:opacity-30"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      <div
        ref={gridRef}
        role="grid"
        aria-labelledby={labelledById}
        aria-describedby={describedById}
        onKeyDown={handleKeyDown}
        className="mt-1"
      >
        <div role="row" className="grid grid-cols-7">
          {WEEKDAY_LABELS.map((label) => (
            <div
              key={label}
              role="columnheader"
              aria-label={`${label}요일`}
              className="py-1.5 text-center text-[11px] font-medium text-[#A39E98]"
            >
              {label}
            </div>
          ))}
        </div>

        {weeks.map((week) => (
          <div role="row" key={week[0].iso} className="grid grid-cols-7">
            {week.map((cell) => {
              const selectable = isDesiredDateSelectable(cell.iso, range)
              // range(min/max)만 보고 disabledIsoDates 는 뺀 판정 — 이 칸이 native
              // disabled 여야 하는지(범위 밖이라 구조적으로 선택 불가)를 가른다.
              const inRange =
                compareIsoDate(cell.iso, minIso) >= 0 && compareIsoDate(cell.iso, maxIso) <= 0
              // 범위 안인데 disabledIsoDates 로 막힌 날짜만 aria-disabled 대상이다.
              // 범위 밖(inRange=false)은 이미 native disabled 라 중복 표시하지 않는다.
              const blockedByDisabledSet = inRange && !selectable
              const selected = value === cell.iso
              const isToday = cell.iso === todayIso
              const isFocusTarget = cell.iso === focusedIso

              return (
                <div role="gridcell" key={cell.iso} aria-selected={selected} className="p-[2px]">
                  <button
                    type="button"
                    data-iso={cell.iso}
                    tabIndex={isFocusTarget ? 0 : -1}
                    // 범위 밖만 native disabled 로 막는다. disabledIsoDates 로 막힌
                    // (범위 안) 날짜는 aria-disabled 로만 알린다 — native disabled 를
                    // 쓰면 그 버튼이 포커스를 받을 수 없어(.focus() 무시) 방향키로
                    // 옮겨가다 막힌 날짜를 만나면 로빙 tabindex 가 거기서 끊긴다.
                    // "포커스는 허용, 선택만 차단" 방침이라 이 둘을 분리했다.
                    disabled={!inRange}
                    aria-disabled={blockedByDisabledSet ? true : undefined}
                    aria-current={isToday ? "date" : undefined}
                    aria-label={formatDesiredDateLabel(cell.iso)}
                    onClick={() => {
                      setFocusedIso(cell.iso)
                      // native disabled 가 아닌 막힌 날짜(disabledIsoDates)는 클릭 이벤트가
                      // 그대로 들어온다 — 여기서 막는다. Enter/Space 로 활성화된 버튼도
                      // 브라우저가 click 으로 바꿔 보내므로 이 한 곳으로 마우스·키보드
                      // 선택을 동시에 막는다.
                      if (!selectable) return
                      onChange(cell.iso)
                    }}
                    className={[
                      // 모바일 터치 타깃을 넉넉히 — 데스크톱에서만 살짝 조인다.
                      "flex h-10 w-full items-center justify-center rounded-md text-[13px] tabular-nums transition-colors sm:h-9",
                      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#084734]",
                      selected
                        ? "bg-[#084734] font-semibold text-white"
                        : selectable
                          ? cell.inMonth
                            ? "text-[#111110] hover:bg-[#F6F5F4]"
                            : "text-[#A39E98] hover:bg-[#F6F5F4]"
                          : "cursor-not-allowed text-[#D5D2CB]",
                      !selected && isToday ? "ring-1 ring-inset ring-[#084734]/35" : "",
                    ].join(" ")}
                  >
                    {cell.day}
                  </button>
                </div>
              )
            })}
          </div>
        ))}
      </div>
    </div>
  )
}
