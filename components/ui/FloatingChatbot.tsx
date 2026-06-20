"use client"

import { FormEvent, useEffect, useMemo, useRef, useState } from "react"
import Image from "next/image"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { AnimatePresence, motion, useReducedMotion } from "framer-motion"
import {
    Bot,
    Check,
    Copy,
    ExternalLink,
    Loader2,
    MessageCircle,
    RotateCcw,
    Send,
    ThumbsDown,
    ThumbsUp,
    X,
} from "lucide-react"

import { cn } from "@/lib/utils"
import {
    buildChannelTalkMemberId,
    getChannelTalkAnonymousId,
    openChannelTalk,
    type ChannelTalkProfile,
} from "@/lib/channel-talk"
import { CLASSIN_POSITIONING } from "@/lib/classin-positioning"

type HandoffIntent = "demo" | "support"

const UNRESOLVED_STREAK_THRESHOLD = 3
const CHATBOT_REQUEST_TIMEOUT_MS = 9_000
const STARTER_SUGGESTION_LIMIT = 4
const FOLLOW_UP_SUGGESTION_LIMIT = 3

interface ChatbotSource {
    title: string
    heading?: string
    urlPath: string
    category: string
    excerpt: string
    score: number
}

interface ChatbotQueryResponse {
    answer: string
    answerMode: "direct_answer" | "doc_suggestion" | "clarifying_question" | "handoff" | "fallback"
    answerEventId?: string
    confidence: number
    needsHandoff: boolean
    handoffIntent?: HandoffIntent
    sessionId?: string
    sources: ChatbotSource[]
    suggestedQuestions: string[]
    unresolved: boolean
    warning?: string
}

interface ChatbotStarterQuestionsResponse {
    questions?: unknown
    warning?: string
}

interface ChatMessage {
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
}

const hiddenPathPrefixes = [
    "/admin",
    "/api",
    "/checkout",
    "/pricing",
    "/receipt",
]

const starterQuestions = [
    ...CLASSIN_POSITIONING.chatbot.starterQuestions,
].slice(0, STARTER_SUGGESTION_LIMIT)

const DEEP_CONSULTATION_ICON_SRC = "/images/chatbot/ai-deep-consultation.webp"

