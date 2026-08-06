"use client"

import { CalendarDays, ChevronLeft, ChevronRight, Columns3, List, Plus, Rows3, Table2 } from "lucide-react"
import type { LucideIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { CALENDAR_VIEWS, formatRangeLabel, type CalendarViewId } from "@/lib/admin-calendar/range"

interface ViewOption {
  value: CalendarViewId
  label: string
  icon: LucideIcon
  hint: string
}

export const VIEW_OPTIONS: ViewOption[] = [
  { value: "month", label: "월", icon: CalendarDays, hint: "한 달 전체를 격자로" },
  { value: "week", label: "주", icon: Columns3, hint: "월~일, 시간축 포함" },
  { value: "assignee", label: "담당자", icon: Rows3, hint: "누가 무엇을 맡는지 2주" },
  { value: "timeline", label: "타임라인", icon: Table2, hint: "소스별 8주 기간 겹침" },
  { value: "agenda", label: "목록", icon: List, hint: "날짜순 목록" },
]

interface CalendarToolbarProps {
  view: CalendarViewId
  anchor: string
  loading: boolean
  onViewChange: (view: CalendarViewId) => void
  onStep: (direction: 1 | -1) => void
  onToday: () => void
  onCreate: () => void
}

export function CalendarToolbar({
  view,
  anchor,
  loading,
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
        <h2 className="truncate text-[15px] font-semibold text-[#111110]">
          {formatRangeLabel(view, anchor)}
        </h2>
        {loading && (
          <div className="h-3.5 w-3.5 shrink-0 animate-spin rounded-full border-2 border-[#111110]/20 border-t-[#111110]" />
        )}
      </div>

      {/* 뷰 전환 — 데스크톱은 세그먼트, 모바일은 셀렉트 */}
      <div className="ml-auto flex items-center gap-2">
        <div className="hidden items-center rounded-lg border border-[#e8e8e4] p-0.5 md:flex">
          {VIEW_OPTIONS.map((option) => {
            const Icon = option.icon
            const active = option.value === view
            return (
              <button
                key={option.value}
                type="button"
                onClick={() => onViewChange(option.value)}
                title={option.hint}
                aria-pressed={active}
                className={`flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium transition-colors ${
                  active
                    ? "bg-[#111110] text-white"
                    : "text-[#1a1a1a]/50 hover:bg-[#f5f5f2] hover:text-[#111110]"
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

export { CALENDAR_VIEWS }
