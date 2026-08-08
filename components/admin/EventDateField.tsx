"use client"

import { useMemo, useState } from "react"
import { CalendarDays, ChevronLeft, ChevronRight, X } from "lucide-react"

/**
 * 공개 행사 일정 입력 — 두 모드를 한 컴포넌트로 제공한다.
 *
 * - 범위: 지금까지와 동일한 시작/종료 datetime-local 두 칸
 * - 개별: 달력에서 날짜를 띄엄띄엄 클릭해 고르고, 시각은 모든 회차에 공용으로 한 번만 입력
 *
 * 어느 모드든 부모에게는 동일한 계약(datetime-local 문자열 + sessionDates)으로 값을 넘긴다.
 * 개별 모드에서 startsAt/endsAt은 회차의 봉투(첫 회차 시작 ~ 마지막 회차 종료)로 자동 계산된다.
 */
export interface EventScheduleValue {
  /** datetime-local 형식 "YYYY-MM-DDTHH:mm" */
  startsAt: string
  endsAt: string
  /** "YYYY-MM-DD"[] — 비어 있으면 단일 기간 행사 */
  sessionDates: string[]
}

interface EventDateFieldProps {
  value: EventScheduleValue
  onChange: (next: EventScheduleValue) => void
  /** 두 폼의 input 스타일이 달라 주입받는다 */
  inputClassName: string
  labelClassName: string
}

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"]

function pad(value: number): string {
  return String(value).padStart(2, "0")
}

function toDateKey(year: number, month: number, day: number): string {
  return `${year}-${pad(month + 1)}-${pad(day)}`
}

function datePart(localDatetime: string): string {
  return localDatetime.slice(0, 10)
}

function timePart(localDatetime: string): string {
  return localDatetime.slice(11, 16)
}

