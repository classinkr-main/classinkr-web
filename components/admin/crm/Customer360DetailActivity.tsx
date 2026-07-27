"use client"

import { useMemo, useState } from "react"
import { CheckCircle2, Circle } from "lucide-react"

import { Panel, TableEmpty } from "@/components/admin/viz"
import type { CrmCustomerEventRecord, ListCrmCustomerEventsResult } from "@/lib/repositories/crm-events"

import {
  Chip,
  formatDateTime,
  SENTIMENT_LABEL,
} from "./Customer360DetailShared"
import { eventSourceIcon, eventSourceLabel } from "./event-source-meta"

type ActivityFilter = "all" | "memo" | "meeting" | "cs_inflow" | "calls_etc"

const FILTERS: Array<{ key: ActivityFilter; label: string }> = [
  { key: "all", label: "전체" },
  { key: "memo", label: "메모" },
  { key: "meeting", label: "회의록" },
  { key: "cs_inflow", label: "CS·웹유입" },
  { key: "calls_etc", label: "통화·기타" },
]

function matchesFilter(event: CrmCustomerEventRecord, filter: ActivityFilter): boolean {
  if (filter === "all") return true
  if (filter === "memo") return event.sourceType === "manual_note"
  if (filter === "meeting") return event.sourceType === "meeting_minutes"
  if (filter === "cs_inflow") {
    return (
      event.sourceType === "site_inflow" ||
      event.sourceType === "lead_contact_log" ||
      event.tags.some((t) => {
        const lower = t.toLowerCase()
        return lower.includes("cs") || lower.includes("chatbot") || lower.includes("channel") || lower.includes("demo")
      })
    )
  }
  // 통화·기타 = 메모/회의록/CS웹유입을 제외한 나머지 출처.
  return (
    event.sourceType !== "manual_note" &&
    event.sourceType !== "meeting_minutes" &&
    event.sourceType !== "site_inflow" &&
    event.sourceType !== "lead_contact_log"
  )
}

function sentimentClass(sentiment: string): string {
  if (sentiment === "risk") return "bg-[#FEF3EE] text-[#B85C33]"
  if (sentiment === "positive") return "bg-[#ECFDF5] text-[#084734]"
  return "bg-[#f0f0ec] text-[#1a1a1a]/55"
}

function StringList({ label, items }: { label: string; items: string[] }) {
  if (items.length === 0) return null
  return (
    <div>
      <p className="text-[11px] font-semibold text-[#1a1a1a]/35">{label}</p>
      <ul className="mt-1 space-y-0.5">
        {items.map((item, i) => (
          <li key={`${item}-${i}`} className="text-[12px] leading-relaxed text-[#1a1a1a]/70">
            · {item}
          </li>
        ))}
      </ul>
    </div>
  )
}

