"use client"

import { CalendarDays, ChevronLeft, ChevronRight, Columns3, List, Plus, Rows3, Table2 } from "lucide-react"
import type { LucideIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { DatePickerPopover } from "./DatePickerPopover"
import {
  formatRangeLabel,
  TIMELINE_SPANS,
  type CalendarViewId,
  type TimelineSpan,
} from "@/lib/admin-calendar/range"

interface ViewOption {
  value: CalendarViewId
  label: string
  icon: LucideIcon
  hint: string
}

export const VIEW_OPTIONS: ViewOption[] = [
  { value: "month", label: "월", icon: CalendarDays, hint: "한 달 전체를 격자로" },
  { value: "week", label: "주", icon: Columns3, hint: "월~일, 시간축 포함" },
  { value: "assignee", label: "담당자", icon: Rows3, hint: "누가 무엇을 맡는지 한 주" },
  { value: "timeline", label: "타임라인", icon: Table2, hint: "소스별로 나눠 보기 — 주·월·넓게" },
  { value: "agenda", label: "목록", icon: List, hint: "날짜순 목록" },
]

/** 타임라인 범위 세그먼트 라벨. 값의 정의는 range.ts(TIMELINE_SPANS)가 SSOT다. */
const TIMELINE_SPAN_LABELS: Record<TimelineSpan, string> = {
  week: "주",
  month: "월",
  wide: "넓게",
}

interface CalendarToolbarProps {
  view: CalendarViewId
  anchor: string
  loading: boolean
  /**
   * 현재 기간에 그 뷰가 그릴 데이터가 있는지. false 인 뷰는 흐리게 표시한다 —
   * 눌러도 빈 레인만 나오는 뷰가 멀쩡한 얼굴로 서 있으면 고장처럼 읽힌다(2026-08-19).
   * 비활성이 아니라 흐림이다: 눌러서 확인하는 것까지 막지는 않는다.
   */
  viewAvailability?: Partial<Record<CalendarViewId, boolean>>
  /**
   * 월 뷰 밀도(3차 개편, 2026-08-28). "detail"=솔리드 바, "summary"=도트 요약.
   * onDensityChange 가 없으면 토글 자체를 그리지 않는다 — 밀도 개념이 없는 뷰에서까지
   * 죽은 컨트롤이 서 있으면 안 된다.
   */
  density?: "detail" | "summary"
  onDensityChange?: (density: "detail" | "summary") => void
  /**
   * 타임라인이 한 화면에 담는 범위. 8주 고정이 바코드를 만들었기에 고를 수 있게 했다
   * (2026-08-28). onTimelineSpanChange 가 없으면 세그먼트를 그리지 않는다 —
   * 타임라인이 아닌 뷰에서 죽은 컨트롤이 서 있으면 안 된다.
   */
  timelineSpan?: TimelineSpan
  onTimelineSpanChange?: (span: TimelineSpan) => void
  /** 지금 화면이 담고 있는 기간 — 미니 달력이 이 구간을 이어 붙여 하이라이트한다. */
  range: { from: string; to: string }
  todayStr: string
  /** 미니 달력에서 날짜를 고르면 기준일을 그리로 옮긴다. */
  onJump: (date: string) => void
  onViewChange: (view: CalendarViewId) => void
  onStep: (direction: 1 | -1) => void
  onToday: () => void
  onCreate: () => void
}

export function CalendarToolbar({
  view,
  anchor,
  loading,
  viewAvailability,
  density = "detail",
  onDensityChange,
  timelineSpan,
  onTimelineSpanChange,
  range,
  todayStr,
  onJump,
  onViewChange,
  onStep,
  onToday,
  onCreate,
}: CalendarToolbarProps) {
  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-[#e8e8e4] px-3 py-2.5 sm:px-4">
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={() => onStep(-1)}
          aria-label="이전 기간"
          className="flex h-8 w-8 items-center justify-center rounded-lg transition-colors hover:bg-[#f0f0ec]"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={() => onStep(1)}
          aria-label="다음 기간"
          className="flex h-8 w-8 items-center justify-center rounded-lg transition-colors hover:bg-[#f0f0ec]"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={onToday}
          className="ml-1 rounded-lg border border-[#e8e8e4] px-2.5 py-1 text-[11px] font-medium text-[#1a1a1a]/60 transition-colors hover:border-[#1a1a1a]/25 hover:text-[#111110]"
        >
          오늘
        </button>
      </div>

      <div className="flex min-w-0 items-center gap-2">
        <DatePickerPopover
          anchor={anchor}
          range={range}
          todayStr={todayStr}
          label={formatRangeLabel(view, anchor, { timelineSpan })}
          onPick={onJump}
          loading={loading}
        />
      </div>

      {/* 뷰 전환 — 데스크톱은 세그먼트, 모바일은 셀렉트 */}
      <div className="ml-auto flex items-center gap-2">
        {onTimelineSpanChange && (
          <div className="hidden items-center rounded-lg border border-[#e8e8e4] p-0.5 md:flex">
            {TIMELINE_SPANS.map((span) => {
              const active = span === timelineSpan
              return (
                <button
                  key={span}
                  type="button"
                  onClick={() => onTimelineSpanChange(span)}
                  aria-pressed={active}
                  className={`rounded-md px-2.5 py-1 text-[11px] font-medium transition-colors ${
                    active
                      ? "bg-[#111110] text-white"
                      : "text-[#1a1a1a]/50 hover:bg-[#f5f5f2] hover:text-[#111110]"
                  }`}
                >
                  {TIMELINE_SPAN_LABELS[span]}
                </button>
              )
            })}
          </div>
        )}
        {onDensityChange && (
          <div className="hidden items-center rounded-lg border border-[#e8e8e4] p-0.5 md:flex">
            {(
              [
                { value: "detail", label: "자세히" },
                { value: "summary", label: "요약" },
              ] as const
            ).map((option) => {
              const active = option.value === density
              return (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => onDensityChange(option.value)}
                  aria-pressed={active}
                  className={`rounded-md px-2.5 py-1 text-[11px] font-medium transition-colors ${
                    active
                      ? "bg-[#111110] text-white"
                      : "text-[#1a1a1a]/50 hover:bg-[#f5f5f2] hover:text-[#111110]"
                  }`}
                >
                  {option.label}
                </button>
              )
            })}
          </div>
        )}
        <div className="hidden items-center rounded-lg border border-[#e8e8e4] p-0.5 md:flex">
          {VIEW_OPTIONS.map((option) => {
            const Icon = option.icon
            const active = option.value === view
            const available = viewAvailability?.[option.value] ?? true
            return (
              <button
                key={option.value}
                type="button"
                onClick={() => onViewChange(option.value)}
                title={available ? option.hint : `${option.hint} — 이 기간엔 표시할 데이터가 없습니다`}
                aria-pressed={active}
                className={`flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium transition-colors ${
                  active
                    ? "bg-[#111110] text-white"
                    : available
                      ? "text-[#1a1a1a]/50 hover:bg-[#f5f5f2] hover:text-[#111110]"
                      : "text-[#1a1a1a]/25 hover:bg-[#f5f5f2] hover:text-[#1a1a1a]/50"
                }`}
              >
                <Icon className="h-3 w-3" />
                {option.label}
              </button>
            )
          })}
        </div>

        <select
          value={view}
          onChange={(event) => onViewChange(event.target.value as CalendarViewId)}
          aria-label="보기 방식"
          className="rounded-lg border border-[#e8e8e4] bg-white px-2 py-1.5 text-[12px] font-medium text-[#111110] md:hidden"
        >
          {VIEW_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>

        <Button size="sm" onClick={onCreate}>
          <Plus className="mr-1 h-3.5 w-3.5" />
          일정
        </Button>
      </div>
    </div>
  )
}
