"use client"

// CRM 기록 리스트 한 줄 행 — 접힘 기본, 클릭(또는 Enter/Space)으로 상세를 펼치는 디스클로저.
// 1행(스캔 라인): 종류 칩 · 제목(truncate) · 분위기/액션 pill · 시간 · chevron.
// 2행(메타): 단계 신호(있을 때) · 담당 · 대상 — 항상 노출해 리스트 상태에서도 "누구 건인지" 바로 보인다.
// 3행(요약): summary가 있을 때만, line-clamp-2 — 본문 전체는 펼쳤을 때만.
// 펼침(children): 배지 행·담당자 라인·본문·녹음 플레이어·결정/리스크/다음액션 등 상세는 CrmActivityClient가 구성.
// children은 open=false인 동안 렌더 트리에 리컨실되지 않는다 — 안에 있는 <audio>(녹음 플레이어)도
// 함수 자체가 호출되지 않아 마운트/네트워크 요청이 발생하지 않는다(지연 마운트, 별도 처리 불필요).
// 접힘/펼침 상태는 행 내부 useState — 리스트가 리렌더돼도 행 단위로 독립.

import { useState } from "react"
import { Calendar, ChevronDown, User, UserRound } from "lucide-react"

import {
  formatDateTime,
  sentimentLabel,
  sentimentTone,
  sourceLabel,
  STAGE_SIGNALS,
  type CrmEventRecord,
} from "./rail/activity-contract"

const STAGE_LABELS = new Map(STAGE_SIGNALS.filter((signal) => signal.value).map((signal) => [signal.value, signal.label]))

function stageLabel(value: string) {
  return STAGE_LABELS.get(value) ?? value
}

export default function CrmEventRow({ event, children }: { event: CrmEventRecord; children?: React.ReactNode }) {
  const [open, setOpen] = useState(false)
  const risky = event.sentiment === "risk" || event.blockers.length > 0
  const openActions = event.nextActions.filter((action) => !action.done).length
  // 중립은 "평상시" 상태라 배지를 만들지 않는다 — 리스크(예외)와 긍정(주목할 신호)만 표면화.
  const moodBadge = risky
    ? { label: "리스크", tone: sentimentTone("risk") }
    : event.sentiment === "positive"
      ? { label: sentimentLabel("positive"), tone: sentimentTone("positive") }
      : null

  return (
    <article
      className={`overflow-hidden rounded-xl border bg-white transition-colors ${open ? "border-[#d8d8d2]" : "border-[#e8e8e4] hover:border-[#d8d8d2]"}`}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full flex-col gap-1 px-3.5 py-2.5 text-left"
      >
        <span className="flex items-center gap-2.5">
          <span className="shrink-0 rounded-full border border-[#e8e8e4] bg-[#fafaf8] px-2 py-0.5 text-[11px] font-bold text-[#1a1a1a]/55">
            {sourceLabel(event.sourceType)}
          </span>
          <span className="min-w-0 flex-1 truncate text-[13px] font-semibold text-[#111110]">{event.title}</span>
          {moodBadge ? (
            <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-bold ${moodBadge.tone}`}>
              {moodBadge.label}
            </span>
          ) : null}
          {openActions ? (
            <span className="shrink-0 rounded-full border border-[#D7EBDD] bg-[#ECFDF5] px-2 py-0.5 text-[11px] font-bold text-[#084734]">
              액션 {openActions}
            </span>
          ) : null}
          <span className="shrink-0 inline-flex items-center gap-1 text-[11px] tabular-nums text-[#1a1a1a]/40">
            <Calendar className="h-3 w-3" />
            {formatDateTime(event.occurredAt)}
          </span>
          <ChevronDown
            className={`h-3.5 w-3.5 shrink-0 text-[#1a1a1a]/30 transition-transform duration-200 ${open ? "rotate-180" : ""}`}
          />
        </span>

        <span className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-[#1a1a1a]/42">
          {event.stageSignal ? (
            <span className="inline-flex items-center rounded-full border border-[#e8e8e4] bg-[#fafaf8] px-1.5 py-px font-semibold text-[#1a1a1a]/50">
              {stageLabel(event.stageSignal)}
            </span>
          ) : null}
          <span className="inline-flex items-center gap-1">
            <User className="h-3 w-3" />
            {event.ownerName ?? "담당 미지정"}
          </span>
          <span className="inline-flex items-center gap-1">
            <UserRound className="h-3 w-3" />
            {event.targetLabel ?? "미연결"}
          </span>
        </span>

        {event.summary ? (
          <span className="line-clamp-2 text-[12px] leading-4 text-[#1a1a1a]/50">{event.summary}</span>
        ) : null}
      </button>
      {open ? (
        <div className="loading-soft-enter border-t border-[#f0f0ec] px-3.5 py-3">{children}</div>
      ) : null}
    </article>
  )
}
