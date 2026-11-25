"use client"

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type RefObject } from "react"

import { getChannelTalkAnonymousId } from "@/lib/channel-talk"
import { CLASSIN_POSITIONING } from "@/lib/classin-positioning"
import { trackEvent } from "@/lib/analytics"
import { resolvePageContext, mergeStarters } from "@/lib/chatbot/page-context"
import { buildPreviousTurnPayload, shouldShowUnresolvedNudge } from "@/lib/chatbot/widget-turn"
import { playSendSound, playReceiveSound } from "@/lib/chatbot/sound"
import { STARTER_SUGGESTION_LIMIT } from "@/components/ui/chatbot/constants"
import { sanitizeVisibleAssistantText } from "@/components/ui/chatbot/MessageList"
import type {
    ChatbotStarterQuestionsResponse,
    ChatbotStreamEvent,
    ChatMessage,
} from "@/components/ui/chatbot/types"

const UNRESOLVED_STREAK_THRESHOLD = 3
const CHATBOT_REQUEST_TIMEOUT_MS = 14_000

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

interface UseChatbotConversationOptions {
    pathname: string | null
    hidden: boolean
    // 새 답 말풍선을 목록 위쪽에 맞출 대상. 스크롤은 셸이 맡고, 보내기가 대상 id 를 적어 둔다.
    pendingAssistantScrollIdRef: RefObject<string | null>
    // 보내기 직전에 부른다. 셸이 입력창을 비우고 목록을 맨 아래로 따라가게 둔다.
    onBeforeSend?: () => void
}

