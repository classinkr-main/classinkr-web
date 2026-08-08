"use client"

import Link from "next/link"
import { Fragment, useMemo } from "react"
import { ArrowUpRight, Check } from "lucide-react"

import type { CalendarEvent, EventSource } from "@/lib/calendar-data"
import { getTeamMemberColor } from "@/lib/team-member-colors"

import { EVENT_TYPES, SOURCE_OPTIONS, getEventSource } from "./event-style"

function CheckChip({
  checked,
  label,
  count,
  onToggle,
  dot,
  avatar,
  dim,
}: {
  checked: boolean
  label: string
  count?: number
  onToggle: () => void
  dot?: string
  avatar?: boolean
  dim?: boolean
}) {
  // 소스/그룹 색(dot) — 체크 시 배경·테두리·체크박스를 해당 색 틴트로. 색 없으면 기본 그린.
  const accent = dot
  const tinted = checked && Boolean(accent)

  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      aria-label={label}
      onClick={onToggle}
      style={
        tinted ? { backgroundColor: `${accent}14`, borderColor: `${accent}59`, color: accent } : undefined
      }
      className={`inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[11px] font-medium transition-colors ${
        dim ? "opacity-45" : ""
      } ${
        checked
          ? tinted
            ? ""
            : "border-[#084734]/25 bg-[#ECFDF5] text-[#084734]"
          : "border-[#e8e8e4] bg-white text-[#1a1a1a]/45 hover:border-[#1a1a1a]/20 hover:text-[#111110]"
      }`}
    >
      <span
        style={tinted ? { backgroundColor: accent, borderColor: accent, color: "#fff" } : undefined}
        className={`flex h-3 w-3 items-center justify-center rounded-[3px] border transition-colors ${
          checked ? (tinted ? "" : "border-[#084734] bg-[#084734] text-white") : "border-[#c9c7c2] bg-white"
        }`}
      >
        {checked && <Check className="h-2 w-2" strokeWidth={3.5} />}
      </span>
      {dot && !checked && (
        <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: dot }} />
      )}
      {avatar && (
        <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-[#f0f0ec] text-[9px] font-semibold text-[#615D59]">
          {label.charAt(0)}
        </span>
      )}
      <span>{label}</span>
      {typeof count === "number" && (
        <span
          style={tinted ? { color: accent, opacity: 0.6 } : undefined}
          className={tinted ? "" : checked ? "text-[#084734]/55" : "text-[#1a1a1a]/30"}
        >
          {count}
        </span>
      )}
    </button>
  )
}

export interface TeamMemberCount {
  name: string
  count: number
}

interface CalendarFilterBarProps {
  events: CalendarEvent[]
  visibleEvents: CalendarEvent[]
  teamMembers: TeamMemberCount[]
  hiddenSources: Set<EventSource>
  hiddenAssignees: Set<string>
  onToggleSource: (source: EventSource) => void
  onToggleAssignee: (name: string) => void
  onSetAllSources: (visible: boolean) => void
  onSetAllAssignees: (visible: boolean) => void
}

export function CalendarFilterBar({
  events,
  visibleEvents,
  teamMembers,
  hiddenSources,
  hiddenAssignees,
  onToggleSource,
  onToggleAssignee,
  onSetAllSources,
  onSetAllAssignees,
}: CalendarFilterBarProps) {
  const sourceCounts = useMemo(() => {
    const map: Record<string, number> = {}
    for (const option of SOURCE_OPTIONS) map[option.value] = 0
    for (const event of events) {
      const source = getEventSource(event)
      map[source] = (map[source] ?? 0) + 1
    }
    return map
  }, [events])

  const allSourcesVisible = hiddenSources.size === 0
  const allAssigneesVisible = teamMembers.every((member) => !hiddenAssignees.has(member.name))
  const assigneeSourcesVisible = !hiddenSources.has("team_event")

  return (
    <div className="overflow-hidden rounded-2xl border border-[#e8e8e4] bg-white">
      {/* 소스 필터 */}
      <div className="flex flex-wrap items-center gap-1.5 px-4 py-2.5">
        <span className="mr-1 shrink-0 text-[11px] font-semibold uppercase tracking-wider text-[#1a1a1a]/35">
          소스
        </span>
        {SOURCE_OPTIONS.map((option) => (
          <Fragment key={option.value}>
            <CheckChip
              checked={!hiddenSources.has(option.value)}
              label={option.label}
              count={sourceCounts[option.value] ?? 0}
              onToggle={() => onToggleSource(option.value)}
              dot={option.dot}
            />
            {option.value === "event" && (
              <Link
                href="/admin/events"
                title="공개 행사 관리로 이동"
                className="inline-flex items-center gap-0.5 rounded-md px-1.5 py-1 text-[10px] font-medium text-[#1a1a1a]/40 transition-colors hover:text-[#111110] hover:underline"
              >
                행사 관리
                <ArrowUpRight className="h-2.5 w-2.5" />
              </Link>
            )}
          </Fragment>
        ))}
        <button
          type="button"
          onClick={() => onSetAllSources(!allSourcesVisible)}
          className="ml-auto shrink-0 rounded-md px-2 py-1 text-[11px] font-medium text-[#1a1a1a]/45 transition-colors hover:bg-[#f5f5f2] hover:text-[#111110]"
        >
          {allSourcesVisible ? "모두 해제" : "모두 선택"}
        </button>
      </div>

      {/* 담당자 필터 — 팀(공용) + 팀원 개인. 팀 칩은 팀 일정 소스와 연동 */}
      {teamMembers.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 border-t border-[#f0f0ec] px-4 py-2.5">
          <span className="mr-1 shrink-0 text-[11px] font-semibold uppercase tracking-wider text-[#1a1a1a]/35">
            담당자
          </span>
          <CheckChip
            checked={!hiddenSources.has("calendar")}
            label="팀"
            count={sourceCounts.calendar ?? 0}
            onToggle={() => onToggleSource("calendar")}
            dot="#084734"
          />
          {teamMembers.map((member) => (
            <CheckChip
              key={member.name}
              checked={!hiddenAssignees.has(member.name)}
              label={member.name}
              count={member.count}
              onToggle={() => onToggleAssignee(member.name)}
              dot={getTeamMemberColor(member.name)}
              avatar
              dim={!assigneeSourcesVisible}
            />
          ))}
          <button
            type="button"
            onClick={() => onSetAllAssignees(!allAssigneesVisible)}
            className="ml-auto shrink-0 rounded-md px-2 py-1 text-[11px] font-medium text-[#1a1a1a]/45 transition-colors hover:bg-[#f5f5f2] hover:text-[#111110]"
          >
            {allAssigneesVisible ? "모두 해제" : "모두 선택"}
          </button>
        </div>
      )}

      {/* 요약 + 유형 범례 */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 border-t border-[#f0f0ec] bg-[#fafaf8] px-4 py-2.5 text-[12px] text-[#1a1a1a]/45">
        <span>
          표시중 <span className="font-semibold text-[#111110]">{visibleEvents.length}개</span>
          <span className="text-[#1a1a1a]/30"> / 이 기간 {events.length}개</span>
        </span>
        {EVENT_TYPES.slice(0, 4).map((type) => {
          const count = visibleEvents.filter((event) => event.type === type.value).length
          if (count === 0) return null
          return (
            <span key={type.value} className="flex items-center gap-1.5">
              <span className={`h-2 w-2 rounded-full ${type.dot}`} />
              {type.label} {count}
            </span>
          )
        })}
      </div>
    </div>
  )
}
