"use client"

// CRM 기록 리스트 한 줄 행 — 접힘: 종류 칩 · 제목+요약(truncate) · 리스크/액션 pill · 대상 · 시간 · chevron.
// 펼침(children): 배지 행·담당자 라인·본문·녹음 플레이어·결정/리스크/다음액션 등 상세.
// 접힘/펼침 상태는 행 내부 useState — 리스트가 리렌더돼도 행 단위로 독립.

import { useState } from "react"
import { Calendar, ChevronDown, UserRound } from "lucide-react"

import {
  formatDateTime,
  sentimentTone,
  sourceLabel,
  type CrmEventRecord,
} from "./rail/activity-contract"

export default function CrmEventRow({ event, children }: { event: CrmEventRecord; children?: React.ReactNode }) {
  const [open, setOpen] = useState(false)
  const risky = event.sentiment === "risk" || event.blockers.length > 0
  const openActions = event.nextActions.filter((action) => !action.done).length
  return (
    <article className="rounded-xl border border-[#e8e8e4] bg-white">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left"
      >
        <span className="shrink-0 rounded-full border border-[#e8e8e4] bg-[#fafaf8] px-2 py-0.5 text-[11px] font-bold text-[#1a1a1a]/55">
          {sourceLabel(event.sourceType)}
        </span>
        <span className="min-w-0 flex-1 truncate text-[13px] font-semibold text-[#111110]">
          {event.title}
          {event.summary ? <span className="ml-1.5 font-medium text-[#1a1a1a]/45">{event.summary}</span> : null}
        </span>
        {risky ? (
          <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-bold ${sentimentTone("risk")}`}>
            리스크
          </span>
        ) : null}
        {openActions ? (
          <span className="shrink-0 rounded-full border border-[#D7EBDD] bg-[#ECFDF5] px-2 py-0.5 text-[11px] font-bold text-[#084734]">
            액션 {openActions}
          </span>
        ) : null}
        <span className="hidden shrink-0 items-center gap-1 text-[11px] text-[#1a1a1a]/40 sm:inline-flex">
          <UserRound className="h-3 w-3" />
          {event.targetLabel ?? "미연결"}
        </span>
        <span className="shrink-0 inline-flex items-center gap-1 text-[11px] tabular-nums text-[#1a1a1a]/40">
          <Calendar className="h-3 w-3" />
          {formatDateTime(event.occurredAt)}
        </span>
        <ChevronDown
          className={`h-3.5 w-3.5 shrink-0 text-[#1a1a1a]/30 transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>
      {open ? <div className="border-t border-[#f0f0ec] px-3.5 py-3">{children}</div> : null}
    </article>
  )
}
