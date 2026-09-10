"use client"

import Link from "next/link"
import { AlignLeft, ArrowUpRight, CalendarRange, Clock, Pencil, Plus, Trash2, Users, X } from "lucide-react"

import type { CalendarEvent } from "@/lib/calendar-data"
import { getTeamMemberColor } from "@/lib/team-member-colors"

import { CalendarEmpty } from "./CalendarEmpty"
import {
  getEventDotColor,
  getEventSource,
  getEventSourceLabel,
  getOpenLabel,
  getReadonlyHelp,
  getTypeStyle,
  sortByTimeOfDay,
  sortEventFirst,
} from "./event-style"

const WEEKDAYS = ["일요일", "월요일", "화요일", "수요일", "목요일", "금요일", "토요일"]

function formatHeading(date: string) {
  const parsed = new Date(`${date}T00:00:00Z`)
  const month = Number(date.slice(5, 7))
  const day = Number(date.slice(8, 10))
  return `${month}월 ${day}일 ${WEEKDAYS[parsed.getUTCDay()]}`
}

function formatSpan(event: CalendarEvent) {
  const endDate = event.endDate && event.endDate !== event.date ? event.endDate : null
  if (event.time) {
    const timeRange = event.endTime ? `${event.time} ~ ${event.endTime}` : event.time
    return endDate ? `${timeRange} · ${event.date} ~ ${endDate}` : timeRange
  }
  return endDate ? `종일 · ${event.date} ~ ${endDate}` : "종일"
}

interface DayDetailPanelProps {
  date: string
  events: CalendarEvent[]
  onClose: () => void
  onCreate: (date: string) => void
  onEdit: (event: CalendarEvent) => void
  onDelete: (event: CalendarEvent) => void
}

/**
 * 날짜를 눌렀을 때 그날 전체를 펼치는 패널.
 *
 * 그리드 칩은 제목만 보이므로 시간·담당자·메모는 여기서만 읽을 수 있다.
 * 메모는 자르지 않는다 — 자세히 보려고 연 화면에서 또 자르면 열 이유가 없다.
 */
