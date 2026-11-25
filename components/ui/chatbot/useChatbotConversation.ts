"use client"

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type RefObject } from "react"

import { getChannelTalkAnonymousId } from "@/lib/channel-talk"
import { CLASSIN_POSITIONING } from "@/lib/classin-positioning"
import { trackEvent } from "@/lib/analytics"
import { resolvePageContext, mergeStarters } from "@/lib/chatbot/page-context"
import { chatbotRequestReferrer, sanitizeChatbotPageUrl, sanitizeChatbotUtm } from "@/lib/chatbot/pii"
import {
    buildPreviousTurnPayload,
    classifyWidgetTurnError,
    findLastServerAnswer,
    isRetryableWidgetError,
    shouldOfferHandoffChip,
    shouldShowUnresolvedNudge,
    parseRetryAfterSeconds,
    WIDGET_HANDOFF_CHIP,
    WIDGET_INTERRUPTED_NOTICE,
    WIDGET_RATE_LIMIT_DEFAULT_SECONDS,
    WIDGET_TURN_ERROR_COPY,
    WidgetTurnError,
    type PreviousTurnPayload,
} from "@/lib/chatbot/widget-turn"
import { playSendSound, playReceiveSound } from "@/lib/chatbot/sound"
import { STARTER_SUGGESTION_LIMIT } from "@/components/ui/chatbot/constants"
import {
    clearStoredConversation,
    fingerprintAnonymousId,
    loadStoredConversation,
    saveStoredConversation,
} from "@/components/ui/chatbot/conversation-storage"
import { sanitizeVisibleAssistantText } from "@/components/ui/chatbot/MessageList"
import type {
    ChatbotStarterQuestionsResponse,
    ChatbotStreamEvent,
    ChatMessage,
} from "@/components/ui/chatbot/types"

const UNRESOLVED_STREAK_THRESHOLD = 3
const CHATBOT_REQUEST_TIMEOUT_MS = 14_000
// 첫 글자가 이만큼 늦으면 대기 말풍선에 '조금 늦어지고 있어요'를 보이고 한 번 알린다(CX-01).
const CHATBOT_SLOW_NOTICE_MS = 6_000

type PageContext = ReturnType<typeof resolvePageContext>

function shouldUseDeepConsultationIcon(text: string) {
    return /상담|컨설팅|도입\s*(상담|문의|검토)|견적|담당자|시연|데모|장애|오류|AS|A\/S/i.test(text)
}

function makeId() {
    return `${Date.now()}-${Math.random().toString(16).slice(2)}`
}

// NDJSON 한 줄을 스트림 이벤트로 파싱한다. 빈 줄·깨진 JSON 은 null(무시).
function parseStreamEvent(line: string): ChatbotStreamEvent | null {
    const trimmed = line.trim()
    if (!trimmed) return null
    try {
        return JSON.parse(trimmed) as ChatbotStreamEvent
    } catch {
        return null
    }
}

/*
 * 추천 질문 API 결과. 경로와 관계없는 목록이라 페이지를 불러온 동안(모듈) 한 번만 받는다. 창을 처음 열 때 받고,
 * 경로마다 그 페이지 칩과 합친다. 예전에는 창을 열지 않아도 페이지마다 no-store 로 미리 받았다(CX-13).
 */
let starterQuestionsRequest: Promise<string[]> | null = null
let starterQuestionsCache: string[] | null = null

function loadStarterQuestionsOnce(): Promise<string[]> {
    if (starterQuestionsCache) return Promise.resolve(starterQuestionsCache)
    // Referer 에 주소 전체(쿼리 포함)가 실리지 않게 정화한 주소를 준다(CX-04·C4).
    starterQuestionsRequest ??= fetch("/api/chatbot/recommended-questions", { cache: "no-store", referrer: chatbotRequestReferrer() })
        .then((response) => response.json() as Promise<ChatbotStarterQuestionsResponse>)
        .then((data) => {
            const questions = Array.isArray(data.questions)
                ? data.questions
                    .filter((question): question is string => typeof question === "string")
                    .map((question) => question.trim())
                    .filter(Boolean)
                    .slice(0, STARTER_SUGGESTION_LIMIT)
                : []
            starterQuestionsCache = questions
            return questions
        })
        .catch(() => {
            // 네트워크 실패 — 다음에 열 때 다시 받는다.
            starterQuestionsRequest = null
            return []
        })
    return starterQuestionsRequest
}

