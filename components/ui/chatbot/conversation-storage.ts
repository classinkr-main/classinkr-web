// 챗봇 대화 복원 저장(CX-02). 탭 하나에만 남는 sessionStorage 에 최근 대화를 30분 동안 둔다.
//
// - 새로고침·같은 탭 이동·/checkout 왕복(위젯이 언마운트된다) 뒤에도 대화가 이어지고, 탭을 닫으면 사라진다.
//   localStorage 는 쓰지 않는다(학원 공용 PC).
// - 쓰는 때: 턴이 끝난 뒤·새 대화·되돌리기(위젯 훅이 정한다). 스트리밍 중의 미완성 글은 쓰지 않는다.
// - 남기는 것: 환영을 뺀 최근 20개, 글은 2000자까지. 사용자 글과 상담 요약은 redactPii 로 가리고 한국어 표기([전화번호] 등)로 바꾼 뒤 남긴다(복원 화면에도 가린 글).
//   출처는 제목·소제목·경로만, 추천 칩은 마지막 답만. 다시 시도 버튼·오류 말풍선·끊긴 부분 답·카드 열림 상태는 남기지 않는다.
// - 마지막 활동 뒤 30분(문의폼 요약 전달 CONTACT_PREFILL 과 같은 시간)이 지나면 세션 id 와 함께 버린다.
// - 모든 접근은 browser-storage 도우미가 감싼다. 저장이 막히면 복원 없이 메모리로만 동작한다.
import { readBrowserStorage, removeBrowserStorage, writeBrowserStorage } from "@/lib/chatbot/browser-storage"
import { redactPii } from "@/lib/chatbot/pii"
import { localizeRedactionPlaceholders } from "@/components/ui/chatbot/consultation-draft"
import type { ChatbotSource, ChatMessage, HandoffIntent } from "@/components/ui/chatbot/types"

export const CHATBOT_CONVERSATION_STORAGE_KEY = "classinkr.chatbot.conversation.v1"
export const CHATBOT_CONVERSATION_TTL_MS = 30 * 60 * 1000
export const CHATBOT_CONVERSATION_MAX_MESSAGES = 20
export const CHATBOT_CONVERSATION_MAX_CONTENT = 2000
const MAX_SOURCES = 5
const MAX_SUGGESTIONS = 6
const MAX_ID_LENGTH = 200
// 저장한 시각이 지금보다 이만큼 넘게 뒤면(시계가 크게 틀린 값) 믿지 않는다.
const FUTURE_SKEW_MS = 5 * 60 * 1000

export interface StoredConversation {
    sessionId?: string
    // 세션을 받은 챗봇 식별값의 지문(fingerprintAnonymousId). 식별값이 바뀌면(동의 철회 등) 세션을 이어 쓰지 않는다.
    sessionOwner?: string
    messages: ChatMessage[]
    lastActiveAt: number
}

interface StoredConversationRecord {
    v: 1
    savedAt: number
    lastActiveAt: number
    sessionId?: string
    sessionOwner?: string
    messages: ChatMessage[]
}

/** 챗봇 식별값을 그대로 남기지 않으려고 쓰는 짧은 지문(FNV-1a 32비트). 같은 값인지 견주는 데만 쓴다. */
export function fingerprintAnonymousId(anonymousId: string) {
    let hash = 0x811c9dc5
    for (let index = 0; index < anonymousId.length; index += 1) {
        hash ^= anonymousId.charCodeAt(index)
        hash = Math.imul(hash, 0x01000193)
    }
    return (hash >>> 0).toString(16).padStart(8, "0")
}

function clip(value: string) {
    return value.slice(0, CHATBOT_CONVERSATION_MAX_CONTENT)
}

function asString(value: unknown, max = MAX_ID_LENGTH) {
    return typeof value === "string" && value.trim() ? value.slice(0, max) : undefined
}

function toStoredSources(sources: unknown): ChatbotSource[] | undefined {
    if (!Array.isArray(sources)) return undefined
    const kept = sources
        .map((source): ChatbotSource | null => {
            if (!source || typeof source !== "object") return null
            const { title, heading, urlPath } = source as Partial<ChatbotSource>
            const safeTitle = asString(title, 300)
            const safePath = asString(urlPath, 500)
            // 사이트 안 경로만 남긴다 — 복원한 출처 링크가 바깥 주소로 가지 않게.
            if (!safeTitle || !safePath || !safePath.startsWith("/") || safePath.startsWith("//")) return null
            const safeHeading = asString(heading, 300)
            return { title: safeTitle, ...(safeHeading ? { heading: safeHeading } : {}), urlPath: safePath, category: "", excerpt: "", score: 0 }
        })
        .filter((source): source is ChatbotSource => source !== null)
        .slice(0, MAX_SOURCES)
    return kept.length > 0 ? kept : undefined
}

function toStoredSuggestions(value: unknown): string[] | undefined {
    if (!Array.isArray(value)) return undefined
    const kept = value
        .filter((question): question is string => typeof question === "string" && question.trim().length > 0)
        .map((question) => question.trim().slice(0, 300))
        .slice(0, MAX_SUGGESTIONS)
    return kept.length > 0 ? kept : undefined
}

function toHandoffIntent(value: unknown): HandoffIntent | undefined {
    return value === "demo" || value === "support" ? value : undefined
}