function ActivityCard({ event }: { event: CrmCustomerEventRecord }) {
  const detail =
    event.meetingPurpose ||
    event.attendees.length > 0 ||
    event.decisions.length > 0 ||
    event.blockers.length > 0 ||
    event.nextActions.length > 0 ||
    event.tags.length > 0 ||
    event.body

  return (
    <li className="flex gap-3">
      <span
        className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${
          event.sentiment === "risk" ? "bg-[#FEF3EE] text-[#B85C33]" : "bg-[#fafaf8] text-[#1a1a1a]/45"
        }`}
      >
        {eventSourceIcon(event.sourceType)}
      </span>
      <div className="min-w-0 flex-1 rounded-2xl border border-[#f0f0ec] bg-white p-3.5">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[11px] font-semibold text-[#1a1a1a]/45">
            {eventSourceLabel(event.sourceType)}
          </span>
          <span className="text-[11px] text-[#1a1a1a]/35">{formatDateTime(event.occurredAt)}</span>
          {event.ownerName ? <span className="text-[11px] text-[#1a1a1a]/35">· {event.ownerName}</span> : null}
          <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${sentimentClass(event.sentiment)}`}>
            {SENTIMENT_LABEL[event.sentiment] ?? event.sentiment}
          </span>
        </div>

        <p className="mt-1 text-[14px] font-bold text-[#111110]">{event.title}</p>
        {event.summary ? <p className="mt-0.5 text-[12px] leading-relaxed text-[#1a1a1a]/55">{event.summary}</p> : null}

        {detail ? (
          <div className="mt-3 space-y-2.5 border-t border-[#f5f5f2] pt-3">
            {event.meetingPurpose ? (
              <div>
                <p className="text-[11px] font-semibold text-[#1a1a1a]/35">미팅 목적</p>
                <p className="mt-0.5 text-[12px] text-[#1a1a1a]/70">{event.meetingPurpose}</p>
              </div>
            ) : null}

            {event.attendees.length > 0 ? (
              <div>
                <p className="text-[11px] font-semibold text-[#1a1a1a]/35">참석자</p>
                <div className="mt-1 flex flex-wrap gap-1">
                  {event.attendees.map((person, i) => (
                    <Chip key={`${person}-${i}`}>{person}</Chip>
                  ))}
                </div>
              </div>
            ) : null}

            <StringList label="결정 사항" items={event.decisions} />
            <StringList label="블로커" items={event.blockers} />

            {event.nextActions.length > 0 ? (
              <div>
                <p className="text-[11px] font-semibold text-[#1a1a1a]/35">다음 액션</p>
                <ul className="mt-1 space-y-1">
                  {event.nextActions.map((action, i) => (
                    <li key={`${action.title}-${i}`} className="flex items-start gap-1.5 text-[12px]">
                      {action.done ? (
                        <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#084734]" />
                      ) : (
                        <Circle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#1a1a1a]/30" />
                      )}
                      <span className={action.done ? "text-[#1a1a1a]/40 line-through" : "text-[#1a1a1a]/70"}>
                        {action.title}
                        {action.ownerName ? ` · ${action.ownerName}` : ""}
                        {action.dueAt ? ` · ${formatDateTime(action.dueAt)}` : ""}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            {event.body && !event.summary ? (
              <p className="whitespace-pre-line text-[12px] leading-relaxed text-[#1a1a1a]/70">{event.body}</p>
            ) : null}

            {event.tags.length > 0 ? (
              <div className="flex flex-wrap gap-1">
                {event.tags.map((tag) => (
                  <Chip key={tag} className="bg-[#ECFDF5] text-[#084734]">
                    #{tag}
                  </Chip>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </li>
  )
}

export default function Customer360DetailActivity({ activity }: { activity: ListCrmCustomerEventsResult }) {
  const [filter, setFilter] = useState<ActivityFilter>("all")
  const rows = activity.rows
  const filtered = useMemo(() => rows.filter((event) => matchesFilter(event, filter)), [rows, filter])

  return (
    <Panel
      title={`활동 · 메모 (${activity.summary.total})`}
      description="회의록 · 통화 · 메모 타임라인 (읽기 전용 — 기록 생성은 드로어에서)"
      action={
        <div className="inline-flex rounded-lg border border-[#e8e8e4] bg-[#fafaf8] p-0.5">
          {FILTERS.map((item) => (
            <button
              key={item.key}
              type="button"
              onClick={() => setFilter(item.key)}
              className={`h-7 rounded-md px-2.5 text-[12px] font-semibold transition-colors ${
                filter === item.key ? "bg-[#111110] text-white" : "text-[#1a1a1a]/55 hover:text-[#111110]"
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
      }
    >
      {!activity.health.ok && activity.health.message ? (
        <p className="mb-3 rounded-xl border border-[#ECD29C] bg-[#FBF1E0] px-3 py-2 text-[12px] text-[#7A520F]">
          {activity.health.message}
        </p>
      ) : null}

      {filtered.length === 0 ? (
        <TableEmpty message={filter === "all" ? "기록된 활동이 없습니다." : "해당 유형의 기록이 없습니다."} />
      ) : (
        <ul className="space-y-3">
          {filtered.map((event) => (
            <ActivityCard key={event.id} event={event} />
          ))}
        </ul>
      )}
    </Panel>
  )
}
