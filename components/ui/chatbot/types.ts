// 챗봇 위젯(components/ui/FloatingChatbot.tsx 와 이 폴더의 모듈)이 함께 쓰는 메시지·스트림 타입.
import type { WidgetTurnErrorKind } from "@/lib/chatbot/widget-turn"

export type HandoffIntent = "demo" | "support"

export interface ChatbotSource {
    title: string
    heading?: string
    urlPath: string
    category: string
    excerpt: string
    score: number
}

export interface ChatbotStarterQuestionsResponse {
    questions?: unknown
    warning?: string
}

export interface ChatMessage {
    id: string
    role: "assistant" | "user"
    content: string
    sources?: ChatbotSource[]
    suggestedQuestions?: string[]
    answerEventId?: string
    confidence?: number
    needsHandoff?: boolean
    handoffIntent?: HandoffIntent
    showHandoffCTA?: boolean
    retryQuestion?: string
    // 서버 답(meta)의 답 모드. 다음 질문에 직전 턴(context.previousTurn)으로 함께 보낸다. 위젯이 붙인 말풍선에는 없다.
    answerMode?: string
    // 이 답을 받은 서버 세션. 피드백·상담 프로필은 현재 세션이 아니라 이 값을 쓴다 — 새 대화·되돌리기·복원 뒤에도
    // answerEventId 와 짝이 맞는다(CX-02).
    sessionId?: string
    // 위젯이 붙인 오류 말풍선, 또는 meta 없이 끝난 부분 답(interrupted)의 오류 종류(CX-01·CX-08). 복원 저장에서는 뺀다.
    errorKind?: WidgetTurnErrorKind
    // 부분 답을 받다가 끊겼다. 받은 글은 두고 아래에 '중간에 끊겼어요'를 붙인다(CX-08).
    interrupted?: boolean
    // 상담 연결 카드가 생길 때 고정한 상담 요약(B2). 있으면 복원 저장에 가린 글로 남긴다.
    handoffSummary?: string
}

// /api/chatbot/query/stream 의 NDJSON 이벤트(서버 ChatbotStreamEvent 와 구조 일치).
// server-only 모듈을 클라이언트에서 import 하지 않기 위해 형태만 로컬에 둔다.
export interface ChatbotStreamMeta {
    answerMode?: string
    confidence?: number
    needsHandoff?: boolean
    unresolved?: boolean
    handoffIntent?: HandoffIntent
    sources?: ChatbotSource[]
    suggestedQuestions?: string[]
    sessionId?: string
    answerEventId?: string
    warning?: string
}

export type ChatbotStreamEvent =
    | { type: "delta"; text: string }
    | { type: "replace"; answer: string }
    | { type: "meta"; meta: ChatbotStreamMeta }
    | { type: "error"; error: string }
