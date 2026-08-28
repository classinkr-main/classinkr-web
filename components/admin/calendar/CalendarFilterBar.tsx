"use client"

import { useMemo, type RefObject } from "react"
import { Search, X } from "lucide-react"

import type { CalendarEvent, EventSource } from "@/lib/calendar-data"
import { getTeamMemberColor } from "@/lib/team-member-colors"

import { SOURCE_OPTIONS, getEventSource } from "./event-style"

export interface TeamMemberCount {
  name: string
  count: number
}

/**
 * 범례 = 필터 (2026-08-19 개편).
 *
 * 이전에는 필터바 3단(소스 체크칩 + 담당자 체크칩 + 유형 범례)이 그리드 위에
 * 가로 밴드로 쌓였고, 체크된 칩마다 소스색 틴트가 채워져 "필터가 캘린더보다
 * 화려한" 상태였다. 이제 색이 무엇을 뜻하는지 알려주는 범례 한 줄이 곧 토글이다 —
 * 켜짐 = 실색 도트 + 본문 잉크, 꺼짐 = 빈 도트 + 흐린 텍스트. 채움 틴트는 없다.
 */
function LegendToggle({
  visible,
  label,
  count,
  color,
  onToggle,
}: {
  visible: boolean
  label: string
  count: number
  color: string
  onToggle: () => void
}) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={visible}
      aria-label={`${label} ${visible ? "숨기기" : "표시"}`}
      onClick={onToggle}
      className={`inline-flex items-center gap-1.5 rounded-md px-1.5 py-1 text-[11px] font-medium transition-colors hover:bg-[#f0f0ec] ${
        visible ? "text-[#3a3733]" : "text-[#1a1a1a]/30"
      }`}
    >
      <span
        aria-hidden="true"
        className="h-2 w-2 shrink-0 rounded-full border transition-colors"
        style={
          visible
            ? { backgroundColor: color, borderColor: color }
            : { backgroundColor: "transparent", borderColor: color }
        }
      />
      <span className={visible ? "" : "line-through decoration-[#1a1a1a]/20"}>{label}</span>
      <span className={`tabular-nums ${visible ? "text-[#1a1a1a]/35" : "text-[#1a1a1a]/20"}`}>
        {count}
      </span>
    </button>
  )
}

interface CalendarFilterLineProps {
  events: CalendarEvent[]
  visibleEvents: CalendarEvent[]
  teamMembers: TeamMemberCount[]
  hiddenSources: Set<EventSource>
  hiddenAssignees: Set<string>
  onToggleSource: (source: EventSource) => void
  onToggleAssignee: (name: string) => void
  onShowAll: () => void
  onHideAll: () => void
  /** 조회 중인 기간 안에서만 찾는 검색어. 필터링 자체는 page.tsx가 한다 — 이 컴포넌트는 인풋만 그린다. */
  query: string
  onQueryChange: (next: string) => void
  /** 검색 인풋에 포커스를 걸기 위한 ref (단축키 "/" 가 쓴다) */
  searchInputRef?: RefObject<HTMLInputElement | null>
}

export function CalendarFilterLine({
  events,
  visibleEvents,
  teamMembers,
  hiddenSources,
  hiddenAssignees,
  onToggleSource,
  onToggleAssignee,
  onShowAll,
  onHideAll,
  query,
  onQueryChange,
  searchInputRef,
}: CalendarFilterLineProps) {
  const sourceCounts = useMemo(() => {
    const map: Record<string, number> = {}
    for (const option of SOURCE_OPTIONS) map[option.value] = 0
    for (const event of events) {
      const source = getEventSource(event)
      map[source] = (map[source] ?? 0) + 1
    }
    return map
  }, [events])

  const allVisible = hiddenSources.size === 0 && hiddenAssignees.size === 0

  return (
    <div className="flex flex-wrap items-center gap-x-1 gap-y-1 border-b border-[#f0f0ec] bg-[#fcfcfa] px-2.5 py-1.5">
      {SOURCE_OPTIONS.map((option) => (
        <LegendToggle
          key={option.value}
          visible={!hiddenSources.has(option.value)}
          label={option.label}
          count={sourceCounts[option.value] ?? 0}
          color={option.dot}
          onToggle={() => onToggleSource(option.value)}
        />
      ))}

      {teamMembers.length > 0 && (
        <>
          <span aria-hidden="true" className="mx-1 h-3.5 w-px shrink-0 bg-[#e8e8e4]" />
          {teamMembers.map((member) => (
            <LegendToggle
              key={member.name}
              visible={!hiddenAssignees.has(member.name)}
              label={member.name}
              count={member.count}
              color={getTeamMemberColor(member.name)}
              onToggle={() => onToggleAssignee(member.name)}
            />
          ))}
        </>
      )}

      <span className="ml-auto flex shrink-0 items-center gap-2 pl-2 text-[11px] text-[#1a1a1a]/40">
        <span className="relative flex shrink-0 items-center">
          <Search
            aria-hidden="true"
            className="pointer-events-none absolute left-2 h-3 w-3 text-[#1a1a1a]/35"
          />
          <input
            ref={searchInputRef}
            type="text"
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
            placeholder="이 기간에서 검색"
            aria-label="이 기간에서 검색"
            className="h-7 w-40 rounded-md border border-[#e8e8e4] bg-white pl-6 pr-6 text-[11px] text-[#111110] outline-none placeholder:text-[#1a1a1a]/35 focus:border-[#084734] focus:ring-2 focus:ring-[#084734]/20"
          />
          {query && (
            <button
              type="button"
              onClick={() => onQueryChange("")}
              aria-label="검색어 지우기"
              className="absolute right-1.5 rounded-full p-0.5 text-[#1a1a1a]/35 transition-colors hover:bg-[#f0f0ec] hover:text-[#111110]"
            >
              <X className="h-3 w-3" strokeWidth={2.5} />
            </button>
          )}
        </span>
        <span>
          표시중 <span className="font-semibold text-[#111110]">{visibleEvents.length}</span>
          <span className="text-[#1a1a1a]/30"> / {events.length}</span>
        </span>
        <button
          type="button"
          onClick={allVisible ? onHideAll : onShowAll}
          className="rounded-md px-1.5 py-1 font-medium text-[#1a1a1a]/45 transition-colors hover:bg-[#f0f0ec] hover:text-[#111110]"
        >
          {allVisible ? "모두 해제" : "모두 표시"}
        </button>
      </span>
    </div>
  )
}
