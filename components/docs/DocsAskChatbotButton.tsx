"use client"

import type { ReactNode } from "react"

import { openChatbot } from "@/lib/chatbot/open-chatbot"

interface DocsAskChatbotButtonProps {
  prefill?: string
  className?: string
  children: ReactNode
}

// 가이드에서 챗봇을 support 인텐트로 연다 — FloatingChatbot 이 CHATBOT_OPEN_EVENT 를 구독한다.
export function DocsAskChatbotButton({
  prefill,
  className,
  children,
}: DocsAskChatbotButtonProps) {
  return (
    <button
      type="button"
      className={className}
      onClick={() => openChatbot({ source: "cta", intent: "support", prefill })}
    >
      {children}
    </button>
  )
}