export function DayDetailPanel({
  date,
  events,
  onClose,
  onCreate,
  onEdit,
  onDelete,
}: DayDetailPanelProps) {
  const ordered = sortByTimeOfDay(sortEventFirst(events))
  const holiday = events.find((event) => getEventSource(event) === "holiday")

  return (
    <div className="overflow-hidden rounded-2xl border border-[#e8e8e4] bg-white">
      <div className="flex items-start justify-between gap-2 border-b border-[#e8e8e4] px-4 py-3">
        <div className="min-w-0">
          <p className="mb-0.5 text-[11px] text-[#1a1a1a]/40">선택된 날짜</p>
          <p className="truncate text-[14px] font-semibold text-[#111110]">{formatHeading(date)}</p>
          <p className="mt-0.5 text-[11px] text-[#1a1a1a]/40">
            일정 {events.length}건
            {holiday && <span className="ml-1 text-[#B43E3E]">· {holiday.title}</span>}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            onClick={() => onCreate(date)}
            aria-label={`${formatHeading(date)}에 일정 추가`}
            className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#111110] text-white transition-colors hover:bg-[#111110]/80"
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={onClose}
            aria-label="상세 닫기"
            className="flex h-7 w-7 items-center justify-center rounded-lg text-[#1a1a1a]/35 transition-colors hover:bg-[#f0f0ec] hover:text-[#111110]"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {ordered.length === 0 ? (
        <CalendarEmpty message="일정 없음" compact />
      ) : (
        <div className="max-h-[70vh] divide-y divide-[#f0f0ec] overflow-y-auto">
          {ordered.map((event) => {
            const style = getTypeStyle(event.type)
            const isReadonly = Boolean(event.readonly)
            const isExternalHref = Boolean(event.href?.startsWith("http"))

            return (
              <div
                key={event.id}
                style={{ boxShadow: `inset 3px 0 0 0 ${getEventDotColor(event)}` }}
                className="py-3 pl-4 pr-3"
              >
                <div className="mb-1.5 flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-[13px] font-medium leading-snug text-[#111110]">{event.title}</p>
                    <div className="mt-1 flex flex-wrap items-center gap-1.5">
                      <span className="rounded-full bg-[#f0f0ec] px-2 py-0.5 text-[10px] font-medium text-[#1a1a1a]/55">
                        {getEventSourceLabel(event)}
                      </span>
                      <span className="rounded-full border border-[#e8e8e4] px-2 py-0.5 text-[10px] font-medium text-[#1a1a1a]/50">
                        {style.label}
                      </span>
                      {event.partnerName && (
                        <span className="rounded-full border border-[#e8e8e4] px-2 py-0.5 text-[10px] text-[#1a1a1a]/45">
                          {event.partnerName}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="flex shrink-0 items-center gap-1">
                    {isReadonly ? (
                      event.href ? (
                        <Link
                          href={event.href}
                          target={isExternalHref ? "_blank" : undefined}
                          rel={isExternalHref ? "noopener noreferrer" : undefined}
                          aria-label={
                            isExternalHref ? `${getOpenLabel(event)} (새 탭에서 열림)` : undefined
                          }
                          className="inline-flex items-center gap-0.5 rounded-lg border border-[#e8e8e4] px-2.5 py-1 text-[11px] font-medium text-[#1a1a1a]/55 transition-colors hover:border-[#111110]/20 hover:text-[#111110]"
                        >
                          {getOpenLabel(event)}
                          {isExternalHref && <ArrowUpRight className="h-2.5 w-2.5" />}
                        </Link>
                      ) : (
                        <span className="rounded-lg border border-[#e8e8e4] px-2.5 py-1 text-[11px] font-medium text-[#1a1a1a]/40">
                          읽기 전용
                        </span>
                      )
                    ) : (
                      <>
                        <button
                          type="button"
                          onClick={() => onEdit(event)}
                          aria-label={`${event.title} 일정 수정`}
                          className="flex h-6 w-6 items-center justify-center rounded text-[#1a1a1a]/30 transition-colors hover:bg-[#f0f0ec] hover:text-[#111110]"
                        >
                          <Pencil className="h-3 w-3" />
                        </button>
                        <button
                          type="button"
                          onClick={() => onDelete(event)}
                          aria-label={`${event.title} 일정 삭제`}
                          className="flex h-6 w-6 items-center justify-center rounded text-[#1a1a1a]/30 transition-colors hover:bg-[#FEF3EE] hover:text-[#B85C33]"
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      </>
                    )}
                  </div>
                </div>

                <div className="space-y-1 text-[11px] text-[#1a1a1a]/55">
                  <div className="flex items-center gap-1.5">
                    {event.endDate && event.endDate !== event.date ? (
                      <CalendarRange className="h-3 w-3 shrink-0" />
                    ) : (
                      <Clock className="h-3 w-3 shrink-0" />
                    )}
                    <span className="tabular-nums">{formatSpan(event)}</span>
                  </div>

                  {event.assignees && event.assignees.length > 0 && (
                    <div className="flex items-start gap-1.5">
                      <Users className="mt-0.5 h-3 w-3 shrink-0" />
                      <span className="flex flex-wrap gap-x-2 gap-y-0.5">
                        {event.assignees.map((name) => (
                          <span key={name} className="inline-flex items-center gap-1">
                            <span
                              className="h-1.5 w-1.5 rounded-full"
                              style={{ backgroundColor: getTeamMemberColor(name) }}
                            />
                            {name}
                          </span>
                        ))}
                      </span>
                    </div>
                  )}

                  {event.dealTitle && (
                    <div className="flex items-start gap-1.5">
                      <span className="mt-[2px] h-3 w-3 shrink-0 rounded-full bg-[#111110]/8" />
                      <span>연결 거래: {event.dealTitle}</span>
                    </div>
                  )}

                  {event.description && (
                    <div className="flex items-start gap-1.5">
                      <AlignLeft className="mt-0.5 h-3 w-3 shrink-0" />
                      {/* 상세에서는 메모를 자르지 않는다 — 자세히 보려고 연 화면이다. */}
                      <span className="whitespace-pre-wrap break-words">{event.description}</span>
                    </div>
                  )}

                  {isReadonly && (
                    <div className="rounded-lg bg-[#fafaf8] px-2.5 py-2 text-[11px] text-[#1a1a1a]/45">
                      {getReadonlyHelp(event)}
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
