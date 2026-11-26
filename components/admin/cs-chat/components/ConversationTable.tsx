"use client"

import { Archive, Building, ChevronRight } from "lucide-react"
import { useEffect, useState } from "react"

import { cn } from "@/lib/utils"

import { PRIORITY_META } from "../constants"
import { formatRelativeTime, formatTagLabel } from "../formatters"
import { isHqPending } from "../hq-desk"
import type { InternalCsConversation } from "../types"
import StatusBadge from "./StatusBadge"

// 종료·보관된 상태에서는 '대기 경과'가 의미 없다.
const OPEN_STATUSES = new Set(["queue", "active", "waiting_review"])

export default function ConversationTable({
  conversations,
  emptyLabel,
  onSelect,
  // 행 안의 2차 액션(본사 확인 요청·보관). 행 자체가 클릭 가능하므로 버튼은 전파를 멈춘다.
  onRequestHq,
  onArchive,
  hqBusyId,
  now,
}: {
  conversations: InternalCsConversation[]
  emptyLabel: string
  onSelect: (conversation: InternalCsConversation) => void
  onRequestHq?: (conversation: InternalCsConversation) => void
  /** 대기열 행마다 보관 버튼을 둔다(IC-24). 보관 뒤 되돌리기 띠는 대기열 화면이 그린다. */
  onArchive?: (conversation: InternalCsConversation) => void
  hqBusyId?: string | null
  now?: number
}) {
  // 상대 시각은 분 단위로만 바뀌므로 1분마다 시계를 갱신한다.
  const [clock, setClock] = useState(() => Date.now())
  useEffect(() => {
    const id = setInterval(() => setClock(Date.now()), 60_000)
    return () => clearInterval(id)
  }, [])
  const nowMs = now ?? clock

  if (conversations.length === 0) {
    return (
      <div className="flex min-h-[360px] flex-col items-center justify-center px-6 text-center">
        <Archive className="h-8 w-8 text-[#78736D]" aria-hidden="true" />
        <p className="mt-4 text-[14px] font-semibold text-[#31302E]">{emptyLabel}</p>
        <p className="mt-1 text-[12px] text-[#615D59]">새 상담을 시작하면 이곳에 기록됩니다.</p>
      </div>
    )
  }

  return (
    <div className="overflow-x-auto border-t border-black/[0.08]">
      <table className={cn("w-full border-collapse text-left", onRequestHq ? "min-w-[1020px]" : "min-w-[760px]")}>
        <caption className="sr-only">내부 CS 대화 대기열</caption>
        <thead className="bg-[#F6F5F4] text-[12px] font-semibold text-[#615D59]">
          <tr>
            <th scope="col" className="px-5 py-3">상태</th>
            <th scope="col" className="px-5 py-3">대화</th>
            <th scope="col" className="px-5 py-3">우선순위</th>
            <th scope="col" className="px-5 py-3">담당자</th>
            <th scope="col" className="px-5 py-3">업데이트</th>
            <th scope="col" className="px-5 py-3">대기 경과</th>
            {onRequestHq || onArchive ? <th scope="col" className="px-5 py-3 text-right">작업</th> : null}
          </tr>
        </thead>
        <tbody>
          {conversations.map((conversation) => {
            const priority = PRIORITY_META[conversation.priority]
            const waiting = OPEN_STATUSES.has(conversation.status)
            return (
              <tr
                key={conversation.id}
                className="cursor-pointer border-b border-black/[0.08] bg-white transition-colors hover:bg-[#FAFAF8] focus-within:bg-[#FAFAF8]"
                onClick={() => onSelect(conversation)}
              >
                <td className="px-5 py-4"><StatusBadge status={conversation.status} /></td>
                <td className="px-5 py-4">
                  {/* 키보드로 열 수 있는 진입점은 제목 버튼 하나다. 행 클릭은 마우스 편의일 뿐이다(IC-22). */}
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation()
                      onSelect(conversation)
                    }}
                    className="flex max-w-[360px] items-center gap-1 rounded text-left text-[14px] font-semibold text-[#111110] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#084734]"
                    aria-label={`${conversation.title} 대화 열기`}
                  >
                    <span className="truncate">{conversation.title}</span>
                    <ChevronRight className="h-4 w-4 shrink-0 text-[#78736D]" aria-hidden="true" />
                  </button>
                  <p className="mt-1 max-w-[360px] truncate text-[12px] text-[#615D59]">
                    {conversation.tags.length > 0 ? conversation.tags.map(formatTagLabel).join(" · ") : "분류 전"}
                  </p>
                </td>
                <td className="px-5 py-4 text-[12px] text-[#615D59]">
                  <span className="inline-flex items-center gap-2">
                    <span className={cn("h-1.5 w-1.5 rounded-full", priority.dot)} aria-hidden="true" />
                    {priority.label}
                  </span>
                </td>
                <td className="px-5 py-4 text-[12px] text-[#615D59]">{conversation.assignee_name ?? "미지정"}</td>
                <td className="px-5 py-4 text-[12px] text-[#615D59]">
                  <time dateTime={conversation.last_message_at ?? conversation.updated_at} title={conversation.last_message_at ?? conversation.updated_at}>
                    {formatRelativeTime(conversation.last_message_at ?? conversation.updated_at, nowMs)}
                  </time>
                </td>
                <td className="px-5 py-4 text-[12px] tabular-nums text-[#615D59]">
                  {waiting ? formatRelativeTime(conversation.last_message_at ?? conversation.updated_at, nowMs).replace(" 전", "") : "—"}
                </td>
                {onRequestHq || onArchive ? (
                  <td className="px-5 py-4 text-right">
                    <div className="inline-flex items-center gap-1.5">
                      {onRequestHq ? (
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation()
                            onRequestHq(conversation)
                          }}
                          disabled={hqBusyId === conversation.id}
                          className={cn(
                            "inline-flex h-8 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-md border px-2.5 text-[12px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#084734] disabled:opacity-40",
                            isHqPending(conversation)
                              ? "border-[#ECD29C] bg-[#FBF1E0] text-[#7A520F] hover:bg-[#F6E7CE]"
                              : "border-black/[0.08] bg-white text-[#615D59] hover:bg-[#F6F5F4] hover:text-[#31302E]"
                          )}
                        >
                          <Building className="h-3.5 w-3.5" aria-hidden="true" />
                          {isHqPending(conversation) ? "확인 대기" : "본사 확인 요청"}
                        </button>
                      ) : null}
                      {onArchive && conversation.status !== "archived" ? (
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation()
                            onArchive(conversation)
                          }}
                          aria-label={`${conversation.title} 보관`}
                          className="inline-flex h-8 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-md border border-black/[0.08] bg-white px-2.5 text-[12px] font-semibold text-[#615D59] transition-colors hover:bg-[#F6F5F4] hover:text-[#31302E] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#084734]"
                        >
                          <Archive className="h-3.5 w-3.5" aria-hidden="true" />
                          보관
                        </button>
                      ) : null}
                    </div>
                  </td>
                ) : null}
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
