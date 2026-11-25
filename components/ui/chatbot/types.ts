// 챗봇 위젯(components/ui/FloatingChatbot.tsx 와 이 폴더의 모듈)이 함께 쓰는 메시지·스트림 타입.

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