// 대화 상태(메시지·세션·보내기·스트림 파싱·오류·스크린 리더 안내·추천 질문·요청 context)를 맡는다.
export function useChatbotConversation({
    pathname,
    hidden,
    pendingAssistantScrollIdRef,
    onBeforeSend,
}: UseChatbotConversationOptions) {
    const [sessionId, setSessionId] = useState<string | undefined>()
    const [isSending, setIsSending] = useState(false)
    const [isStreaming, setIsStreaming] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [isDeepConsultation, setIsDeepConsultation] = useState(false)
    const [unresolvedStreak, setUnresolvedStreak] = useState(0)
    const [srAnnouncement, setSrAnnouncement] = useState("")
    const [messages, setMessages] = useState<ChatMessage[]>(() => [
        {
            id: "welcome",
            role: "assistant",
            content: CLASSIN_POSITIONING.chatbot.welcome,
            suggestedQuestions: resolvePageContext(pathname).starters.slice(0, STARTER_SUGGESTION_LIMIT),
        },
    ])

    const pageContext = useMemo(() => resolvePageContext(pathname), [pathname])
    const firstQuestionSentRef = useRef(false)

    const context = useMemo(
        () => {
            const pageUrl = typeof window === "undefined" ? undefined : window.location.href
            const searchParams =
                typeof window === "undefined" ? new URLSearchParams() : new URLSearchParams(window.location.search)
            const utm = Object.fromEntries(
                ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term"]
                    .map((key) => [key, searchParams.get(key)] as const)
                    .filter(([, value]) => Boolean(value))
            )

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

    // hidden이어도 isOpen은 강제로 닫지 않는다 — 숨김 페이지(/pricing 등)를 잠깐
    // 거쳐도 창이 영구히 닫히지 않고, 다시 보이는 페이지로 오면 이전 열림 상태로
    // 복귀한다. 시각적 숨김은 셸(FloatingChatbot)의 `if (hidden) return null`이 담당한다.
    useEffect(() => {
        if (hidden) return

        const controller = new AbortController()

        async function loadStarterQuestions() {
            try {
                const response = await fetch("/api/chatbot/recommended-questions", {
                    cache: "no-store",
                    signal: controller.signal,
                })
                const data = (await response.json()) as ChatbotStarterQuestionsResponse
                const questions = Array.isArray(data.questions)
                    ? data.questions
                        .filter((question): question is string => typeof question === "string")
                        .map((question) => question.trim())
                        .filter(Boolean)
                        .slice(0, STARTER_SUGGESTION_LIMIT)
                    : []

                const merged = mergeStarters(pageContext.starters, questions, STARTER_SUGGESTION_LIMIT)
                if (merged.length === 0) return

                setMessages((current) =>
                    current.map((message) =>
                        message.id === "welcome"
                            ? { ...message, suggestedQuestions: merged }
                            : message
                    )
                )
            } catch (err) {
                if (err instanceof DOMException && err.name === "AbortError") return
            }
        }

        void loadStarterQuestions()

        return () => controller.abort()
    }, [hidden, pageContext])

    async function sendQuestion(question: string) {
        const trimmed = question.trim()
        if (!trimmed || isSending) return

        if (!firstQuestionSentRef.current) {
            firstQuestionSentRef.current = true
            trackEvent("chatbot_first_question", { path: pathname })
        }

        const anonymousId = getChannelTalkAnonymousId()

        if (shouldUseDeepConsultationIcon(trimmed)) {
            setIsDeepConsultation(true)
        }

        // 입력창 비우기와 목록 맨 아래 따라가기는 셸이 맡는다(입력 상태는 ChatComposer, 스크롤 위치는 셸에 있다).
        onBeforeSend?.()
        setError(null)
        setIsSending(true)
        setIsStreaming(false)
        playSendSound()

        const userMessage: ChatMessage = {
            id: makeId(),
            role: "user",
            content: trimmed,
        }

        // 직전 한 턴(직전 질문·직전 답이 물은 정보의 종류·답 모드)을 함께 보내 짧은 대답("휴대폰이요")·이어 묻기("그러면 아이패드는요")를
        // 앞 턴 주제로 답하게 한다. 서버는 DB 이력이 아니라 이 값만 쓴다(lib/chatbot/conversation-context.ts).
        const previousTurn = buildPreviousTurnPayload(messages)

        setMessages((current) => [...current, userMessage])

        // 첫 토큰이 오면 그때 어시스턴트 말풍선을 만든다(그 전까지는 ThinkingIndicator 가 보인다).
        let assistantId: string | null = null
        const ensureAssistant = () => {
            if (assistantId) return assistantId
            const id = makeId()
            assistantId = id
            pendingAssistantScrollIdRef.current = id
            setIsStreaming(true)
            setMessages((current) => [...current, { id, role: "assistant", content: "" }])
            return id
        }
        const updateAssistant = (updater: (message: ChatMessage) => ChatMessage) => {
            const id = ensureAssistant()
            setMessages((current) => current.map((message) => (message.id === id ? updater(message) : message)))
        }

        let timeoutId: number | undefined
        try {
            const controller = new AbortController()
            timeoutId = window.setTimeout(() => controller.abort(), CHATBOT_REQUEST_TIMEOUT_MS)
            const response = await fetch("/api/chatbot/query/stream", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                signal: controller.signal,
                body: JSON.stringify({
                    message: trimmed,
                    sessionId,
                    anonymousId,
                    // context.path 는 문서 페이지 맥락("방금 본 내용…")에도 쓰인다.
                    context: previousTurn ? { ...context, previousTurn } : context,
                }),
            })

            if (!response.ok || !response.body) {
                const data = (await response.json().catch(() => ({}))) as { error?: string }
                throw new Error(
                    response.status === 429
                        ? data.error ?? "질문이 잠시 많이 들어왔습니다. 잠깐 후 다시 시도해 주세요."
                        : data.error ?? "답변을 가져오지 못했습니다."
                )
            }

            const handleEvent = (event: ChatbotStreamEvent) => {
                if (event.type === "delta") {
                    updateAssistant((message) => ({ ...message, content: message.content + event.text }))
                    return
                }
                if (event.type === "replace") {
                    updateAssistant((message) => ({ ...message, content: event.answer }))
                    return
                }
                if (event.type === "error") {
                    throw new Error(event.error)
                }
                // meta
                const meta = event.meta
                setSessionId(meta.sessionId ?? sessionId)
                if (meta.needsHandoff || meta.answerMode === "handoff") {
                    setIsDeepConsultation(true)
                }
                const nextStreak = meta.unresolved ? unresolvedStreak + 1 : 0
                setUnresolvedStreak(nextStreak)
                updateAssistant((message) => ({
                    ...message,
                    sources: meta.sources ?? [],
                    suggestedQuestions: meta.suggestedQuestions ?? [],
                    answerEventId: meta.answerEventId,
                    confidence: meta.confidence,
                    needsHandoff: meta.needsHandoff,
                    handoffIntent: meta.handoffIntent,
                    showHandoffCTA: Boolean(meta.needsHandoff),
                    answerMode: meta.answerMode,
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
                if (done) break
                // 데이터가 흐르는 동안에는 유휴 타임아웃을 리셋해 긴 응답이 중간에 끊기지 않게 한다.
                if (timeoutId) window.clearTimeout(timeoutId)
                timeoutId = window.setTimeout(() => controller.abort(), CHATBOT_REQUEST_TIMEOUT_MS)
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

            // 어떤 콘텐츠도 받지 못했으면 안내 문구로 마무리한다.
            if (!assistantId) {
                const fallbackId = makeId()
                pendingAssistantScrollIdRef.current = fallbackId
                setMessages((current) => [
                    ...current,
                    {
                        id: fallbackId,
                        role: "assistant",
                        content: "확인 가능한 답변을 찾지 못했습니다.",
                        suggestedQuestions: [],
                    },
                ])
                setSrAnnouncement("답변 완료: 확인 가능한 답변을 찾지 못했습니다.")
            } else {
                setMessages((current) => {
                    const latestAssistant = current.find((m) => m.id === assistantId)
                    if (latestAssistant) {
                        const cleanText = sanitizeVisibleAssistantText(latestAssistant.content)
                        const hasHandoff = latestAssistant.showHandoffCTA ? " 상담 연결 준비됨." : ""
                        setSrAnnouncement(`답변 완료: ${cleanText}${hasHandoff}`)
                    }
                    return current
                })
            }
            playReceiveSound()
        } catch (err) {
            const isAbort = err instanceof DOMException && err.name === "AbortError"
            setError(isAbort ? "응답이 지연되고 있습니다. 잠깐 후 다시 시도해 주세요." : err instanceof Error ? err.message : "챗봇 응답 중 오류가 발생했습니다.")
            const errorContent = isAbort
                ? "응답이 지연되고 있어요. 같은 질문을 다시 시도하거나 질문을 조금 더 짧게 보내주세요."
                : "지금은 답변을 불러오지 못했습니다. 같은 질문을 다시 시도할 수 있어요."
            setSrAnnouncement(`답변 오류: ${errorContent}`)
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
                retryQuestion: trimmed,
            }
            setMessages((current) =>
                assistantId
                    ? current.map((message) => (message.id === assistantId ? errorMessage : message))
                    : [...current, errorMessage]
            )
        } finally {
            if (timeoutId) window.clearTimeout(timeoutId)
            setIsSending(false)
            setIsStreaming(false)
        }
    }

    // 목록 칩·다시 시도·입력창이 같은 함수를 받는다. 매번 새로 만들어지는 sendQuestion 대신 고정된 함수를 넘겨
    // memo 한 MessageList 가 셸이 다시 그려질 때마다 다시 그려지지 않게 한다. 부를 때는 마지막으로 그린 상태의 함수를 쓴다.
    const sendQuestionRef = useRef(sendQuestion)
    useLayoutEffect(() => {
        sendQuestionRef.current = sendQuestion
    })
    const stableSendQuestion = useCallback((question: string) => sendQuestionRef.current(question), [])

    return {
        messages,
        sessionId,
        isSending,
        isStreaming,
        error,
        isDeepConsultation,
        setIsDeepConsultation,
        srAnnouncement,
        sendQuestion: stableSendQuestion,
    }
}
