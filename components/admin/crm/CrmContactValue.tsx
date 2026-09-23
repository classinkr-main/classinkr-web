"use client"

import { useCallback, useEffect, useRef, useState, type MouseEvent } from "react"
import { Check, Copy, X } from "lucide-react"

import { formatKoreanPhone } from "@/lib/crm/phone"
import { STATUS_TONE_TEXT_CLASS } from "@/lib/crm/status-tone"
import { INTERACTIVE_TEXT_CLASS, SECONDARY_TEXT_CLASS } from "./home/shared"

interface CrmContactValueProps {
  value: string | null | undefined
  className?: string
}

export type ContactCopyState = "idle" | "copied" | "failed"

// 복사 결과가 화면에 남는 시간 — 아이콘·문구 교체와 스크린리더 통지가 같은 창을 쓴다.
export const CONTACT_COPY_FEEDBACK_MS = 1400

// 상태별 표기(순수) — 컴포넌트와 테스트가 같은 문구·톤을 본다.
// failed 는 아이콘만이 아니라 Danger 톤 문구를 함께 보여 터치 사용자(툴팁 없음)도 실패를 안다.
export function contactCopyFeedback(state: ContactCopyState) {
  if (state === "copied") {
    return { title: "복사됨", inline: "복사됨", announce: "연락처를 복사했습니다." }
  }
  if (state === "failed") {
    return {
      title: "복사 실패 — 번호를 선택했습니다. 직접 복사하세요",
      inline: "복사 실패",
      announce: "연락처 복사에 실패했습니다. 번호를 선택했으니 직접 복사하세요.",
    }
  }
  return { title: "클릭하여 복사", inline: null, announce: "" }
}

// 고객 연락처 셀: 전화번호는 010-XXXX-XXXX 로 표시하고, 클릭하면 표시값을 클립보드에 복사한다.
// 부모가 클릭 가능한 카드/버튼이어도 전파를 막아 복사만 동작하도록 한다.
// 실패(권한 거부·비보안 컨텍스트)는 무음으로 두지 않는다 — Danger 톤 '복사 실패' 문구를 1.4초
// 보여주고, 번호 텍스트를 선택 상태로 만들어 수동 복사를 돕는다. 성공·실패 모두 항상 마운트된
// sr-only role=status 영역으로 스크린리더에 통지한다(UX 규약 3·7).
export default function CrmContactValue({ value, className = "" }: CrmContactValueProps) {
  const [state, setState] = useState<ContactCopyState>("idle")
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const displayRef = useRef<HTMLSpanElement | null>(null)

  const raw = value?.trim() ?? ""
  const display = raw ? formatKoreanPhone(raw) : "-"

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [])

  const settle = useCallback((next: ContactCopyState) => {
    setState(next)
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => setState("idle"), CONTACT_COPY_FEEDBACK_MS)
  }, [])

  const handleCopy = useCallback(
    async (event: MouseEvent<HTMLButtonElement>) => {
      event.stopPropagation()
      event.preventDefault()
      if (!raw) return
      try {
        if (!navigator.clipboard) throw new Error("clipboard unavailable")
        await navigator.clipboard.writeText(display)
        settle("copied")
      } catch {
        settle("failed")
        // 수동 복사 보조 — 번호 텍스트를 선택 상태로 둔다(선택 API가 없는 환경은 조용히 건너뜀).
        const node = displayRef.current
        const selection = typeof window !== "undefined" ? window.getSelection?.() : null
        if (node && selection && typeof document !== "undefined") {
          try {
            const range = document.createRange()
            range.selectNodeContents(node)
            selection.removeAllRanges()
            selection.addRange(range)
          } catch {
            /* 선택 실패는 보조 동작이라 무시 — 실패 문구는 이미 표시됐다 */
          }
        }
      }
    },
    [display, raw, settle]
  )

  if (!raw) {
    return <span className={`block truncate text-[12px] ${SECONDARY_TEXT_CLASS} ${className}`}>-</span>
  }

  const feedback = contactCopyFeedback(state)

  return (
    <span className={`flex w-fit max-w-full items-center gap-1.5 ${className}`}>
      <button
        type="button"
        onClick={handleCopy}
        title={feedback.title}
        aria-label={`연락처 ${display} 복사`}
        className={`group/contact flex w-fit max-w-full items-center gap-1 text-[12px] ${INTERACTIVE_TEXT_CLASS} transition-colors hover:text-[#084734]`}
      >
        <span ref={displayRef} className="truncate">
          {display}
        </span>
        {state === "copied" ? (
          <Check className="h-3 w-3 shrink-0 text-[#084734]" aria-hidden />
        ) : state === "failed" ? (
          <X className={`h-3 w-3 shrink-0 ${STATUS_TONE_TEXT_CLASS.danger}`} aria-hidden />
        ) : (
          <Copy className="h-3 w-3 shrink-0 opacity-45 transition-opacity group-hover/contact:opacity-80" aria-hidden />
        )}
      </button>
      {feedback.inline ? (
        <span
          aria-hidden
          className={`shrink-0 text-[11px] font-semibold ${
            state === "failed" ? STATUS_TONE_TEXT_CLASS.danger : STATUS_TONE_TEXT_CLASS.ok
          }`}
        >
          {feedback.inline}
        </span>
      ) : null}
      {/* 항상 마운트된 live region — 마운트와 동시에 문구가 들어가면 일부 SR이 놓친다. */}
      <span role="status" aria-live="polite" aria-atomic="true" className="sr-only">
        {feedback.announce}
      </span>
    </span>
  )
}
