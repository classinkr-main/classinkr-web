"use client"

import { ChevronDown } from "lucide-react"
import { useEffect, useRef, useState, type KeyboardEvent } from "react"

import { cn } from "@/lib/utils"

import { STATUS_META } from "../constants"
import type { InternalCsConversation } from "../types"

// 대화 스위처 — 네이티브 select 대신 제목 + 셰브론 트리거와 드롭 목록.
// 목록에는 상태 라벨을 함께 보여줘 전환 전에 검토 필요 여부를 알 수 있다.
// 키보드(IC-22): 열면 선택된 항목으로 포커스가 가고, ↑↓·Home·End 로 옮기며, Esc 로 닫으면 트리거로 돌아간다.
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
  const triggerRef = useRef<HTMLButtonElement | null>(null)
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([])

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

  // 열릴 때 선택된 항목(없으면 첫 항목)으로 포커스를 옮긴다.
  useEffect(() => {
    if (!open) return
    const selectedIndex = Math.max(0, conversations.findIndex((conversation) => conversation.id === selectedId))
    optionRefs.current[selectedIndex]?.focus()
  }, [open, conversations, selectedId])

  function close(returnFocus: boolean) {
    setOpen(false)
    if (returnFocus) triggerRef.current?.focus()
  }

  function handleListKeyDown(event: KeyboardEvent<HTMLUListElement>) {
    const options = optionRefs.current.filter((item): item is HTMLButtonElement => Boolean(item))
    const current = options.findIndex((item) => item === document.activeElement)
    if (event.key === "Escape") {
      event.preventDefault()
      event.stopPropagation()
      close(true)
    } else if (event.key === "ArrowDown") {
      event.preventDefault()
      options[(current + 1) % options.length]?.focus()
    } else if (event.key === "ArrowUp") {
      event.preventDefault()
      options[(current - 1 + options.length) % options.length]?.focus()
    } else if (event.key === "Home") {
      event.preventDefault()
      options[0]?.focus()
    } else if (event.key === "End") {
      event.preventDefault()
      options[options.length - 1]?.focus()
    } else if (event.key === "Tab") {
      setOpen(false)
    }
  }

  return (
    <div ref={containerRef} className="relative min-w-0">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((current) => !current)}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown" && conversations.length > 0) {
            event.preventDefault()
            setOpen(true)
          }
        }}
        disabled={conversations.length === 0}
        className="flex h-8 max-w-[300px] items-center gap-2 rounded-md px-2.5 text-[13px] font-semibold text-[#111110] transition-colors hover:bg-[#F6F5F4] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#084734] disabled:cursor-default disabled:hover:bg-transparent"
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className="min-w-0 truncate">{label}</span>
        {conversations.length > 0 ? (
          <ChevronDown className={cn("h-3.5 w-3.5 shrink-0 text-[#78736D] transition-transform", open && "rotate-180")} aria-hidden="true" />
        ) : null}
      </button>
      {open ? (
        <ul
          role="listbox"
          aria-label="상담 선택"
          onKeyDown={handleListKeyDown}
          className="absolute left-0 top-9 z-50 max-h-72 w-72 overflow-y-auto rounded-lg border border-black/[0.08] bg-white py-1 shadow-[0_14px_36px_rgba(0,0,0,0.10)]"
        >
          {conversations.map((conversation, index) => (
            <li key={conversation.id} role="presentation">
              <button
                ref={(node) => { optionRefs.current[index] = node }}
                type="button"
                role="option"
                aria-selected={conversation.id === selectedId}
                onClick={() => {
                  close(false)
                  onSelect(conversation)
                }}
                className={cn(
                  "flex w-full items-center gap-2 px-3 py-2 text-left text-[12px] transition-colors hover:bg-[#F6F5F4] focus-visible:bg-[#F6F5F4] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#084734]",
                  conversation.id === selectedId ? "font-semibold text-[#084734]" : "text-[#31302E]"
                )}
              >
                <span className="min-w-0 flex-1 truncate">{conversation.title}</span>
                <span className="shrink-0 text-[11px] text-[#78736D]">{STATUS_META[conversation.status].label}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}