function shouldHideChatbot(pathname: string | null) {
    if (!pathname) return false
    return hiddenPathPrefixes.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`))
}

function shouldUseDeepConsultationIcon(text: string) {
    return /상담|컨설팅|도입\s*(상담|문의|검토)|견적|담당자|시연|데모|장애|오류|AS|A\/S/i.test(text)
}

function makeId() {
    return `${Date.now()}-${Math.random().toString(16).slice(2)}`
}

function getSuggestionLimit(message: ChatMessage) {
    return message.id === "welcome" ? STARTER_SUGGESTION_LIMIT : FOLLOW_UP_SUGGESTION_LIMIT
}

const HANDOFF_TRANSCRIPT_LIMIT = 6

// 상담원 연결 시 최근 대화록·인텐트를 채널톡 프로필로 넘긴다 — 상담원이 맥락을 갖고 시작.
function buildHandoffProfile(
    messages: ChatMessage[],
    triggerMessage: ChatMessage,
    sessionId?: string,
): ChannelTalkProfile {
    const lastQuestion = [...messages].reverse().find((m) => m.role === "user")?.content
    const transcript = messages
        .slice(-HANDOFF_TRANSCRIPT_LIMIT)
        .map((m) => `${m.role === "user" ? "고객" : "챗봇"}: ${m.content}`)
        .join("\n")

    const profile: ChannelTalkProfile = {
        chatbotHandoff: true,
        chatbotIntent: triggerMessage.handoffIntent ?? "support",
    }
    if (lastQuestion) profile.lastQuestion = lastQuestion.slice(0, 300)
    if (transcript) profile.chatbotTranscript = transcript.slice(0, 1500)
    if (sessionId) profile.chatbotSessionId = sessionId
    return profile
}

function buildConsultationDraft(
    messages: ChatMessage[],
    triggerMessage: ChatMessage,
) {
    const lastQuestion = [...messages].reverse().find((m) => m.role === "user")?.content
    const intentLine =
        triggerMessage.handoffIntent === "support"
            ? "계정/결제/장비 상태 확인이 필요한 문의입니다."
            : "도입 방식과 운영 흐름 상담이 필요한 문의입니다."
    const answerSummary = triggerMessage.content
        .replace(/\s+/g, " ")
        .replace(/^요약:\s*/i, "")
        .slice(0, 260)
        .trim()

    return [
        "Classin 상담 요청드립니다.",
        intentLine,
        lastQuestion ? `질문: ${lastQuestion}` : null,
        answerSummary ? `챗봇 확인 내용: ${answerSummary}` : null,
    ].filter(Boolean).join("\n")
}

function getHandoffTopic(intent?: HandoffIntent) {
    return intent === "demo" ? "도입 상담" : "계정/접속/기술 지원"
}

function formatActionMessage(intent: HandoffIntent, draftLineCount: number) {
    return draftLineCount >= 3
        ? `${getHandoffTopic(intent)} 전용 상담 흐름으로 바로 연결해요.`
        : `${getHandoffTopic(intent)} 상담을 연결하고 담당자가 바로 이어서 확인할게요.`
}

function AssistantMeta({ message }: { message: ChatMessage }) {
    const labels = [
        message.showHandoffCTA ? "상담 권장" : null,
    ].filter((label): label is string => Boolean(label))

    if (labels.length === 0) return null

    return (
        <div className="mb-2 flex flex-wrap gap-1.5">
            {labels.map((label) => (
                <span
                    key={label}
                    className={cn(
                        "inline-flex h-6 items-center rounded-[6px] px-2 text-[11px] font-bold",
                        label === "상담 권장"
                            ? "bg-[#ECFDF5] text-[#084734]"
                            : "bg-[#F6F5F4] text-[#615D59]"
                    )}
                >
                    {label}
                </span>
            ))}
        </div>
    )
}

function ConsultationBridge({
    messages,
    message,
    sessionId,
}: {
    messages: ChatMessage[]
    message: ChatMessage
    sessionId?: string
}) {
    const [state, setState] = useState<"idle" | "opened" | "copied" | "failed">("idle")
    const [toast, setToast] = useState<{
        type: "info" | "success" | "error"
        text: string
    } | null>(null)
    const draft = useMemo(
        () => buildConsultationDraft(messages, message),
        [messages, message]
    )
    const intentLabel = message.handoffIntent === "support" ? "실시간 상담 연결" : "도입 상담 남기기"
    const draftLineCount = draft.split("\n").length
    const topic = getHandoffTopic(message.handoffIntent)
    const contactHref = `/contact?${new URLSearchParams({
        source: "chatbot",
        topic,
        prefill: draft,
    }).toString()}`

    function openConsultation() {
        const anonymousId = getChannelTalkAnonymousId()
        const profile = buildHandoffProfile(messages, message, sessionId)
        setToast({
            type: "info",
            text: "상담창을 여는 중입니다.",
        })
        const opened = openChannelTalk({
            memberId: anonymousId ? buildChannelTalkMemberId(anonymousId) : undefined,
            profile,
            chatProfile: profile,
            draftMessage: draft,
        })

        setState(opened ? "opened" : "failed")
        setToast({
            type: opened ? "success" : "error",
            text: opened
                ? "상담창에 요약이 입력됐어요. 전송하면 담당자가 바로 이어서 확인합니다."
                : "상담창 열기 실패: 브라우저 제약이나 인증 상태를 확인한 뒤 문의폼으로 이동해 주세요.",
        })
    }

    async function copyDraft() {
        try {
            if (!navigator?.clipboard?.writeText) {
                throw new Error("clipboard_not_supported")
            }
            await navigator.clipboard.writeText(draft)
            setState("copied")
            setToast({
                type: "success",
                text: "요약을 복사했어요. 문의폼에 붙여 넣으면 그대로 제출됩니다.",
            })
        } catch {
            setState("failed")
            setToast({
                type: "error",
                text: "요약 복사에 실패했어요. 문의폼으로 이동해 수동으로 붙여 넣어 주세요.",
            })
        }
    }

    return (
        <div className="mt-3 border-t border-black/[0.06] pt-3">
            <div className="flex items-center gap-2 text-[12px] font-bold text-[#084734]">
                <MessageCircle className="h-4 w-4" />
                상담 연결
            </div>
            <p className="mt-1 text-[11px] leading-4 text-[#615D59]">
                {formatActionMessage(message.handoffIntent ?? "support", draftLineCount)}
            </p>
            <div className="mt-2 rounded-[8px] bg-[#F6F5F4] px-3 py-2 text-[12px] leading-5 text-[#3B3835]">
                <p className="whitespace-pre-line [overflow-wrap:anywhere]">{draft}</p>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2">
                <button
                    type="button"
                    onClick={openConsultation}
                    className="inline-flex h-9 items-center justify-center gap-1.5 rounded-[6px] bg-[#084734] px-3 text-xs font-bold text-white transition-colors hover:bg-[#065c41]"
                >
                    <MessageCircle className="h-3.5 w-3.5" />
                    {intentLabel}
                </button>
                <button
                    type="button"
                    onClick={() => void copyDraft()}
                    className="inline-flex h-9 items-center justify-center gap-1.5 rounded-[6px] border border-black/[0.08] bg-white px-3 text-xs font-bold text-[#111110] transition-colors hover:bg-[#ECFDF5]"
                >
                    {state === "copied" ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                    요약 복사
                </button>
                <Link
                    href={contactHref}
                    className="inline-flex h-9 items-center justify-center rounded-[6px] px-2 text-xs font-bold text-[#615D59] transition-colors hover:bg-[#F6F5F4] hover:text-[#084734]"
                >
                    문의폼으로 이어서 남기기
                </Link>
            </div>
            {toast ? (
                <p
                    className={cn(
                        "mt-2 text-[11px] leading-4",
                        toast.type === "error" ? "text-[#7A2A13]" : "text-[#615D59]"
                    )}
                >
                    {toast.text}
                </p>
            ) : null}
            {state !== "idle" ? (
                <p className="mt-2 text-[11px] leading-4 text-[#615D59]">
                    {state === "opened"
                        ? "상담창이 열렸어요. 입력된 요약을 전송하면 채널톡 상담 수신함으로 이어집니다."
                        : state === "copied"
                            ? "요약을 복사했어요."
                            : "상담창을 열 수 없으면 문의폼으로 남겨주세요."}
                </p>
            ) : null}
        </div>
    )
}

function FeedbackButtons({
    answerEventId,
    sessionId,
}: {
    answerEventId?: string
    sessionId?: string
}) {
    const [state, setState] = useState<"idle" | "helpful" | "not_helpful" | "failed">("idle")

    async function sendFeedback(rating: "helpful" | "not_helpful") {
        setState(rating)

        if (!answerEventId || !sessionId) {
            setState("failed")
            return
        }

        try {
            const response = await fetch("/api/chatbot/feedback", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ answerEventId, sessionId, rating }),
            })
            if (!response.ok) setState("failed")
        } catch {
            setState("failed")
        }
    }

    return (
        <div className="flex items-center gap-1.5">
            <button
                type="button"
                onClick={() => sendFeedback("helpful")}
                className={cn(
                    "inline-flex h-8 w-8 items-center justify-center rounded-[6px] border border-black/[0.08] bg-white text-[#615D59] transition-colors hover:text-[#084734]",
                    state === "helpful" && "border-[#084734]/25 bg-[#ECFDF5] text-[#084734]"
                )}
                aria-label="도움됨"
                title="도움됨"
            >
                {state === "helpful" ? <Check className="h-4 w-4" /> : <ThumbsUp className="h-4 w-4" />}
            </button>
            <button
                type="button"
                onClick={() => sendFeedback("not_helpful")}
                className={cn(
                    "inline-flex h-8 w-8 items-center justify-center rounded-[6px] border border-black/[0.08] bg-white text-[#615D59] transition-colors hover:text-[#084734]",
                    state === "not_helpful" && "border-[#084734]/25 bg-[#ECFDF5] text-[#084734]"
                )}
                aria-label="도움 안 됨"
                title="도움 안 됨"
            >
                <ThumbsDown className="h-4 w-4" />
            </button>
        </div>
    )
}

function buildAnswerShareText(message: ChatMessage) {
    return sanitizeVisibleAssistantText(message.content)
}

function sanitizeVisibleAssistantText(value: string) {
    return value
        .replace(/!\[[^\]]*]\([^)]*\)/g, "")
        .replace(/\[([^\]]+)]\((?:https?:\/\/|\/)[^)]+\)/g, "$1")
        .replace(/https?:\/\/[^\s)]+/g, "")
        .replace(/(?:\/docs|\/images|\/resources)\/[^\s)]+/g, "")
        .replace(/\[image[_\-\s]?\d*]/gi, "")
        .replace(/^\s*(?:출처|참고\s*문서|근거\s*자료|문서\s*보기)\s*:.*$/gim, "")
        .replace(/[^\S\r\n]{2,}/g, " ")
        .replace(/[ \t]+\n/g, "\n")
        .replace(/\n{3,}/g, "\n\n")
        .trim()
}

function cleanMessageLine(line: string) {
    return line
        .replace(/^(요약|다음 단계|확인 기준|주의):\s*/i, "")
        .trim()
}

function orderedLineValue(line: string) {
    return line.match(/^\d+[\.)]\s+(.+)$/)?.[1]?.trim()
}

function bulletLineValue(line: string) {
    return line.match(/^[-•]\s+(.+)$/)?.[1]?.trim()
}

function MessageContent({ content, role }: { content: string; role: ChatMessage["role"] }) {
    const visibleContent = role === "assistant" ? sanitizeVisibleAssistantText(content) : content
    const blocks = visibleContent
        .trim()
        .split(/\n{2,}/)
        .map((block) => block.trim())
        .filter(Boolean)

    if (blocks.length === 0) return null

    return (
        <div
            className={cn(
                "space-y-2.5 whitespace-pre-wrap text-sm leading-6 [overflow-wrap:anywhere]",
                role === "assistant" ? "text-[#111110]" : "text-white"
            )}
        >
            {blocks.map((block, blockIndex) => {
                const lines = block
                    .split("\n")
                    .map((line) => line.trim())
                    .filter(Boolean)
                    .filter((line) => !/^(권장 순서|확인 기준):\s*$/i.test(line))
                const orderedItems = lines.map(orderedLineValue)
                const bulletItems = lines.map(bulletLineValue)

                if (orderedItems.length > 0 && orderedItems.every(Boolean)) {
                    return (
                        <ol key={`${blockIndex}:${block}`} className="ml-4 list-decimal space-y-1.5 marker:text-[#0e5038]">
                            {orderedItems.map((item, index) => (
                                <li key={`${index}:${item}`}>{item}</li>
                            ))}
                        </ol>
                    )
                }

                if (bulletItems.length > 0 && bulletItems.every(Boolean)) {
                    return (
                        <ul key={`${blockIndex}:${block}`} className="ml-4 list-disc space-y-1.5 marker:text-[#0e5038]">
                            {bulletItems.map((item, index) => (
                                <li key={`${index}:${item}`}>{item}</li>
                            ))}
                        </ul>
                    )
                }

                return (
                    <p key={`${blockIndex}:${block}`}>
                        {lines.map(cleanMessageLine).filter(Boolean).join("\n")}
                    </p>
                )
            })}
        </div>
    )
}

function AnswerCopyButton({ message }: { message: ChatMessage }) {
    const [state, setState] = useState<"idle" | "copied" | "failed">("idle")

    async function copyAnswer() {
        try {
            if (!navigator?.clipboard?.writeText) {
                throw new Error("clipboard_not_supported")
            }
            await navigator.clipboard.writeText(buildAnswerShareText(message))
            setState("copied")
            window.setTimeout(() => setState("idle"), 1800)
        } catch {
            setState("failed")
            window.setTimeout(() => setState("idle"), 1800)
        }
    }

    return (
        <button
            type="button"
            onClick={() => void copyAnswer()}
            className={cn(
                "inline-flex h-8 items-center justify-center gap-1.5 rounded-[6px] border border-black/[0.08] bg-white px-2.5 text-[11px] font-bold text-[#615D59] transition-colors hover:bg-[#ECFDF5] hover:text-[#084734]",
                state === "copied" && "border-[#084734]/25 bg-[#ECFDF5] text-[#084734]",
                state === "failed" && "border-[#B85C33]/20 bg-[#FBEAE2] text-[#7A2A13]"
            )}
            aria-label="답변 복사"
            title="답변 복사"
        >
            {state === "copied" ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
            {state === "copied" ? "복사됨" : state === "failed" ? "실패" : "답변 복사"}
        </button>
    )
}

function SourceLinks({ sources }: { sources?: ChatbotSource[] }) {
    const visibleSources = sources?.slice(0, 2) ?? []
    if (visibleSources.length === 0) return null

    return (
        <div className="mt-3 space-y-1.5 border-t border-black/[0.06] pt-3">
            <div className="text-[11px] font-bold text-[#615D59]">참고한 가이드</div>
            {visibleSources.map((source) => (
                <Link
                    key={`${source.urlPath}:${source.heading ?? source.title}`}
                    href={source.urlPath}
                    className="block rounded-[8px] border border-black/[0.08] bg-[#F6F5F4] px-3 py-2 text-left transition-colors hover:bg-[#ECFDF5] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#084734]/25"
                >
                    <span className="flex items-start justify-between gap-2 text-[12px] font-bold leading-5 text-[#111110]">
                        <span>{source.title}</span>
                        <ExternalLink className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#084734]" aria-hidden />
                    </span>
                    {source.heading ? (
                        <span className="mt-0.5 block text-[11px] leading-4 text-[#615D59]">
                            {source.heading}
                        </span>
                    ) : null}
                </Link>
            ))}
        </div>
    )
}

function ThinkingIndicator({
    shouldReduceMotion,
}: {
    shouldReduceMotion: boolean | null
}) {
    return (
        <motion.div
            initial={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, y: 8 }}
            animate={shouldReduceMotion ? { opacity: 1 } : { opacity: 1, y: 0 }}
            transition={{ duration: shouldReduceMotion ? 0.01 : 0.18, ease: "easeOut" }}
            className="flex justify-start"
        >
            <div
                role="status"
                aria-live="polite"
                className="inline-flex items-center gap-2 rounded-[12px] border border-black/[0.06] bg-white px-3.5 py-2.5 shadow-sm"
            >
                <div className="flex items-center gap-1" aria-hidden>
                    {[0, 1, 2].map((index) => (
                        <motion.span
                            key={index}
                            className="h-1.5 w-1.5 rounded-full bg-[#084734]"
                            animate={
                                shouldReduceMotion
                                    ? { opacity: 0.5 }
                                    : { y: [0, -4, 0], opacity: [0.35, 1, 0.35] }
                            }
                            transition={
                                shouldReduceMotion
                                    ? undefined
                                    : { duration: 1.1, repeat: Infinity, ease: "easeInOut", delay: index * 0.15 }
                            }
                        />
                    ))}
                </div>
                <span className="text-sm text-[#615D59]">답변 작성 중</span>
            </div>
        </motion.div>
    )
}

export function FloatingChatbot() {
    const pathname = usePathname()
    const shouldReduceMotion = useReducedMotion()
    const [isOpen, setIsOpen] = useState(false)
    const [input, setInput] = useState("")
    const [sessionId, setSessionId] = useState<string | undefined>()
    const [isSending, setIsSending] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [isDeepConsultation, setIsDeepConsultation] = useState(false)
    const [unresolvedStreak, setUnresolvedStreak] = useState(0)
    const bottomRef = useRef<HTMLDivElement | null>(null)
    const inputRef = useRef<HTMLTextAreaElement | null>(null)
    const triggerRef = useRef<HTMLButtonElement | null>(null)
    const [messages, setMessages] = useState<ChatMessage[]>([
        {
            id: "welcome",
            role: "assistant",
            content: CLASSIN_POSITIONING.chatbot.welcome,
            suggestedQuestions: starterQuestions,
        },
    ])

    const hidden = shouldHideChatbot(pathname)

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
    // 복귀한다. 시각적 숨김은 아래 `if (hidden) return null`이 담당한다.
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

                if (questions.length === 0) return

                setMessages((current) =>
                    current.map((message) =>
                        message.id === "welcome"
                            ? { ...message, suggestedQuestions: questions }
                            : message
                    )
                )
            } catch (err) {
                if (err instanceof DOMException && err.name === "AbortError") return
            }
        }

        void loadStarterQuestions()

        return () => controller.abort()
    }, [hidden])

    useEffect(() => {
        if (!isOpen) return

        const frame = window.requestAnimationFrame(() => {
            const shouldAutofocus = window.matchMedia("(hover: hover) and (pointer: fine)").matches
            if (!shouldAutofocus) return
            inputRef.current?.focus()
        })

        return () => window.cancelAnimationFrame(frame)
    }, [isOpen])

    useEffect(() => {
        if (!isOpen) return
        const frame = window.requestAnimationFrame(() => {
            bottomRef.current?.scrollIntoView({ behavior: shouldReduceMotion ? "auto" : "smooth" })
        })

        return () => window.cancelAnimationFrame(frame)
    }, [isOpen, isSending, messages.length, shouldReduceMotion])


    useEffect(() => {
        if (!isOpen) return

        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === "Escape") {
                setIsOpen(false)
                triggerRef.current?.focus()
            }
        }

        document.addEventListener("keydown", handleKeyDown)
        return () => document.removeEventListener("keydown", handleKeyDown)
    }, [isOpen])

    if (hidden) return null

    async function sendQuestion(question: string) {
        const trimmed = question.trim()
        if (!trimmed || isSending) return
        const anonymousId = getChannelTalkAnonymousId()

        if (shouldUseDeepConsultationIcon(trimmed)) {
            setIsDeepConsultation(true)
        }

        setInput("")
        setError(null)
        setIsSending(true)

        const userMessage: ChatMessage = {
            id: makeId(),
            role: "user",
            content: trimmed,
        }

        setMessages((current) => [...current, userMessage])

        let timeoutId: number | undefined
        try {
            const controller = new AbortController()
            timeoutId = window.setTimeout(() => controller.abort(), CHATBOT_REQUEST_TIMEOUT_MS)
            const response = await fetch("/api/chatbot/query", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                signal: controller.signal,
                body: JSON.stringify({
                    message: trimmed,
                    sessionId,
                    anonymousId,
                    context,
                }),
            })

            const data = (await response.json().catch(() => ({}))) as Partial<ChatbotQueryResponse> & { error?: string }

            if (!response.ok) {
                throw new Error(
                    response.status === 429
                        ? data.error ?? "질문이 잠시 많이 들어왔습니다. 잠깐 후 다시 시도해 주세요."
                        : data.error ?? "답변을 가져오지 못했습니다."
                )
            }

            setSessionId(data.sessionId ?? sessionId)
            if (data.answerMode === "handoff" || data.needsHandoff) {
                setIsDeepConsultation(true)
            }

            const nextStreak = data.unresolved ? unresolvedStreak + 1 : 0
            setUnresolvedStreak(nextStreak)

            const showHandoffCTA = Boolean(data.needsHandoff)

            setMessages((current) => [
                ...current,
                {
                    id: makeId(),
                    role: "assistant",
                    content: sanitizeVisibleAssistantText(data.answer ?? "확인 가능한 답변을 찾지 못했습니다."),
                    sources: data.sources ?? [],
                    suggestedQuestions: data.suggestedQuestions ?? [],
                    answerEventId: data.answerEventId,
                    confidence: data.confidence,
                    needsHandoff: data.needsHandoff,
                    handoffIntent: data.handoffIntent,
                    showHandoffCTA,
                },
            ])

            if (nextStreak >= UNRESOLVED_STREAK_THRESHOLD && !data.needsHandoff) {
                const intent = data.handoffIntent ?? "demo"
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

        } catch (err) {
            const isAbort = err instanceof DOMException && err.name === "AbortError"
            setError(isAbort ? "응답이 지연되고 있습니다. 잠깐 후 다시 시도해 주세요." : err instanceof Error ? err.message : "챗봇 응답 중 오류가 발생했습니다.")
            setMessages((current) => [
                ...current,
                {
                    id: makeId(),
                    role: "assistant",
                    content: isAbort
                        ? "응답이 지연되고 있어요. 같은 질문을 다시 시도하거나 질문을 조금 더 짧게 보내주세요."
                        : "지금은 답변을 불러오지 못했습니다. 같은 질문을 다시 시도할 수 있어요.",
                    suggestedQuestions: [],
                    needsHandoff: false,
                    handoffIntent: "support",
                    showHandoffCTA: false,
                    retryQuestion: trimmed,
                },
            ])
        } finally {
            if (timeoutId) window.clearTimeout(timeoutId)
            setIsSending(false)
        }
    }

    function handleSubmit(event: FormEvent<HTMLFormElement>) {
        event.preventDefault()
        void sendQuestion(input)
    }

    function closeChatbot() {
        setIsOpen(false)
        window.requestAnimationFrame(() => {
            triggerRef.current?.focus()
        })
    }

    return (
        <div className="fixed inset-x-0 bottom-0 z-50 flex flex-col items-end px-3 pb-[calc(1rem+env(safe-area-inset-bottom))] md:inset-x-auto md:bottom-6 md:right-6 md:px-0 md:pb-0">
            <AnimatePresence>
                {isOpen && (
                    <motion.div
                        id="classin-chatbot-dialog"
                        role="dialog"
                        aria-modal="false"
                        aria-labelledby="classin-chatbot-title"
                        initial={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, y: 16, scale: 0.98 }}
                        animate={shouldReduceMotion ? { opacity: 1 } : { opacity: 1, y: 0, scale: 1 }}
                        exit={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, y: 16, scale: 0.98 }}
                        transition={{ duration: shouldReduceMotion ? 0.01 : 0.18 }}
                        className="mb-3 flex h-[min(620px,calc(100svh-6rem))] w-full max-w-none flex-col overflow-hidden rounded-[20px] border border-black/[0.08] bg-white shadow-[0_30px_60px_rgba(8,71,52,0.12),0_14px_30px_rgba(0,0,0,0.06),0_4px_10px_rgba(0,0,0,0.04),0_1px_3px_rgba(0,0,0,0.03)] md:mb-4 md:h-[min(560px,calc(100svh-8.5rem))] md:max-w-[390px]"
                    >
                        <div className="flex items-center justify-between border-b border-white/[0.08] bg-[#2b2926] px-5 py-4 text-white">
                            <div className="flex min-w-0 items-center gap-3">
                                <div className="relative flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-[9px] border border-white/20 bg-white/15">
                                    {isDeepConsultation ? (
                                        <Image
                                            src={DEEP_CONSULTATION_ICON_SRC}
                                            alt=""
                                            fill
                                            className="object-cover"
                                            sizes="40px"
                                            aria-hidden
                                        />
                                    ) : (
                                        <Bot className="h-5 w-5 text-[#6EE7B7]" />
                                    )}
                                </div>
                                <div className="min-w-0">
                                    <div className="flex items-center gap-1.5">
                                        <h2 id="classin-chatbot-title" className="truncate text-[15px] font-bold">Classin 상담 가이드</h2>
                                        <motion.span
                                            aria-hidden
                                            className="h-1.5 w-1.5 shrink-0 rounded-full bg-[#6EE7B7] shadow-[0_0_0_2px_rgba(110,231,183,0.25)]"
                                            animate={shouldReduceMotion ? undefined : { opacity: [1, 0.4, 1] }}
                                            transition={shouldReduceMotion ? undefined : { duration: 2.6, repeat: Infinity, ease: "easeInOut" }}
                                        />
                                    </div>
                                    <p className="mt-0.5 truncate text-xs text-white/70">운영·도입·CS 빠른 상담</p>
                                </div>
                            </div>
                            <button
                                type="button"
                                onClick={closeChatbot}
                                className="inline-flex h-8 w-8 items-center justify-center rounded-[6px] text-white/75 transition-colors hover:bg-white/10 hover:text-white"
                                aria-label="챗봇 닫기"
                            >
                                <X className="h-5 w-5" />
                            </button>
                        </div>

                        <div
                            className="flex-1 overflow-y-auto bg-gradient-to-b from-[#F6F5F4] to-white px-4 py-4"
                            role="log"
                            aria-live="polite"
                            aria-relevant="additions"
                        >
                            <div className="space-y-4">
                                {messages.map((message) => (
                                    <motion.div
                                        key={message.id}
                                        initial={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, y: 10, scale: 0.98 }}
                                        animate={shouldReduceMotion ? { opacity: 1 } : { opacity: 1, y: 0, scale: 1 }}
                                        transition={{ duration: shouldReduceMotion ? 0.01 : 0.28, ease: [0.22, 1, 0.36, 1] }}
                                        className={cn(
                                            "flex",
                                            message.role === "user" ? "justify-end" : "justify-start"
                                        )}
                                    >
                                        <div
                                            className={cn(
                                                "max-w-[90%] rounded-[14px] px-3.5 py-3 text-sm leading-6 md:max-w-[86%]",
                                                message.role === "user"
                                                    ? "rounded-br-[4px] bg-[#0e5038] text-white shadow-[0_3px_10px_rgba(8,71,52,0.18)]"
                                                    : "rounded-bl-[4px] border border-black/[0.06] bg-white text-[#111110] shadow-[0_3px_8px_rgba(0,0,0,0.05),0_1px_2px_rgba(0,0,0,0.03)]"
                                            )}
                                        >
                                            {message.role === "assistant" ? <AssistantMeta message={message} /> : null}
                                            <MessageContent content={message.content} role={message.role} />
                                            {message.role === "assistant" ? (
                                                <>
                                                    <SourceLinks sources={message.sources} />
                                                    {message.retryQuestion ? (
                                                        <div className="mt-3">
                                                            <button
                                                                type="button"
                                                                onClick={() => void sendQuestion(message.retryQuestion ?? "")}
                                                                disabled={isSending}
                                                                className="inline-flex h-9 items-center justify-center gap-1.5 rounded-[6px] border border-[#084734]/20 bg-[#ECFDF5] px-3 text-xs font-bold text-[#084734] transition-colors hover:bg-[#D1FAE5] disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#084734]/25"
                                                            >
                                                                <RotateCcw className="h-3.5 w-3.5" aria-hidden />
                                                                다시 시도
                                                            </button>
                                                        </div>
                                                    ) : null}
                                                    {(message.suggestedQuestions?.length ?? 0) > 0 ? (
                                                        <div className="mt-3 grid gap-2">
                                                            {message.suggestedQuestions?.slice(0, getSuggestionLimit(message)).map((question) => (
                                                                <button
                                                                    key={question}
                                                                    type="button"
                                                                    disabled={isSending}
                                                                    onClick={() => sendQuestion(question)}
                                                                    className="flex w-full items-center justify-between gap-2 whitespace-normal break-keep rounded-full border border-[#0e5038]/40 bg-transparent px-3.5 py-2 text-left text-[12px] font-semibold leading-5 text-[#0e5038] transition-colors hover:border-[#0e5038]/60 hover:bg-[#ECFDF5] disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#084734]/25"
                                                                >
                                                                    <span>{question}</span>
                                                                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="h-3.5 w-3.5 shrink-0"><path d="M5 12h14" /><path d="m12 5 7 7-7 7" /></svg>
                                                                </button>
                                                            ))}
                                                        </div>
                                                    ) : null}
                                                    {message.answerEventId || message.showHandoffCTA ? (
                                                        <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                                                            <AnswerCopyButton message={message} />
                                                            {message.answerEventId ? (
                                                                <FeedbackButtons answerEventId={message.answerEventId} sessionId={sessionId} />
                                                            ) : null}
                                                        </div>
                                                    ) : null}
                                                    {message.showHandoffCTA ? (
                                                        <ConsultationBridge messages={messages} message={message} sessionId={sessionId} />
                                                    ) : null}
                                                </>
                                            ) : null}
                                        </div>
                                    </motion.div>
                                ))}

                                {isSending ? (
                                    <ThinkingIndicator shouldReduceMotion={shouldReduceMotion} />
                                ) : null}
                                <div ref={bottomRef} />
                            </div>
                        </div>

                        {error ? (
                            <div className="flex items-center justify-between gap-3 border-t border-black/[0.06] bg-[#F6F5F4] px-4 py-2 text-xs font-medium text-[#7A2A13]">
                                <span>{error}</span>
                            </div>
                        ) : null}

                        <form onSubmit={handleSubmit} className="border-t border-black/[0.06] bg-white/80 p-3 backdrop-blur-md">
                            <div className="flex items-end gap-2">
                                <textarea
                                    ref={inputRef}
                                    value={input}
                                    onChange={(event) => setInput(event.target.value)}
                                    onKeyDown={(event) => {
                                        if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
                                            event.preventDefault()
                                            void sendQuestion(input)
                                        }
                                    }}
                                    rows={1}
                                    maxLength={1000}
                                    placeholder="질문을 짧게 입력해 주세요"
                                    aria-label="챗봇 질문 입력"
                                    className="min-h-10 max-h-28 flex-1 resize-none rounded-[10px] border border-[#E5E5E0] bg-white px-3 py-2 text-sm leading-6 text-[#111110] placeholder:text-[#A39E98] focus-visible:border-[#084734] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#084734]/20"
                                />
                                <button
                                    type="submit"
                                    disabled={isSending || !input.trim()}
                                    className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px] bg-[#0e5038] text-white shadow-[0_4px_12px_rgba(8,71,52,0.24)] transition-colors hover:bg-[#0f5a40] disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none"
                                    aria-label="질문 보내기"
                                >
                                    {isSending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                                </button>
                            </div>
                        </form>
                    </motion.div>
                )}
            </AnimatePresence>

            <div className="relative flex h-14 w-14 items-center justify-center md:h-16 md:w-16">
                {!isOpen && !shouldReduceMotion ? (
                    <motion.span
                        aria-hidden
                        className="pointer-events-none absolute -inset-2 rounded-full"
                        style={{ background: "radial-gradient(circle, rgba(14,80,56,0.28) 0%, rgba(14,80,56,0.10) 45%, rgba(14,80,56,0) 72%)" }}
                        initial={{ scale: 0.85, opacity: 0.55 }}
                        animate={{ scale: [0.85, 1.75], opacity: [0.55, 0] }}
                        transition={{ duration: 3.8, repeat: Infinity, repeatDelay: 1.2, ease: "easeOut" }}
                    />
                ) : null}
                <motion.button
                    ref={triggerRef}
                    type="button"
                    whileHover={shouldReduceMotion ? undefined : { scale: 1.04 }}
                    whileTap={shouldReduceMotion ? undefined : { scale: 0.96 }}
                    onClick={() => setIsOpen((current) => !current)}
                    className="relative flex h-14 w-14 items-center justify-center overflow-hidden rounded-full bg-[#0e5038] text-white shadow-[0_12px_28px_rgba(8,71,52,0.30),0_4px_10px_rgba(0,0,0,0.12)] transition-colors hover:bg-[#0f5a40] focus:outline-none focus:ring-4 focus:ring-[#084734]/20 md:h-16 md:w-16"
                    aria-label={isOpen ? "챗봇 닫기" : "챗봇 열기"}
                    aria-expanded={isOpen}
                    aria-controls="classin-chatbot-dialog"
                >
                    {isOpen ? (
                        <X className="h-6 w-6" />
                    ) : isDeepConsultation ? (
                        <Image
                            src={DEEP_CONSULTATION_ICON_SRC}
                            alt=""
                            fill
                            className="object-cover"
                            sizes="64px"
                            aria-hidden
                        />
                    ) : (
                        <MessageCircle className="h-6 w-6" />
                    )}
                </motion.button>
            </div>
        </div>
    )
}
