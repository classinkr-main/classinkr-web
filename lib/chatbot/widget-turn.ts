/**
 * 챗봇 위젯(components/ui/chatbot/useChatbotConversation.ts)이 쓰는 대화 맥락 도우미. 클라이언트에서 돌므로 서버 전용 모듈을 가져오지 않는다.
 *
 * - buildPreviousTurnPayload: 위젯 자기 메시지 상태에서 직전 한 턴(질문·직전 답의 끝 질문 종류·답 모드)을 만든다.
 *   서버 계약(lib/chatbot/conversation-context.ts, context.previousTurn)과 측정 스크립트(scripts/lib/chatbot-live-eval-checks.ts
 *   buildPreviousTurn)가 같은 방법(detectAskedSlot)으로 만든다. DB 이력은 쓰지 않는다.
 * - shouldShowUnresolvedNudge: '못 풀림 3번' 재촉 말풍선을 붙일지. 서버가 이미 되묻거나 안내한 답(clarifying_question·fallback)
 *   뒤에는 붙이지 않는다(2026-11-20 조사 G17: 거의 같은 보기 목록을 두 번 연달아 보였다).
 */
import { detectAskedSlot, type AskedSlot } from "@/lib/chatbot/follow-up"

/** 서버가 받는 직전 질문 길이 상한(conversation-context.ts PREVIOUS_TURN_QUESTION_MAX 와 같다). */
export const WIDGET_PREVIOUS_TURN_QUESTION_MAX = 200

export interface WidgetTurnMessage {
  role: "assistant" | "user"
  content: string
  /** 서버 답(meta)에서 받은 답 모드. 위젯이 붙인 재촉·오류 말풍선에는 없다. */
  answerMode?: string
}

export interface PreviousTurnPayload {
  question: string
  askedSlot?: AskedSlot
  answerMode?: string
}

/**
 * 가장 최근 사용자 질문과 그 질문에 서버가 준 답으로 직전 턴을 만든다. 마지막 질문이 답을 받지 못했으면(오류·시간 초과) 없다.
 * 위젯이 붙인 재촉 말풍선(answerMode 없음)은 건너뛴다.
 */
export function buildPreviousTurnPayload(messages: readonly WidgetTurnMessage[]): PreviousTurnPayload | undefined {
  let lastUser = -1
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    if (messages[index].role === "user") {
      lastUser = index
      break
    }
  }
  if (lastUser < 0) return undefined
  const answer = messages.slice(lastUser + 1).find((message) => message.role === "assistant" && Boolean(message.answerMode))
  const question = messages[lastUser].content.replace(/\s+/g, " ").trim().slice(0, WIDGET_PREVIOUS_TURN_QUESTION_MAX)
  if (!answer || !question) return undefined
  const askedSlot = detectAskedSlot(answer.content)
  return { question, ...(askedSlot ? { askedSlot } : {}), answerMode: answer.answerMode }
}

/** 못 풀림이 이어질 때 위젯이 재촉 말풍선을 붙일지. 서버가 되묻거나(clarifying_question) 안내 답(fallback)을 냈으면 붙이지 않는다. */
export function shouldShowUnresolvedNudge(input: {
  streak: number
  threshold: number
  needsHandoff?: boolean
  answerMode?: string
}) {
  if (input.streak < input.threshold || input.needsHandoff) return false
  return input.answerMode !== "clarifying_question" && input.answerMode !== "fallback"
}
