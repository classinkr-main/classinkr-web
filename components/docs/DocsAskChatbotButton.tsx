"use client"

import type { ReactNode } from "react"

import { openChatbot } from "@/lib/chatbot/open-chatbot"

interface DocsAskChatbotButtonProps {
  prefill?: string
  className?: string
  children: ReactNode
}

// 가이드에서 챗봇을 support 인텐트로 연다 — FloatingChatbot 이 CHATBOT_OPEN_EVENT 를 구독한다.
// 휴대폰에서 쿠키 배너가 챗봇을 가리고 있으면 열림은 예약되고, ConsentBanner 가 같은 이벤트를 받아
// '쿠키 선택 뒤 챗봇이 열려요'를 보이며 포커스를 가져간다(CX-05). 여기서 배너를 따로 살피지 않는다.
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