function buildWelcomeMessage(pageContext: PageContext, starterQuestions: readonly string[] | null): ChatMessage {
    return {
        id: "welcome",
        role: "assistant",
        content: CLASSIN_POSITIONING.chatbot.welcome,
        suggestedQuestions: mergeStarters(pageContext.starters, [...(starterQuestions ?? [])], STARTER_SUGGESTION_LIMIT),
    }
}

function sameQuestions(left: readonly string[] | undefined, right: readonly string[]) {
    return (left?.length ?? 0) === right.length && right.every((question, index) => left?.[index] === question)
}

function countUserTurns(messages: readonly ChatMessage[]) {
    return messages.filter((message) => message.role === "user").length
}

// 분석 이벤트에는 질문 글 대신 대화 길이 구간만 싣는다.
function bucketTurns(count: number) {
    if (count <= 1) return "1"
    if (count <= 3) return "2-3"
    return "4+"
}

// 다시 시도 버튼은 마지막 실패에만 둔다. 새 질문을 보내면 앞 실패의 버튼을 지운다(말풍선 글은 남긴다).
function withoutRetry(message: ChatMessage): ChatMessage {
    if (!message.retryQuestion) return message
    const next = { ...message }
    delete next.retryQuestion
    return next
}

/**
 * 답을 받는 중에 새 대화를 누르면 되돌리기 사본에 남길 대화를 정리한다. 받던 부분 답은 '중간에 끊김'으로,
 * 아직 아무 글도 받지 못했으면 '답을 받지 못함' 말풍선으로 두어 되돌린 뒤에 다시 시도할 수 있게 한다.
 */
function settleInFlightTurn(messages: readonly ChatMessage[]): ChatMessage[] {
    let lastUser = -1
    for (let index = messages.length - 1; index >= 0; index -= 1) {
        if (messages[index].role === "user") {
            lastUser = index
            break
        }
    }
    if (lastUser < 0) return [...messages]
    const question = messages[lastUser].content
    const tail = messages.slice(lastUser + 1)
    if (tail.some((message) => message.role === "assistant" && message.answerMode)) return [...messages]
    const partial = tail.find((message) => message.role === "assistant" && !message.errorKind && message.content.trim())
    if (partial) {
        return messages.map((message) =>
            message.id === partial.id
                ? { ...message, interrupted: true, errorKind: "interrupted" as const, retryQuestion: question }
                : message
        )
    }
    return [
        ...messages.slice(0, lastUser + 1),
        {
            id: makeId(),
            role: "assistant",
            content: WIDGET_TURN_ERROR_COPY.interrupted,
            suggestedQuestions: [],
            errorKind: "interrupted",
            retryQuestion: question,
        },
    ]
}

interface NewChatUndoSnapshot {
    messages: ChatMessage[]
    sessionId?: string
    sessionOwner: string | null
    isDeepConsultation: boolean
    unresolvedStreak: number
}

interface UseChatbotConversationOptions {
    pathname: string | null
    hidden: boolean
    // 창이 열려 있는지. 추천 질문은 처음 열 때 받고, 창을 닫으면 새 대화 되돌리기 띠를 거둔다.
    isOpen: boolean
    // 새 답 말풍선을 목록 위쪽에 맞출 대상. 스크롤은 셸이 맡고, 보내기가 대상 id 를 적어 둔다.
    pendingAssistantScrollIdRef: RefObject<string | null>
    // 보내기 직전에 부른다. 셸이 목록을 맨 아래로 따라가게 두고, 새 질문이면(clearDraft) 입력창을 비운다.
    // 다시 시도는 쓰던 글을 지우지 않는다.
    onBeforeSend?: (options: { clearDraft: boolean }) => void
}

