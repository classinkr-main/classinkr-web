"use client"

import { useCallback, useRef, useState, type MouseEvent } from "react"
import { Check, Copy } from "lucide-react"

import { formatKoreanPhone } from "@/lib/crm/phone"

interface CrmContactValueProps {
  value: string | null | undefined
  className?: string
}

// 고객 연락처 셀: 전화번호는 010-XXXX-XXXX 로 표시하고, 클릭하면 표시값을 클립보드에 복사한다.
// 부모가 클릭 가능한 카드/버튼이어도 전파를 막아 복사만 동작하도록 한다.
export default function CrmContactValue({ value, className = "" }: CrmContactValueProps) {
  const [copied, setCopied] = useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const raw = value?.trim() ?? ""
  const display = raw ? formatKoreanPhone(raw) : "-"

  const handleCopy = useCallback(
    async (event: MouseEvent<HTMLButtonElement>) => {
      event.stopPropagation()
      event.preventDefault()
      if (!raw) return
      try {
        await navigator.clipboard.writeText(display)
        setCopied(true)
        if (timerRef.current) clearTimeout(timerRef.current)
        timerRef.current = setTimeout(() => setCopied(false), 1400)
      } catch {
        // 클립보드 접근 거부(권한·비보안 컨텍스트 등)는 조용히 무시.
      }
    },
    [display, raw]
  )

  if (!raw) {
    return <span className={`block truncate text-[12px] text-[#1a1a1a]/42 ${className}`}>-</span>
  }

  return (
    <button
      type="button"
      onClick={handleCopy}
      title={copied ? "복사됨" : "클릭하여 복사"}
      aria-label={`연락처 ${display} 복사`}
      className={`group/contact flex w-fit max-w-full items-center gap-1 text-[12px] text-[#1a1a1a]/42 transition-colors hover:text-[#084734] ${className}`}
    >
      <span className="truncate">{display}</span>
      {copied ? (
        <Check className="h-3 w-3 shrink-0 text-[#084734]" />
      ) : (
        <Copy className="h-3 w-3 shrink-0 opacity-45 transition-opacity group-hover/contact:opacity-80" />
      )}
    </button>
  )
}
