"use client"

import { MessageSquare } from "lucide-react"

import { cn } from "@/lib/utils"

import ConversationTable from "../components/ConversationTable"
import { CONSOLE_CONTENT_CLASS, QUEUE_STATUS_CHIPS, type QueueStatusFilter } from "../constants"
import type { InternalCsConversation } from "../types"

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
}: {
  conversations: InternalCsConversation[]
  filter: QueueStatusFilter
  chipCounts: Record<QueueStatusFilter, number>
  hqBusyId: string | null
  onNewConversation: () => void
  onFilterChange: (filter: QueueStatusFilter) => void
  onSelect: (conversation: InternalCsConversation) => void
  onRequestHq: (conversation: InternalCsConversation) => void
}) {
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
            <MessageSquare className="h-4 w-4" />
            새 대화
          </button>
        </div>

        {/* 흡수된 `아카이브` 탭 — 같은 목록(status=all)에 상태 칩만 다르게 건다. */}
        <div className="mt-4 flex flex-wrap gap-1.5" role="group" aria-label="대화 상태 필터">
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
                <span className={cn("tabular-nums text-[11px]", active ? "text-white/70" : "text-[#A39E98]")}>
                  {chipCounts[chip.value]}
                </span>
              </button>
            )
          })}
        </div>
      </div>
      <ConversationTable
        conversations={conversations}
        emptyLabel={filter === "closed" ? "종료·보관한 대화가 없습니다." : "대기 중인 대화가 없습니다."}
        onSelect={onSelect}
        onRequestHq={onRequestHq}
        hqBusyId={hqBusyId}
      />
    </section>
  )
}
