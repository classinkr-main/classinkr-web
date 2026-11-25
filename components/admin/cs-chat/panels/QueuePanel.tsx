"use client"

import { MessageSquarePlus, Undo2 } from "lucide-react"
import { useMemo, useState } from "react"

import { cn } from "@/lib/utils"

import ConversationTable from "../components/ConversationTable"
import { CONSOLE_CONTENT_CLASS, QUEUE_STATUS_CHIPS, type QueueStatusFilter } from "../constants"
import type { InternalCsConversation } from "../types"

type QueueSort = "recent" | "waiting" | "priority"

const SORT_OPTIONS: Array<{ value: QueueSort; label: string }> = [
  { value: "recent", label: "최근 업데이트순" },
  { value: "waiting", label: "오래 기다린 순" },
  { value: "priority", label: "우선순위순" },
]

const PRIORITY_RANK = { urgent: 0, high: 1, normal: 2, low: 3 } as const

function activityTime(conversation: InternalCsConversation) {
  return Date.parse(conversation.last_message_at ?? conversation.updated_at) || 0
}

function sortConversations(items: InternalCsConversation[], sort: QueueSort) {
  const next = [...items]
  if (sort === "recent") next.sort((a, b) => activityTime(b) - activityTime(a))
  else if (sort === "waiting") next.sort((a, b) => activityTime(a) - activityTime(b))
  else next.sort((a, b) => PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority] || activityTime(a) - activityTime(b))
  return next
}

// 대기열 — 흡수된 `아카이브` 탭까지 같은 목록(status=all)에 상태 칩만 다르게 걸어 보여준다.
export default function QueuePanel({
  conversations,
  filter,
  chipCounts,
  hqBusyId,
  onNewConversation,
  onFilterChange,
  onSelect,
  onRequestHq,
  onArchive,
  archivedBand = null,
  onUndoArchive,
}: {
  conversations: InternalCsConversation[]
  filter: QueueStatusFilter
  chipCounts: Record<QueueStatusFilter, number>
  hqBusyId: string | null
  onNewConversation: () => void
  onFilterChange: (filter: QueueStatusFilter) => void
  onSelect: (conversation: InternalCsConversation) => void
  onRequestHq: (conversation: InternalCsConversation) => void
  /** 행의 '보관' 버튼. 없으면 버튼을 그리지 않는다. */
  onArchive?: (conversation: InternalCsConversation) => void
  /** 방금 보관한 상담. 있으면 되돌리기 띠를 보인다(IC-24). */
  archivedBand?: { id: string; title: string } | null
  onUndoArchive?: () => void
}) {
  const [sort, setSort] = useState<QueueSort>("recent")
  const sorted = useMemo(() => sortConversations(conversations, sort), [conversations, sort])
  return (
    <section className="min-h-0 flex-1 overflow-y-auto bg-white">
      <div className={cn(CONSOLE_CONTENT_CLASS, "py-6")}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-[20px] font-semibold tracking-[-0.02em]">대기열</h2>
            <p className="mt-1 text-[12px] text-[#615D59]">
              검토와 담당자 판단이 필요한 내부 CS 대화입니다. 종료·보관한 상담도 상태 칩으로 함께 확인합니다.
            </p>
          </div>
          <button
            type="button"
            onClick={onNewConversation}
            className="inline-flex h-9 shrink-0 items-center gap-2 rounded-md bg-[#31302E] px-4 text-[12px] font-semibold text-white hover:bg-[#111110]"
          >
            <MessageSquarePlus className="h-4 w-4" aria-hidden="true" />
            새 상담
          </button>
        </div>

        <div role="status" aria-live="polite">
          {archivedBand ? (
            <div
              data-testid="archive-undo-band"
              className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md border border-[#BDEFD8] bg-[#ECFDF5] px-3 py-1.5 text-[12px] text-[#084734]"
            >
              <span>‹{archivedBand.title}›을 보관했어요.</span>
              {onUndoArchive ? (
                <button
                  type="button"
                  onClick={onUndoArchive}
                  className="inline-flex min-h-8 items-center gap-1 font-semibold underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#084734]"
                >
                  <Undo2 className="h-3.5 w-3.5" aria-hidden="true" />
                  되돌리기
                </button>
              ) : null}
            </div>
          ) : null}
        </div>

        {/* 흡수된 `아카이브` 탭 — 같은 목록(status=all)에 상태 칩만 다르게 건다. */}
        <div className="mt-4 flex flex-wrap items-center gap-1.5" role="group" aria-label="대화 상태 필터">
          {QUEUE_STATUS_CHIPS.map((chip) => {
            const active = filter === chip.value
            return (
              <button
                key={chip.value}
                type="button"
                onClick={() => onFilterChange(chip.value)}
                aria-pressed={active}
                className={cn(
                  "inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-[12px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#084734]/40",
                  active
                    ? "border-[#31302E] bg-[#31302E] text-white"
                    : "border-black/[0.08] bg-white text-[#615D59] hover:bg-[#F6F5F4] hover:text-[#111110]"
                )}
              >
                {chip.label}
                <span className={cn("tabular-nums text-[11px]", active ? "text-white/70" : "text-[#78736D]")}>
                  {chipCounts[chip.value]}
                </span>
              </button>
            )
          })}
          <label className="ml-auto flex items-center gap-2 text-[12px] text-[#615D59]">
            정렬
            <select
              value={sort}
              onChange={(event) => setSort(event.target.value as QueueSort)}
              className="h-8 rounded-md border border-black/[0.12] bg-white px-2 text-[12px] font-semibold text-[#31302E] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#084734]"
            >
              {SORT_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </label>
        </div>
      </div>
      <ConversationTable
        conversations={sorted}
        emptyLabel={filter === "closed" ? "종료·보관한 대화가 없습니다." : "대기 중인 대화가 없습니다."}
        onSelect={onSelect}
        onRequestHq={onRequestHq}
        onArchive={onArchive}
        hqBusyId={hqBusyId}
      />
    </section>
  )
}
