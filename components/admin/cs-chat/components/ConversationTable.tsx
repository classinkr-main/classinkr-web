"use client"

import { Archive, Building, ChevronRight } from "lucide-react"

import { cn } from "@/lib/utils"

import { PRIORITY_META } from "../constants"
import { formatDay } from "../formatters"
import { isHqPending } from "../hq-desk"
import type { InternalCsConversation } from "../types"
import StatusBadge from "./StatusBadge"

export default function ConversationTable({
  conversations,
  emptyLabel,
  onSelect,
  // 행 안의 2차 액션(본사 확인 요청). 행 자체가 클릭 가능하므로 버튼은 전파를 멈춘다.
  onRequestHq,
  hqBusyId,
}: {
  conversations: InternalCsConversation[]
  emptyLabel: string
  onSelect: (conversation: InternalCsConversation) => void
  onRequestHq?: (conversation: InternalCsConversation) => void
  hqBusyId?: string | null
}) {
  if (conversations.length === 0) {
    return (
      <div className="flex min-h-[360px] flex-col items-center justify-center px-6 text-center">
        <Archive className="h-8 w-8 text-[#A39E98]" />
        <p className="mt-4 text-[14px] font-semibold text-[#31302E]">{emptyLabel}</p>
        <p className="mt-1 text-[12px] text-[#615D59]">새 상담을 시작하면 이곳에 기록됩니다.</p>
      </div>
    )
  }

  return (
    <div className="overflow-x-auto border-t border-black/[0.08]">
      <table className={cn("w-full border-collapse text-left", onRequestHq ? "min-w-[900px]" : "min-w-[760px]")}>
        <thead className="bg-[#F6F5F4] text-[11px] font-semibold text-[#615D59]">
          <tr>
            <th className="px-5 py-3">상태</th>
            <th className="px-5 py-3">대화</th>
            <th className="px-5 py-3">우선순위</th>
            <th className="px-5 py-3">담당자</th>
            <th className="px-5 py-3">업데이트</th>
            {onRequestHq ? <th className="px-5 py-3 text-right">본사</th> : null}
            <th className="w-12 px-3 py-3" />
          </tr>
        </thead>
        <tbody>
          {conversations.map((conversation) => {
            const priority = PRIORITY_META[conversation.priority]
            return (
              <tr
                key={conversation.id}
                className="cursor-pointer border-b border-black/[0.08] bg-white transition-colors hover:bg-[#FAFAF8]"
                onClick={() => onSelect(conversation)}
              >
                <td className="px-5 py-4"><StatusBadge status={conversation.status} /></td>
                <td className="px-5 py-4">
                  <p className="max-w-[360px] truncate text-[14px] font-semibold text-[#111110]">{conversation.title}</p>
                  <p className="mt-1 max-w-[360px] truncate text-[11px] text-[#615D59]">
                    {conversation.tags.length > 0 ? conversation.tags.join(" · ") : "분류 전"}
                  </p>
                </td>
                <td className="px-5 py-4 text-[12px] text-[#615D59]">
                  <span className="inline-flex items-center gap-2">
                    <span className={cn("h-1.5 w-1.5 rounded-full", priority.dot)} />
                    {priority.label}
                  </span>
                </td>
                <td className="px-5 py-4 text-[12px] text-[#615D59]">{conversation.assignee_name ?? "미지정"}</td>
                <td className="px-5 py-4 text-[12px] text-[#615D59]">{formatDay(conversation.last_message_at)}</td>
                {onRequestHq ? (
                  <td className="px-5 py-4 text-right">
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation()
                        onRequestHq(conversation)
                      }}
                      disabled={hqBusyId === conversation.id}
                      className={cn(
                        "inline-flex h-8 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-md border px-2.5 text-[11px] font-semibold transition-colors disabled:opacity-40",
                        isHqPending(conversation)
                          ? "border-[#ECD29C] bg-[#FBF1E0] text-[#7A520F] hover:bg-[#F6E7CE]"
                          : "border-black/[0.08] bg-white text-[#615D59] hover:bg-[#F6F5F4] hover:text-[#31302E]"
                      )}
                    >
                      <Building className="h-3.5 w-3.5" />
                      {isHqPending(conversation) ? "확인 대기" : "본사 확인 요청"}
                    </button>
                  </td>
                ) : null}
                <td className="px-3 py-4"><ChevronRight className="h-4 w-4 text-[#A39E98]" /></td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