export default function EventDateField({
  value,
  onChange,
  inputClassName,
  labelClassName,
}: EventDateFieldProps) {
  const [mode, setMode] = useState<"range" | "sessions">(
    value.sessionDates.length > 0 ? "sessions" : "range"
  )

  const todayKey = useMemo(() => {
    const now = new Date()
    return toDateKey(now.getFullYear(), now.getMonth(), now.getDate())
  }, [])

  const [view, setView] = useState(() => {
    const anchor = value.sessionDates[0] ?? datePart(value.startsAt) ?? ""
    if (/^\d{4}-\d{2}-\d{2}$/.test(anchor)) {
      return { year: Number(anchor.slice(0, 4)), month: Number(anchor.slice(5, 7)) - 1 }
    }
    const now = new Date()
    return { year: now.getFullYear(), month: now.getMonth() }
  })

  // 공용 시각은 컴포넌트가 들고 있는다. 봉투에서 되읽기만 하면 시작 시간을 정하기 전에
  // 입력한 종료 시간이 사라지고, 날짜만 골라도 자정으로 확정돼 버린다.
  const [times, setTimes] = useState(() => ({
    start: timePart(value.startsAt),
    end: timePart(value.endsAt),
  }))
  const selected = value.sessionDates

  // 회차/시각이 바뀔 때마다 봉투를 다시 계산해 내보낸다
  function emitSessions(dates: string[], nextStartTime: string, nextEndTime: string) {
    setTimes({ start: nextStartTime, end: nextEndTime })
    const sorted = Array.from(new Set(dates)).sort()

    // 날짜나 시작 시간이 아직 없으면 봉투를 비워 둔다 — 저장 검증("시작일시는 필수")에 걸려야 한다.
    // 고른 날짜는 그대로 들고 있어서 시간을 채우는 순간 되살아난다.
    if (sorted.length === 0 || !nextStartTime) {
      onChange({ startsAt: "", endsAt: "", sessionDates: sorted })
      return
    }

    onChange({
      startsAt: `${sorted[0]}T${nextStartTime}`,
      endsAt: nextEndTime ? `${sorted[sorted.length - 1]}T${nextEndTime}` : "",
      sessionDates: sorted,
    })
  }

  function toggleDate(dateKey: string) {
    const next = selected.includes(dateKey)
      ? selected.filter((d) => d !== dateKey)
      : [...selected, dateKey]
    emitSessions(next, times.start, times.end)
  }

  function switchMode(next: "range" | "sessions") {
    if (next === mode) return
    setMode(next)

    if (next === "sessions") {
      // 이미 시작일이 있으면 그 날을 첫 회차로 옮겨 담는다
      const seed = datePart(value.startsAt)
      if (/^\d{4}-\d{2}-\d{2}$/.test(seed)) {
        setView({ year: Number(seed.slice(0, 4)), month: Number(seed.slice(5, 7)) - 1 })
        emitSessions([seed], times.start, times.end)
      }
      return
    }

    // 개별 → 범위: 봉투는 이미 유효하므로 회차 목록만 비운다
    onChange({ ...value, sessionDates: [] })
  }

  const monthCells = useMemo(() => {
    const firstWeekday = new Date(view.year, view.month, 1).getDay()
    const daysInMonth = new Date(view.year, view.month + 1, 0).getDate()
    const cells: (string | null)[] = Array.from({ length: firstWeekday }, () => null)
    for (let day = 1; day <= daysInMonth; day += 1) {
      cells.push(toDateKey(view.year, view.month, day))
    }
    return cells
  }, [view])

  function shiftMonth(delta: number) {
    setView((prev) => {
      const next = new Date(prev.year, prev.month + delta, 1)
      return { year: next.getFullYear(), month: next.getMonth() }
    })
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-1 rounded-lg border border-[rgba(0,0,0,0.08)] bg-[#F6F5F4] p-0.5">
        {(
          [
            { key: "range" as const, label: "기간" },
            { key: "sessions" as const, label: "개별 날짜" },
          ]
        ).map((option) => (
          <button
            key={option.key}
            type="button"
            onClick={() => switchMode(option.key)}
            aria-pressed={mode === option.key}
            className={`flex-1 rounded-md px-2.5 py-1.5 text-[12px] font-medium transition-colors ${
              mode === option.key
                ? "bg-white text-[#111110] shadow-sm"
                : "text-[#1a1a1a]/45 hover:text-[#111110]"
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>

      {mode === "range" ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className={labelClassName}>시작일시 *</label>
            <input
              type="datetime-local"
              value={value.startsAt}
              onChange={(e) => onChange({ ...value, startsAt: e.target.value, sessionDates: [] })}
              className={inputClassName}
            />
          </div>
          <div>
            <label className={labelClassName}>종료일시</label>
            <input
              type="datetime-local"
              value={value.endsAt}
              onChange={(e) => onChange({ ...value, endsAt: e.target.value, sessionDates: [] })}
              className={inputClassName}
            />
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="rounded-xl border border-[rgba(0,0,0,0.08)] bg-white p-3">
            <div className="mb-2 flex items-center justify-between">
              <button
                type="button"
                onClick={() => shiftMonth(-1)}
                aria-label="이전 달"
                className="rounded-md p-1 text-[#1a1a1a]/40 transition-colors hover:bg-[#F6F5F4] hover:text-[#111110]"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <span className="text-[13px] font-semibold text-[#111110]">
                {view.year}. {pad(view.month + 1)}
              </span>
              <button
                type="button"
                onClick={() => shiftMonth(1)}
                aria-label="다음 달"
                className="rounded-md p-1 text-[#1a1a1a]/40 transition-colors hover:bg-[#F6F5F4] hover:text-[#111110]"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>

            <div className="mb-1 grid grid-cols-7 gap-0.5">
              {WEEKDAYS.map((weekday) => (
                <div
                  key={weekday}
                  className="py-1 text-center text-[10px] font-medium text-[#1a1a1a]/35"
                >
                  {weekday}
                </div>
              ))}
            </div>

            <div className="grid grid-cols-7 gap-0.5">
              {monthCells.map((dateKey, index) => {
                if (!dateKey) return <div key={`blank-${index}`} />
                const isSelected = selected.includes(dateKey)
                const isToday = dateKey === todayKey
                return (
                  <button
                    key={dateKey}
                    type="button"
                    onClick={() => toggleDate(dateKey)}
                    aria-pressed={isSelected}
                    aria-label={`${dateKey}${isSelected ? " 선택 해제" : " 선택"}`}
                    className={`aspect-square rounded-md text-[12px] transition-colors ${
                      isSelected
                        ? "bg-[#084734] font-semibold text-white"
                        : `text-[#111110] hover:bg-[#F6F5F4] ${
                            isToday ? "ring-1 ring-inset ring-[#084734]/30" : ""
                          }`
                    }`}
                  >
                    {Number(dateKey.slice(8, 10))}
                  </button>
                )
              })}
            </div>
          </div>

          {selected.length > 0 ? (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-[11px] font-medium text-[#1a1a1a]/45">
                {selected.length}회
              </span>
              {selected.map((dateKey) => (
                <span
                  key={dateKey}
                  className="inline-flex items-center gap-1 rounded-full border border-[rgba(0,0,0,0.08)] bg-[#ECFDF5] py-0.5 pl-2 pr-1 text-[11px] text-[#084734]"
                >
                  {dateKey.slice(5).replace("-", ". ")}
                  <button
                    type="button"
                    onClick={() => toggleDate(dateKey)}
                    aria-label={`${dateKey} 제거`}
                    className="rounded-full p-0.5 transition-colors hover:bg-[#084734]/10"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </span>
              ))}
              <button
                type="button"
                onClick={() => emitSessions([], times.start, times.end)}
                className="ml-1 text-[11px] text-[#1a1a1a]/35 underline underline-offset-2 transition-colors hover:text-[#111110]"
              >
                모두 지우기
              </button>
            </div>
          ) : (
            <p className="flex items-center gap-1.5 text-[11px] text-[#1a1a1a]/40">
              <CalendarDays className="h-3.5 w-3.5" />
              달력에서 행사가 열리는 날짜를 클릭하세요. 여러 날을 띄엄띄엄 고를 수 있습니다.
            </p>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className={labelClassName}>시작 시간 *</label>
              <input
                type="time"
                value={times.start}
                onChange={(e) => emitSessions(selected, e.target.value, times.end)}
                className={inputClassName}
              />
            </div>
            <div>
              <label className={labelClassName}>종료 시간</label>
              <input
                type="time"
                value={times.end}
                onChange={(e) => emitSessions(selected, times.start, e.target.value)}
                className={inputClassName}
              />
            </div>
          </div>
          <p className="text-[11px] leading-5 text-[#615D59]">
            시간은 선택한 모든 날짜에 똑같이 적용됩니다. 비워두면 회차마다 시작 후 2시간을 종료로 봅니다.
          </p>
        </div>
      )}
    </div>
  )
}
