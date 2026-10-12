"use client"

import { useState } from "react"
import { ArrowRight } from "lucide-react"

import { adminAiStore } from "@/lib/admin-ai/store"
import type { AdminAiPageContext } from "@/lib/admin-ai/types"

export function AdminAiComposer({
  busy,
  context,
  showShortcut = false,
  inputRef,
  className = "",
}: {
  busy: boolean
  context: AdminAiPageContext
  showShortcut?: boolean
  inputRef?: React.Ref<HTMLInputElement>
  className?: string
}) {
  const [text, setText] = useState("")

  const submit = () => {
    const value = text.trim()
    if (!value || busy) return
    adminAiStore.ask({ text: value, context })
    setText("")
  }

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault()
        submit()
      }}
      autoComplete="off"
      className={`flex items-center gap-2 rounded-lg border border-[#E5E5E0] py-1.5 pl-3 pr-1.5 focus-within:border-transparent focus-within:outline focus-within:outline-2 focus-within:-outline-offset-1 focus-within:outline-[#084734] ${className}`}
    >
      <input
        ref={inputRef}
        value={text}
        onChange={(event) => setText(event.target.value)}
        onKeyDown={(event) => {
          // 한글 조합 중 Enter 는 글자 확정이다 — 보내지 않는다.
          if (event.key === "Enter" && event.nativeEvent.isComposing) event.preventDefault()
        }}
        disabled={busy}
        placeholder={busy ? "답변을 기다리는 중…" : "질문하거나 오더를 내려 보세요"}
        aria-label="갈매봇에게 보낼 메시지"
        className="min-w-0 flex-1 bg-transparent text-[13px] text-[#111110] placeholder:text-[#A39E98] focus:outline-none disabled:cursor-not-allowed"
      />
      {busy ? (
        <button
          type="button"
          onClick={() => adminAiStore.stop()}
          className="rounded-md px-2 py-1 text-[12px] font-semibold text-[#615D59] hover:bg-[#F6F5F4] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#084734]"
        >
          중지
        </button>
      ) : (
        <>
          {showShortcut ? (
            <kbd className="hidden rounded border border-[#E8E8E4] px-[5px] py-px font-mono text-[10px] text-[#A39E98] lg:inline">
              Ctrl J
            </kbd>
          ) : null}
          <button
            type="submit"
            aria-label="보내기"
            disabled={!text.trim()}
            className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-md bg-[#084734] text-white transition hover:bg-[#065c41] disabled:opacity-40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#084734]"
          >
            <ArrowRight className="h-[15px] w-[15px]" aria-hidden="true" />
          </button>
        </>
      )}
    </form>
  )
}