// 대화 상태(메시지·세션·보내기·다시 시도·스트림 파싱·오류·스크린 리더 안내·추천 질문·요청 context·새 대화·복원)를 맡는다.
export function useChatbotConversation({
    pathname,
    hidden,
    isOpen,
    pendingAssistantScrollIdRef,
    onBeforeSend,
}: UseChatbotConversationOptions) {
    const pageContext = useMemo(() => resolvePageContext(pathname), [pathname])
    // 새로고침·같은 탭 이동 뒤 30분 안이면 앞 대화를 잇는다(창은 닫힌 채). 환영은 지금 페이지로 다시 만든다.
    const [restored] = useState(() => loadStoredConversation())
    const [sessionId, setSessionId] = useState<string | undefined>(restored?.sessionId)
    const [isSending, setIsSending] = useState(false)
    const [isStreaming, setIsStreaming] = useState(false)
    const [isSlow, setIsSlow] = useState(false)
    const [isDeepConsultation, setIsDeepConsultation] = useState(() =>
        Boolean(restored?.messages.some((message) => message.showHandoffCTA))
    )
    const [unresolvedStreak, setUnresolvedStreak] = useState(0)
    const [srAnnouncement, setSrAnnouncement] = useState("")
    // 429 뒤 다시 보낼 수 있는 시각과 남은 초. 남은 동안 보내기·다시 시도를 막는다.
    const [cooldownUntil, setCooldownUntil] = useState<number | null>(null)
    const [cooldownSeconds, setCooldownSeconds] = useState(0)
    const [undoSnapshot, setUndoSnapshot] = useState<NewChatUndoSnapshot | null>(null)
    const [messages, setMessages] = useState<ChatMessage[]>(() => [
        buildWelcomeMessage(resolvePageContext(pathname), starterQuestionsCache),
        ...(restored?.messages ?? []),
    ])

    const firstQuestionSentRef = useRef(false)
    // 요청 세대 번호. 새 대화·되돌리기·새 요청이 올리면, 그 전 요청이 늦게 보낸 조각(delta·meta)은 버린다.
    const requestSeqRef = useRef(0)
    const abortRef = useRef<AbortController | null>(null)
    // 지금 sessionId 를 받은 챗봇 식별값의 지문. 식별값이 바뀌면(동의 철회 등) 그 세션을 이어 쓰지 않는다.
    const sessionOwnerRef = useRef<string | null>(restored?.sessionOwner ?? null)
    // 다음 커밋 뒤(보내는 중이 아닐 때) 복원 저장을 쓸지 지울지.
    const persistRef = useRef<"save" | "clear" | null>(null)
    const restoredTrackedRef = useRef(false)
    const announceTimerRef = useRef<number | undefined>(undefined)

    // 창을 닫으면 되돌리기 띠를 거둔다(렌더 중 이전 값과 견줘 바꾸는 React 권장 꼴).
    const [wasOpen, setWasOpen] = useState(isOpen)
    if (wasOpen !== isOpen) {
        setWasOpen(isOpen)
        if (!isOpen && undoSnapshot) setUndoSnapshot(null)
    }

    const context = useMemo(
        () => {
            // 쿼리의 토큰·이메일이 챗봇 서버와 상담 수신함으로 가지 않게 정화한다(CX-04·C4). 추적 제외 경로는 경로만 보낸다.
            // utm 도 같은 경계다: 이메일 같은 개인정보 값은 버리고 추적 제외 경로에서는 보내지 않는다. Referer 헤더는 fetch 의
            // referrer(chatbotRequestReferrer)로 같은 정화 주소만 싣는다.
            const pageUrl = typeof window === "undefined" ? undefined : sanitizeChatbotPageUrl(window.location.href)
            const utm =
                typeof window === "undefined"
                    ? {}
                    : sanitizeChatbotUtm(new URLSearchParams(window.location.search), window.location.pathname)

            return {
                channel: "web",
                path: pathname,
                pageUrl,
                utm,
                showSources: true,
            }
        },
        [pathname]
    )

    // 스크린 리더 안내. 비운 뒤 넣어 같은 문구가 이어져도 다시 읽힌다(CX-01).
    const announce = useCallback((text: string) => {
        setSrAnnouncement("")
        window.clearTimeout(announceTimerRef.current)
        announceTimerRef.current = window.setTimeout(() => setSrAnnouncement(text), 60)
    }, [])

    useEffect(() => {
        if (!restored || restoredTrackedRef.current) return
        restoredTrackedRef.current = true
        trackEvent("chatbot_conversation_restored", { turns: bucketTurns(countUserTurns(restored.messages)) })
    }, [restored])

    // hidden이어도 isOpen은 강제로 닫지 않는다 — 숨김 페이지(/pricing 등)를 잠깐
    // 거쳐도 창이 영구히 닫히지 않고, 다시 보이는 페이지로 오면 이전 열림 상태로
    // 복귀한다. 시각적 숨김은 셸(FloatingChatbot)의 `if (hidden) return null`이 담당한다.
    // 추천 질문은 창을 열 때만 받는다(페이지를 불러오기만 해서는 요청하지 않는다).
    useEffect(() => {
        if (hidden || !isOpen) return
        let cancelled = false
        void loadStarterQuestionsOnce().then((questions) => {
            if (cancelled) return
            const suggestedQuestions = buildWelcomeMessage(pageContext, questions).suggestedQuestions ?? []
            if (suggestedQuestions.length === 0) return
            setMessages((current) => {
                const welcome = current.find((message) => message.id === "welcome")
                if (!welcome || sameQuestions(welcome.suggestedQuestions, suggestedQuestions)) return current
                return current.map((message) =>
                    message.id === "welcome" ? { ...message, suggestedQuestions } : message
                )
            })
        })
        return () => {
            cancelled = true
        }
    }, [hidden, isOpen, pageContext])

    useEffect(() => {
        if (cooldownUntil === null) return
        const intervalId = window.setInterval(() => {
            const remaining = Math.ceil((cooldownUntil - Date.now()) / 1000)
            if (remaining <= 0) {
                setCooldownUntil(null)
                setCooldownSeconds(0)
                return
            }
            setCooldownSeconds(remaining)
        }, 250)
        return () => window.clearInterval(intervalId)
    }, [cooldownUntil])

    // 복원 저장: 턴이 끝난 뒤·새 대화·되돌리기 때만 쓴다(persistRef). 스트리밍 중의 미완성 글은 쓰지 않는다.
    useEffect(() => {
        const action = persistRef.current
        if (!action || isSending) return
        persistRef.current = null
        if (action === "clear") {
            clearStoredConversation()
            return
        }
        saveStoredConversation({ sessionId, sessionOwner: sessionOwnerRef.current ?? undefined, messages })
    }, [messages, sessionId, isSending])

    // 질문 하나를 서버로 보내고 답을 받는다. 새 질문과 다시 시도가 함께 쓴다. 사용자 말풍선은 부르는 쪽이 이미 목록에 두었다.
    async function runTurn({
        question,
        previousTurn,
        previousServerAnswer,
    }: {
        question: string
        previousTurn?: PreviousTurnPayload
        previousServerAnswer?: ChatMessage
    }) {
        const requestId = requestSeqRef.current + 1
        requestSeqRef.current = requestId
        const isCurrent = () => requestSeqRef.current === requestId
        abortRef.current?.abort()
        const controller = new AbortController()
        abortRef.current = controller

        setIsSending(true)
        setIsStreaming(false)
        setIsSlow(false)
        playSendSound()
        announce("답변을 찾는 중이에요")

        // 첫 토큰이 오면 그때 어시스턴트 말풍선을 만든다(그 전까지는 ThinkingIndicator 가 보인다).
        let assistantId: string | null = null
        let answerText = ""
        let gotMeta = false
        let timedOut = false
        let showHandoffAfterAnswer = false

        const slowTimer = window.setTimeout(() => {
            if (!isCurrent() || assistantId) return
            setIsSlow(true)
            announce("답변이 조금 늦어지고 있어요")
        }, CHATBOT_SLOW_NOTICE_MS)

        const ensureAssistant = () => {
            if (assistantId) return assistantId
            const id = makeId()
            assistantId = id
            pendingAssistantScrollIdRef.current = id
            setIsStreaming(true)
            setIsSlow(false)
            setMessages((current) => [...current, { id, role: "assistant", content: "" }])
            return id
        }
        const updateAssistant = (updater: (message: ChatMessage) => ChatMessage) => {
            const id = ensureAssistant()
            setMessages((current) => current.map((message) => (message.id === id ? updater(message) : message)))
        }

        let idleTimer: number | undefined
        // 데이터가 흐르는 동안에는 유휴 타임아웃을 다시 잡아 긴 응답이 중간에 끊기지 않게 한다.
        const armIdleTimer = () => {
            window.clearTimeout(idleTimer)
            idleTimer = window.setTimeout(() => {
                timedOut = true
                controller.abort()
            }, CHATBOT_REQUEST_TIMEOUT_MS)
        }

        try {
            const anonymousId = getChannelTalkAnonymousId()
            const owner = anonymousId ? fingerprintAnonymousId(anonymousId) : null
            // 서버는 anonymous_id 가 같을 때만 세션을 잇는다. 식별값이 바뀌었으면(동의 철회로 탭 단위 값이 된 경우 등)
            // 앞 세션 id 를 보내지 않는다 — 보내면 서버 답(meta)과 저장된 세션이 어긋나 피드백 짝이 깨진다.
            const requestSessionId =
                sessionId && (!sessionOwnerRef.current || sessionOwnerRef.current === owner) ? sessionId : undefined

            armIdleTimer()
            const response = await fetch("/api/chatbot/query/stream", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                // 서버는 Referer 를 chat_sessions.referrer 로 저장한다 — 기본 정책이면 같은 출처라 쿼리째 실린다(CX-04·C4).
                referrer: chatbotRequestReferrer(),
                signal: controller.signal,
                body: JSON.stringify({
                    message: question,
                    sessionId: requestSessionId,
                    anonymousId,
                    // context.path 는 문서 페이지 맥락("방금 본 내용…")에도 쓰인다.
                    // 직전 한 턴(답을 받은 가장 최근 질문·그 답이 물은 정보의 종류·답 모드)을 함께 보내 짧은 대답("휴대폰이요")·
                    // 이어 묻기("그러면 아이패드는요")를 앞 턴 주제로 답하게 한다. 서버는 DB 이력이 아니라 이 값만 쓴다(lib/chatbot/conversation-context.ts).
                    context: previousTurn ? { ...context, previousTurn } : context,
                }),
            })
            if (!isCurrent()) return

            if (!response.ok || !response.body) {
                // 서버가 준 오류 글은 화면에 쓰지 않는다 — 종류별 문구로 바꾼다.
                const detail = await response.text().catch(() => "")
                if (response.status === 429) {
                    throw new WidgetTurnError("rate_limited", {
                        detail: `HTTP 429 ${detail}`.trim(),
                        retryAfterSeconds: parseRetryAfterSeconds(response.headers.get("Retry-After")),
                    })
                }
                const rejected = response.status === 400 || response.status === 413 || response.status === 422
                throw new WidgetTurnError(rejected ? "rejected" : "server", { detail: `HTTP ${response.status} ${detail}`.trim() })
            }

            const handleEvent = (event: ChatbotStreamEvent) => {
                if (event.type === "delta") {
                    answerText += event.text
                    updateAssistant((message) => ({ ...message, content: message.content + event.text }))
                    return
                }
                if (event.type === "replace") {
                    answerText = event.answer
                    updateAssistant((message) => ({ ...message, content: event.answer }))
                    return
                }
                if (event.type === "error") {
                    throw new WidgetTurnError("server", { detail: event.error })
                }
                // meta
                gotMeta = true
                const meta = event.meta
                const answerSessionId = meta.sessionId ?? requestSessionId
                setSessionId(answerSessionId)
                sessionOwnerRef.current = owner
                if (meta.needsHandoff || meta.answerMode === "handoff") {
                    setIsDeepConsultation(true)
                }
                showHandoffAfterAnswer = Boolean(meta.needsHandoff)
                const nextStreak = meta.unresolved ? unresolvedStreak + 1 : 0
                setUnresolvedStreak(nextStreak)
                // 같은 되묻기가 두 번 이어지면 사람 연결 칩을 맨 앞에 붙인다(CX-22).
                const offerHandoffChip = shouldOfferHandoffChip({
                    previousAnswer: previousServerAnswer,
                    answer: { content: answerText, answerMode: meta.answerMode },
                    needsHandoff: meta.needsHandoff,
                })
                const suggestions = meta.suggestedQuestions ?? []
                updateAssistant((message) => ({
                    ...message,
                    sources: meta.sources ?? [],
                    suggestedQuestions: offerHandoffChip
                        ? [WIDGET_HANDOFF_CHIP, ...suggestions.filter((item) => item !== WIDGET_HANDOFF_CHIP)]
                        : suggestions,
                    answerEventId: meta.answerEventId,
                    confidence: meta.confidence,
                    needsHandoff: meta.needsHandoff,
                    handoffIntent: meta.handoffIntent,
                    showHandoffCTA: Boolean(meta.needsHandoff),
                    answerMode: meta.answerMode,
                    sessionId: answerSessionId,
                }))

                // 서버가 이미 되묻거나 안내한 답(clarifying_question·fallback) 뒤에는 거의 같은 재촉 말풍선을 또 붙이지 않는다.
                if (
                    shouldShowUnresolvedNudge({
                        streak: nextStreak,
                        threshold: UNRESOLVED_STREAK_THRESHOLD,
                        needsHandoff: meta.needsHandoff,
                        answerMode: meta.answerMode,
                    })
                ) {
                    const intent = meta.handoffIntent ?? "demo"
                    const nudge =
                        intent === "support"
                            ? "정확한 확인을 위해 오류 화면, 사용 기기, 발생 시점을 한 문장으로 알려주세요."
                            : "도입, 수업 운영, 계정/오류, 결제 중 어느 쪽인지 알려주시면 더 짧게 좁혀드릴게요."
                    setMessages((current) => [
                        ...current,
                        {
                            id: makeId(),
                            role: "assistant",
                            content: nudge,
                            suggestedQuestions: [],
                            needsHandoff: false,
                            handoffIntent: intent,
                            showHandoffCTA: false,
                        },
                    ])
                }
            }

            const reader = response.body.getReader()
            const decoder = new TextDecoder()
            let buffer = ""

            while (true) {
                const { value, done } = await reader.read()
                if (!isCurrent()) {
                    void reader.cancel().catch(() => undefined)
                    return
                }
                if (done) break
                armIdleTimer()
                buffer += decoder.decode(value, { stream: true })

                let newlineIndex: number
                while ((newlineIndex = buffer.indexOf("\n")) >= 0) {
                    const line = buffer.slice(0, newlineIndex).trim()
                    buffer = buffer.slice(newlineIndex + 1)
                    // 파싱은 따로 감싸 깨진 JSON 라인만 무시하고, 이벤트 처리(특히 error 이벤트의 throw)는
                    // 바깥 catch 로 전파시킨다.
                    const event = parseStreamEvent(line)
                    if (event) handleEvent(event)
                }
            }

            const event = parseStreamEvent(buffer)
            if (event) handleEvent(event)

            // 서버는 늘 meta(또는 error)로 끝낸다(app/api/chatbot/query/stream). meta 없이 닫혔으면 중간에 끊긴 답이다 —
            // 받은 글을 완성된 답처럼 두지 않는다(CX-08).
            if (!gotMeta) {
                throw new WidgetTurnError("interrupted", { detail: "stream closed without meta" })
            }

            const cleanText = sanitizeVisibleAssistantText(answerText)
            announce(`답변 완료: ${cleanText}${showHandoffAfterAnswer ? " 상담 연결 준비됨." : ""}`)
            playReceiveSound()
        } catch (err) {
            if (!isCurrent()) return
            const kind = classifyWidgetTurnError(err, {
                timedOut,
                online: typeof navigator === "undefined" ? undefined : navigator.onLine,
            })
            // 원래 오류 글('Failed to fetch' 등)은 콘솔에만 남긴다(CX-01).
            console.warn("[chatbot] 답변을 받지 못했어요:", kind, err)

            if (gotMeta) {
                // meta 뒤에 온 오류(드묾): 받은 답은 완성된 답이므로 그대로 둔다.
                announce(`답변 완료: ${sanitizeVisibleAssistantText(answerText)}`)
                return
            }

            const retryQuestion = isRetryableWidgetError(kind) ? question : undefined
            if (assistantId && answerText.trim()) {
                // 받은 부분 답은 지우지 않고 아래에 '중간에 끊겼어요'와 다시 시도를 붙인다(CX-08).
                updateAssistant((message) => ({
                    ...message,
                    interrupted: true,
                    errorKind: kind,
                    retryQuestion,
                    suggestedQuestions: [],
                }))
                announce(`${WIDGET_INTERRUPTED_NOTICE}. 받은 데까지 남겨 두었어요.`)
            } else {
                // 오류는 말풍선 한 곳에서만 말한다(입력창 위 띠 없음).
                const errorContent = WIDGET_TURN_ERROR_COPY[kind]
                const errorMessageId = assistantId ?? makeId()
                if (!assistantId) {
                    pendingAssistantScrollIdRef.current = errorMessageId
                }
                const errorMessage: ChatMessage = {
                    id: errorMessageId,
                    role: "assistant",
                    content: errorContent,
                    sources: [],
                    suggestedQuestions: [],
                    needsHandoff: false,
                    handoffIntent: "support",
                    showHandoffCTA: false,
                    errorKind: kind,
                    ...(retryQuestion ? { retryQuestion } : {}),
                }
                setMessages((current) =>
                    assistantId
                        ? current.map((message) => (message.id === assistantId ? errorMessage : message))
                        : [...current, errorMessage]
                )
                announce(`답변 오류: ${errorContent}`)
            }

            if (kind === "rate_limited") {
                const seconds =
                    err instanceof WidgetTurnError && err.retryAfterSeconds
                        ? err.retryAfterSeconds
                        : WIDGET_RATE_LIMIT_DEFAULT_SECONDS
                setCooldownUntil(Date.now() + seconds * 1000)
                setCooldownSeconds(seconds)
            }
        } finally {
            window.clearTimeout(idleTimer)
            window.clearTimeout(slowTimer)
            if (abortRef.current === controller) abortRef.current = null
            if (isCurrent()) {
                setIsSending(false)
                setIsStreaming(false)
                setIsSlow(false)
                persistRef.current = "save"
            }
        }
    }

    // 같은 되묻기 뒤에 붙은 사람 연결 칩을 누르면 서버로 보내지 않고 그 답 아래에 상담 연결 카드를 연다(CX-22).
    function openHandoffFromChip() {
        const target = findLastServerAnswer(messages)
        if (!target?.suggestedQuestions?.includes(WIDGET_HANDOFF_CHIP)) return false
        setMessages((current) =>
            current.map((message) =>
                message.id === target.id
                    ? {
                        ...message,
                        showHandoffCTA: true,
                        handoffIntent: message.handoffIntent ?? "support",
                        suggestedQuestions: (message.suggestedQuestions ?? []).filter((item) => item !== WIDGET_HANDOFF_CHIP),
                    }
                    : message
            )
        )
        setIsDeepConsultation(true)
        announce("상담 연결 안내를 열었어요. 아래 버튼으로 담당자에게 이어 드릴게요.")
        persistRef.current = "save"
        return true
    }

    async function sendQuestion(question: string) {
        const trimmed = question.trim()
        if (!trimmed || isSending) return
        if (cooldownSeconds > 0) {
            announce(`${cooldownSeconds}초 뒤에 다시 보낼 수 있어요`)
            return
        }
        if (trimmed === WIDGET_HANDOFF_CHIP && openHandoffFromChip()) return

        if (!firstQuestionSentRef.current) {
            firstQuestionSentRef.current = true
            trackEvent("chatbot_first_question", { path: pathname })
        }

        if (shouldUseDeepConsultationIcon(trimmed)) {
            setIsDeepConsultation(true)
        }

        // 입력창 비우기와 목록 맨 아래 따라가기는 셸이 맡는다(입력 상태는 ChatComposer, 스크롤 위치는 셸에 있다).
        onBeforeSend?.({ clearDraft: true })
        setUndoSnapshot(null)

        const userMessage: ChatMessage = {
            id: makeId(),
            role: "user",
            content: trimmed,
        }
        const previousTurn = buildPreviousTurnPayload(messages)
        const previousServerAnswer = findLastServerAnswer(messages)

        setMessages((current) => [...current.map(withoutRetry), userMessage])
        await runTurn({ question: trimmed, previousTurn, previousServerAnswer })
    }

    // 다시 시도: 같은 사용자 말풍선을 그대로 두고, 실패한 말풍선 자리에서 다시 받는다. 직전 턴도 처음 보낼 때와 같다(CX-01).
    async function retryTurn(failedMessageId: string) {
        if (isSending || cooldownSeconds > 0) return
        const failedIndex = messages.findIndex((message) => message.id === failedMessageId)
        const failed = messages[failedIndex]
        if (failedIndex < 0 || !failed.retryQuestion) return
        let userIndex = failedIndex - 1
        while (userIndex >= 0 && messages[userIndex].role !== "user") userIndex -= 1
        if (userIndex < 0) return
        const before = messages.slice(0, userIndex)

        onBeforeSend?.({ clearDraft: false })
        setUndoSnapshot(null)
        setMessages((current) => current.filter((message) => message.id !== failedMessageId))
        await runTurn({
            question: failed.retryQuestion,
            previousTurn: buildPreviousTurnPayload(before),
            previousServerAnswer: findLastServerAnswer(before),
        })
    }

    // 새 대화(CX-02): 확인 창 없이 바로 비우고, 되돌리기 띠로 복구할 수 있게 사본을 메모리에 둔다.
    // 쓰던 입력 글은 지우지 않는다. 받는 중이면 요청을 끊고 세대 번호로 늦게 온 조각을 버린다.
    // sessionId 는 비워 보낸다 — 서버가 새 id 를 발급한다. 채널톡은 다음 상담 연결 때 새 상담방을 연다.
    function startNewChat() {
        const userTurns = countUserTurns(messages)
        if (userTurns === 0) return false
        requestSeqRef.current += 1
        abortRef.current?.abort()
        abortRef.current = null

        setUndoSnapshot({
            messages: isSending ? settleInFlightTurn(messages) : messages,
            sessionId,
            sessionOwner: sessionOwnerRef.current,
            isDeepConsultation,
            unresolvedStreak,
        })
        trackEvent("chatbot_new_chat", {
            source: "header",
            turns: bucketTurns(userTurns),
            had_handoff: messages.some((message) => message.showHandoffCTA || message.needsHandoff),
            had_error: messages.some((message) => Boolean(message.errorKind)),
        })

        setMessages([buildWelcomeMessage(pageContext, starterQuestionsCache)])
        setSessionId(undefined)
        sessionOwnerRef.current = null
        setIsDeepConsultation(false)
        setUnresolvedStreak(0)
        setIsSending(false)
        setIsStreaming(false)
        setIsSlow(false)
        pendingAssistantScrollIdRef.current = null
        announce("새 대화를 시작했어요")
        persistRef.current = "clear"
        return true
    }

    function undoNewChat() {
        if (!undoSnapshot) return false
        requestSeqRef.current += 1
        abortRef.current?.abort()
        abortRef.current = null
        const welcome = messages.find((message) => message.id === "welcome")
        setMessages(
            undoSnapshot.messages.map((message) => (message.id === "welcome" && welcome ? welcome : message))
        )
        setSessionId(undoSnapshot.sessionId)
        sessionOwnerRef.current = undoSnapshot.sessionOwner
        setIsDeepConsultation(undoSnapshot.isDeepConsultation)
        setUnresolvedStreak(undoSnapshot.unresolvedStreak)
        setIsSending(false)
        setIsStreaming(false)
        setIsSlow(false)
        setUndoSnapshot(null)
        announce("대화를 되돌렸어요")
        persistRef.current = "save"
        return true
    }

    // 목록 칩·다시 시도·입력창이 같은 함수를 받는다. 매번 새로 만들어지는 sendQuestion 대신 고정된 함수를 넘겨
    // memo 한 MessageList 가 셸이 다시 그려질 때마다 다시 그려지지 않게 한다. 부를 때는 마지막으로 그린 상태의 함수를 쓴다.
    const sendQuestionRef = useRef(sendQuestion)
    const actionsRef = useRef({ retryTurn, startNewChat, undoNewChat })
    useLayoutEffect(() => {
        sendQuestionRef.current = sendQuestion
        actionsRef.current = { retryTurn, startNewChat, undoNewChat }
    })
    const stableSendQuestion = useCallback((question: string) => sendQuestionRef.current(question), [])
    const stableRetryTurn = useCallback((messageId: string) => actionsRef.current.retryTurn(messageId), [])
    const stableStartNewChat = useCallback(() => actionsRef.current.startNewChat(), [])
    const stableUndoNewChat = useCallback(() => actionsRef.current.undoNewChat(), [])

    const hasUserMessages = useMemo(() => messages.some((message) => message.role === "user"), [messages])

    return {
        messages,
        sessionId,
        isSending,
        isStreaming,
        isSlow,
        cooldownSeconds,
        isDeepConsultation,
        setIsDeepConsultation,
        srAnnouncement,
        hasUserMessages,
        canUndoNewChat: undoSnapshot !== null,
        sendQuestion: stableSendQuestion,
        retryTurn: stableRetryTurn,
        startNewChat: stableStartNewChat,
        undoNewChat: stableUndoNewChat,
    }
}
