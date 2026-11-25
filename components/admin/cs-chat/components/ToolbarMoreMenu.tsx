"use client"

import { Archive, Keyboard, MoreHorizontal, RotateCcw } from "lucide-react"
import { useEffect, useRef, useState, type KeyboardEvent } from "react"

import { cn } from "@/lib/utils"

import { isEditableTarget, isHelpShortcut } from "../composer-keyboard"

export const SHORTCUT_LIST: ReadonlyArray<{ keys: string; description: string }> = [
  { keys: "Enter", description: "질문 보내기" },
  { keys: "Shift + Enter", description: "줄바꿈" },
  { keys: "Alt + Shift + N", description: "새 상담 시작(입력창 밖에서)" },
  { keys: "Esc", description: "검토 패널·목록 닫기" },
  { keys: "?", description: "이 단축키 목록 열기(입력창 밖에서)" },
]

/**
 * 대화 툴바의 '더보기' 메뉴(IC-24·IC-22). 보관은 되돌리기 띠가 있는 즉시 실행이라 확인 창 없이 대상 상담의 제목을 메뉴 글에 적는다.
 * 단축키 목록도 여기 있고, 입력창 밖에서 '?' 를 누르면 메뉴가 열린다.
 */
export default function ToolbarMoreMenu({
  conversationTitle,
  archived,
  onArchive,
  onReopen,
  disabled = false,
}: {
  conversationTitle: string | null
  archived: boolean
  onArchive?: () => void
  onReopen?: () => void
  disabled?: boolean
}) {
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement | null>(null)
  const triggerRef = useRef<HTMLButtonElement | null>(null)
  const firstItemRef = useRef<HTMLButtonElement | null>(null)
  const menuRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    function handleShortcut(event: globalThis.KeyboardEvent) {
      if (!isHelpShortcut(event)) return
      if (isEditableTarget(event.target as HTMLElement | null)) return
      event.preventDefault()
      setOpen(true)
    }
    window.addEventListener("keydown", handleShortcut)
    return () => window.removeEventListener("keydown", handleShortcut)
  }, [])

  useEffect(() => {
    if (!open) return
    ;(firstItemRef.current ?? menuRef.current)?.focus()
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

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape") {
      event.preventDefault()
      event.stopPropagation()
      setOpen(false)
      triggerRef.current?.focus()
    }
  }

  const title = conversationTitle ?? "이 상담"
  return (
    <div ref={containerRef} className="relative" onKeyDown={handleKeyDown}>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((current) => !current)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="더보기"
        title="더보기 · 단축키(?)"
        className="flex h-8 w-8 items-center justify-center rounded-md text-[#615D59] transition-colors hover:bg-[#F6F5F4] hover:text-[#111110] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#084734]"
      >
        <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
      </button>
      {open ? (
        <div
          ref={menuRef}
          role="menu"
          tabIndex={-1}
          aria-label="더보기"
          className="absolute right-0 top-9 z-50 w-72 rounded-lg border border-black/[0.08] bg-white p-1 outline-none shadow-[0_14px_36px_rgba(0,0,0,0.10)]"
        >
          {archived ? (
            onReopen ? (
              <button
                ref={firstItemRef}
                type="button"
                role="menuitem"
                onClick={() => {
                  setOpen(false)
                  onReopen()
                }}
                disabled={disabled}
                className="flex min-h-9 w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-[12px] font-semibold text-[#31302E] hover:bg-[#F6F5F4] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#084734] disabled:opacity-50"
              >
                <RotateCcw className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                <span className="min-w-0 truncate">‹{title}› 다시 열기</span>
              </button>
            ) : null
          ) : onArchive ? (
            <button
              ref={firstItemRef}
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false)
                onArchive()
              }}
              disabled={disabled}
              className="flex min-h-9 w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-[12px] font-semibold text-[#31302E] hover:bg-[#F6F5F4] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#084734] disabled:opacity-50"
            >
              <Archive className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              <span className="min-w-0 truncate">‹{title}› 보관</span>
            </button>
          ) : null}
          <div className={cn("px-2.5 pb-2 pt-2", (archived ? onReopen : onArchive) && "mt-1 border-t border-black/[0.06]")}>
            <p className="flex items-center gap-1.5 text-[12px] font-semibold text-[#31302E]">
              <Keyboard className="h-3.5 w-3.5" aria-hidden="true" />
              단축키
            </p>
            <dl className="mt-1.5 space-y-1 text-[12px] text-[#615D59]">
              {SHORTCUT_LIST.map((item) => (
                <div key={item.keys} className="flex items-baseline justify-between gap-3">
                  <dt className="shrink-0 rounded border border-black/[0.12] bg-[#FAFAF8] px-1.5 text-[11px] font-semibold text-[#31302E]">{item.keys}</dt>
                  <dd className="text-right">{item.description}</dd>
                </div>
              ))}
            </dl>
          </div>
        </div>
      ) : null}
    </div>
  )
}