// 메시지 하나를 저장 꼴로 줄인다. 저장할 때와 읽을 때 같은 함수를 거쳐, 손댄 저장값도 같은 규칙으로 걸러진다.
function toStoredMessage(input: unknown, keepSuggestions: boolean): ChatMessage | null {
    if (!input || typeof input !== "object") return null
    const message = input as Partial<ChatMessage>
    const id = asString(message.id)
    if (!id || id === "welcome") return null
    if (message.role !== "user" && message.role !== "assistant") return null
    if (typeof message.content !== "string") return null
    // 오류 말풍선과 끊긴 부분 답은 남기지 않는다 — 복원하면 다시 시도 버튼 없이 완성된 답처럼 보인다.
    if (message.errorKind || message.interrupted) return null

    if (message.role === "user") {
        const content = clip(localizeRedactionPlaceholders(redactPii(message.content)))
        return content.trim() ? { id, role: "user", content } : null
    }

    const stored: ChatMessage = { id, role: "assistant", content: clip(message.content) }
    const sources = toStoredSources(message.sources)
    if (sources) stored.sources = sources
    const suggestions = keepSuggestions ? toStoredSuggestions(message.suggestedQuestions) : undefined
    stored.suggestedQuestions = suggestions ?? []
    const answerEventId = asString(message.answerEventId)
    if (answerEventId) stored.answerEventId = answerEventId
    const sessionId = asString(message.sessionId)
    if (sessionId) stored.sessionId = sessionId
    const answerMode = asString(message.answerMode, 64)
    if (answerMode) stored.answerMode = answerMode
    if (typeof message.confidence === "number" && Number.isFinite(message.confidence)) stored.confidence = message.confidence
    if (message.needsHandoff === true) stored.needsHandoff = true
    const handoffIntent = toHandoffIntent(message.handoffIntent)
    if (handoffIntent) stored.handoffIntent = handoffIntent
    if (message.showHandoffCTA === true) stored.showHandoffCTA = true
    if (typeof message.handoffSummary === "string" && message.handoffSummary.trim()) {
        stored.handoffSummary = clip(localizeRedactionPlaceholders(redactPii(message.handoffSummary)))
    }
    return stored
}

function toStoredMessages(messages: readonly unknown[]): ChatMessage[] {
    const candidates = messages.filter((message) => {
        if (!message || typeof message !== "object") return false
        const { id, errorKind, interrupted } = message as Partial<ChatMessage>
        return id !== "welcome" && !errorKind && !interrupted
    })
    const recent = candidates.slice(-CHATBOT_CONVERSATION_MAX_MESSAGES)
    let lastAssistantIndex = -1
    recent.forEach((message, index) => {
        if ((message as Partial<ChatMessage>).role === "assistant") lastAssistantIndex = index
    })
    return recent
        .map((message, index) => toStoredMessage(message, index === lastAssistantIndex))
        .filter((message): message is ChatMessage => message !== null)
}

/** 저장할 글. 남길 대화가 없으면 null(부르는 쪽이 키를 지운다). */
export function serializeConversation(
    input: { sessionId?: string; sessionOwner?: string; messages: readonly ChatMessage[] },
    now = Date.now(),
): string | null {
    const messages = toStoredMessages(input.messages)
    if (!messages.some((message) => message.role === "user")) return null
    const record: StoredConversationRecord = {
        v: 1,
        savedAt: now,
        lastActiveAt: now,
        messages,
    }
    const sessionId = asString(input.sessionId)
    if (sessionId) record.sessionId = sessionId
    const sessionOwner = asString(input.sessionOwner, 32)
    if (sessionOwner) record.sessionOwner = sessionOwner
    return JSON.stringify(record)
}

/** 저장된 글을 읽는다. 깨졌거나 꼴이 다르거나 30분이 지났으면 null. */
export function parseStoredConversation(raw: string | null | undefined, now = Date.now()): StoredConversation | null {
    if (!raw) return null
    let parsed: unknown
    try {
        parsed = JSON.parse(raw)
    } catch {
        return null
    }
    if (!parsed || typeof parsed !== "object") return null
    const record = parsed as Partial<StoredConversationRecord>
    if (record.v !== 1 || typeof record.lastActiveAt !== "number" || !Number.isFinite(record.lastActiveAt)) return null
    if (now - record.lastActiveAt > CHATBOT_CONVERSATION_TTL_MS) return null
    if (record.lastActiveAt - now > FUTURE_SKEW_MS) return null
    if (!Array.isArray(record.messages)) return null
    const messages = toStoredMessages(record.messages)
    if (!messages.some((message) => message.role === "user")) return null
    const sessionId = asString(record.sessionId)
    const sessionOwner = asString(record.sessionOwner, 32)
    return {
        messages,
        lastActiveAt: record.lastActiveAt,
        ...(sessionId ? { sessionId } : {}),
        ...(sessionOwner ? { sessionOwner } : {}),
    }
}

/** 탭 저장소에서 대화를 읽는다. 만료됐거나 깨졌으면 지우고 null. 저장소가 막혔으면 null. */
export function loadStoredConversation(now = Date.now()): StoredConversation | null {
    const raw = readBrowserStorage("session", CHATBOT_CONVERSATION_STORAGE_KEY)
    if (!raw) return null
    const conversation = parseStoredConversation(raw, now)
    if (!conversation) removeBrowserStorage("session", CHATBOT_CONVERSATION_STORAGE_KEY)
    return conversation
}

/** 대화를 저장한다. 남길 대화가 없으면 키를 지운다. 저장소가 막혔으면 false. */
export function saveStoredConversation(
    input: { sessionId?: string; sessionOwner?: string; messages: readonly ChatMessage[] },
    now = Date.now(),
): boolean {
    const serialized = serializeConversation(input, now)
    if (!serialized) {
        removeBrowserStorage("session", CHATBOT_CONVERSATION_STORAGE_KEY)
        return true
    }
    return writeBrowserStorage("session", CHATBOT_CONVERSATION_STORAGE_KEY, serialized)
}

export function clearStoredConversation() {
    removeBrowserStorage("session", CHATBOT_CONVERSATION_STORAGE_KEY)
}
