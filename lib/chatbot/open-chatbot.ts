export const CHATBOT_OPEN_EVENT = "classin:chatbot-open"

export type ChatbotOpenSource = "button" | "teaser" | "cta"
export type ChatbotOpenIntent = "demo" | "support"

export interface ChatbotOpenInput {
  source: ChatbotOpenSource
  prefill?: string
  intent?: ChatbotOpenIntent
}

export interface ChatbotOpenDetail {
  source: ChatbotOpenSource
  prefill?: string
  intent?: ChatbotOpenIntent
}

export function buildChatbotOpenDetail(input: ChatbotOpenInput): ChatbotOpenDetail {
  const detail: ChatbotOpenDetail = { source: input.source }
  const prefill = input.prefill?.trim()
  if (prefill) detail.prefill = prefill
  if (input.intent) detail.intent = input.intent
  return detail
}

// 클라이언트에서만 호출된다(서버에선 no-op). FloatingChatbot 이 CHATBOT_OPEN_EVENT 를 구독한다.
export function openChatbot(input: ChatbotOpenInput): void {
  if (typeof window === "undefined") return
  window.dispatchEvent(
    new CustomEvent<ChatbotOpenDetail>(CHATBOT_OPEN_EVENT, {
      detail: buildChatbotOpenDetail(input),
    })
  )
}
