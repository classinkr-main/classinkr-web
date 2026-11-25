/**
 * 코파일럿 대화 이력 조립(IC-01·IC-25). generate 라우트와 회귀 평가가 같은 규칙을 쓴다. 순수 함수 — 서버·브라우저 어디서나 쓴다.
 *
 * 규칙
 * - 맥락 비우기 경계(role system, metadata.kind 'copilot_context_reset') 이후의 글만 쓴다. 경계가 여러 개면 마지막 경계 뒤다.
 * - 사용자 질문은 모두(최근 8턴 안에서), 답은 '사람이 쓴 승인본'만 넣는다:
 *   approved 이면서 교정본이 있고 AI 원문과 다르며, 즉시 승인(quick_approved) 라벨이 없는 것.
 *   AI 원문을 그대로 받은 행은 사람이 확인한 정답이 아니라서 이력(모델의 근거)에서 뺀다.
 * - 미검토 초안(pending)·수정 요청·사용 안 함은 넣지 않는다.
 */
import type { InternalCsChatTurn } from "@/lib/internal-cs-chat/gemini"
import { isUsableApprovedAnswer } from "@/lib/internal-cs-chat/review-guard"

export const CONTEXT_RESET_KIND = "copilot_context_reset"
export const MAX_HISTORY_TURNS = 8

export interface HistoryMessage {
  id?: string
  role: string
  content: string
  review_state: string
  corrected_content: string | null
  feedback_labels?: string[] | null
  metadata?: Record<string, unknown> | null
}

export function isContextResetMessage(message: Pick<HistoryMessage, "role" | "metadata">) {
  return message.role === "system" && message.metadata?.kind === CONTEXT_RESET_KIND
}

/** 마지막 경계 뒤의 메시지만(경계가 없으면 전체). 경계 행 자체는 포함하지 않는다. */
export function messagesAfterLastContextReset<T extends HistoryMessage>(messages: readonly T[]): T[] {
  let lastBoundary = -1
  messages.forEach((message, index) => {
    if (isContextResetMessage(message)) lastBoundary = index
  })
  return messages.slice(lastBoundary + 1) as T[]
}

/** 사람이 확인해 쓴 승인본인지(이력·회귀 기준으로 쓸 수 있는지). */
export function isHumanApprovedAnswer(message: HistoryMessage) {
  return isUsableApprovedAnswer(message)
}

export function buildApprovedHistory(messages: readonly HistoryMessage[]): InternalCsChatTurn[] {
  return messagesAfterLastContextReset(messages)
    .filter((message) => message.role === "user" || isHumanApprovedAnswer(message))
    .slice(-MAX_HISTORY_TURNS)
    .map((message) => ({
      role: message.role === "assistant" ? ("model" as const) : ("user" as const),
      text: message.role === "assistant" ? (message.corrected_content as string) : message.content,
    }))
}
