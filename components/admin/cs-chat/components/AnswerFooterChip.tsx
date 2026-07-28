"use client"

import type { ReactNode } from "react"

import { cn } from "@/lib/utils"

// AI 답변 카드 하단의 가로 푸터 칩 — Disclosure(세로 아코디언 3단)를 대체한다.
// 기본은 중립, 활성(펼침) 상태만 옅은 서피스로 표시한다.
export default function AnswerFooterChip({
  active,
  onClick,
  icon,
  children,
}: {
  active: boolean
  onClick: () => void
  icon: ReactNode
  children: ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex h-8 items-center gap-1.5 rounded-md px-2.5 text-[11px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#084734]",
        active ? "bg-[#F6F5F4] text-[#111110]" : "text-[#615D59] hover:bg-[#F6F5F4] hover:text-[#31302E]"
      )}
    >
      {icon}
      {children}
    </button>
  )
}
