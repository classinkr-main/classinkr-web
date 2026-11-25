// 대화 목록에서 무엇을 보이고 어디에 맞출지 정하는 순수 함수(CX-12·CX-03·CX-19·CX-13). DOM 을 만지지 않는다.
import { FOLLOW_UP_SUGGESTION_LIMIT, STARTER_SUGGESTION_LIMIT } from "@/components/ui/chatbot/constants"
import type { ChatbotSource, ChatMessage } from "@/components/ui/chatbot/types"

/** layout 애니메이션을 켜 두는 최근 말풍선 수(지금 질문과 그 답). 오래된 말풍선은 끄고 재지 않는다(CX-13). */
export const RECENT_LAYOUT_MESSAGE_COUNT = 2

/** 마지막 사용자 질문의 자리. 질문이 없으면 -1. 이 뒤의 말풍선이 '지금 턴'이다. */
export function findCurrentTurnStart(messages: readonly Pick<ChatMessage, "role">[]): number {
    for (let index = messages.length - 1; index >= 0; index -= 1) {
        if (messages[index].role === "user") return index
    }
    return -1
}

/**
 * 상담 연결 카드와 같은 뜻의 칩(담당자·상담원에게 이어 달라는 말). 카드가 이미 있는 답에서는 겹치므로 뺀다(CX-03).
 * 예: '담당자 상담으로 이어주세요', '상담원 연결해 주세요', '담당자에게 바로 물어보기'. '도입 상담'처럼 영업 상담을 묻는 칩은 남긴다.
 */
const HANDOFF_MEANING_CHIP = /^(?:담당자|상담원)(?:에게|한테)?\s*(?:상담으로\s*)?(?:바로\s*)?(?:연결|이어|물어)/

export function isHandoffMeaningChip(question: string): boolean {
    return HANDOFF_MEANING_CHIP.test(question.trim())
}

/**
 * 말풍선 아래에 보일 추천 칩. 칩은 지금 턴(마지막 질문 뒤)의 답에만 둔다 — 지난 답의 칩이 쌓여
 * 누를 수 있는 옛 칩이 남지 않게 한다(CX-12). 환영 칩은 아직 질문이 없을 때만 보인다.
 */
export function resolveVisibleSuggestions(
    message: Pick<ChatMessage, "id" | "role" | "suggestedQuestions" | "showHandoffCTA">,
    { isCurrentTurn }: { isCurrentTurn: boolean }
): string[] {
    if (message.role !== "assistant" || !isCurrentTurn) return []
    const questions = message.suggestedQuestions ?? []
    const visible = message.showHandoffCTA ? questions.filter((question) => !isHandoffMeaningChip(question)) : questions
    return visible.slice(0, message.id === "welcome" ? STARTER_SUGGESTION_LIMIT : FOLLOW_UP_SUGGESTION_LIMIT)
}

/** 누를 수 있는 출처만 남긴다. 주소(urlPath)가 없거나 비어 있는 출처(복원 저장에서 빠진 경우 등)는 건너뛴다(CX-19). */
export function navigableSources(sources: readonly ChatbotSource[] | undefined): ChatbotSource[] {
    return (sources ?? []).filter(
        (source) => typeof source?.urlPath === "string" && /^(?:\/|https?:\/\/)\S/.test(source.urlPath.trim())
    )
}

/**
 * 새 답을 목록 위쪽에 맞출 때 기준으로 삼을 말풍선 id. 답을 낳은 질문 말풍선을 맞춰 질문과 답 머리가 함께 보이게 한다(CX-12).
 * 그 앞에 질문이 없으면(위젯이 붙인 말풍선 등) null — 부르는 쪽이 답 말풍선 자체를 쓴다.
 */
export function findQuestionAnchorId(messages: readonly Pick<ChatMessage, "id" | "role">[], answerId: string): string | null {
    const answerIndex = messages.findIndex((message) => message.id === answerId)
    if (answerIndex <= 0) return null
    for (let index = answerIndex - 1; index >= 0; index -= 1) {
        if (messages[index].role === "user") return messages[index].id
    }
    return null
}

/** 이 말풍선에 layout 애니메이션을 켤지. 최근 말풍선만 켠다(CX-13). */
export function shouldAnimateMessageLayout(index: number, total: number): boolean {
    return index >= total - RECENT_LAYOUT_MESSAGE_COUNT
}

/** '새 답변 ↓' 판단에 쓰는 목록 끝의 지문. 끝 말풍선이 바뀌거나 글이 늘면 달라진다. */
export function latestMessageSignature(messages: readonly Pick<ChatMessage, "id" | "content">[]): string {
    const last = messages[messages.length - 1]
    return last ? `${messages.length}:${last.id}:${last.content.length}` : "0"
}
