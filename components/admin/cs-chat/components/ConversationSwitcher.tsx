"use client"

import { ChevronDown } from "lucide-react"
import { useEffect, useRef, useState } from "react"

import { cn } from "@/lib/utils"

import { STATUS_META } from "../constants"
import type { InternalCsConversation } from "../types"

// 대화 스위처 — 네이티브 select 대신 제목 + 셰브론 트리거와 드롭 목록.
// 목록에는 상태 라벨을 함께 보여줘 전환 전에 검토 필요 여부를 알 수 있다.
export default function ConversationSwitcher({
  label,
  conversations,
  selectedId,
  onSelect,
}: {
  label: string
  conversations: InternalCsConversation[]
  selectedId: string | null
  onSelect: (conversation: InternalCsConversation) => void
}) {
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!open) return
    function handlePointerDown(event: MouseEvent | TouchEvent) {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener("mousedown", handlePointerDown)
    document.addEventListener("touchstart", handlePointerDown)
    return () => {
      document.removeEventListener("mousedown", handlePointerDown)
      document.removeEventListener("touchstart", handlePointerDown)
    }
  }, [open])

  return (
    <div ref={containerRef} className="relative min-w-0">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        disabled={conversations.length === 0}
        className="flex h-9 max-w-[300px] items-center gap-2 rounded-md px-2.5 text-[13px] font-semibold text-[#111110] transition-colors hover:bg-[#F6F5F4] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#084734]/40 disabled:cursor-default disabled:hover:bg-transparent"
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className="min-w-0 truncate">{label}</span>
        {conversations.length > 0 ? (
          <ChevronDown className={cn("h-3.5 w-3.5 shrink-0 text-[#A39E98] transition-transform", open && "rotate-180")} />
        ) : null}
      </button>
      {open ? (
        <ul
          role="listbox"
          className="absolute left-0 top-10 z-50 max-h-72 w-72 overflow-y-auto rounded-lg border border-black/[0.08] bg-white py-1 shadow-[0_14px_36px_rgba(0,0,0,0.10)]"
        >
          {conversations.map((conversation) => (
            <li key={conversation.id}>
              <button
                type="button"
                role="option"
                aria-selected={conversation.id === selectedId}
                onClick={() => {
                  setOpen(false)
                  onSelect(conversation)
                }}
                className={cn(
                  "flex w-full items-center gap-2 px-3 py-2 text-left text-[12px] transition-colors hover:bg-[#F6F5F4]",
                  conversation.id === selectedId ? "font-semibold text-[#084734]" : "text-[#31302E]"
                )}
              >
                <span className="min-w-0 flex-1 truncate">{conversation.title}</span>
                <span className="shrink-0 text-[10px] text-[#A39E98]">{STATUS_META[conversation.status].label}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}
