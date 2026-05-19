"use client"

import { FormEvent, useEffect, useMemo, useRef, useState } from "react"
import Image from "next/image"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { AnimatePresence, motion, useReducedMotion } from "framer-motion"
import {
    ArrowUpRight,
    Bot,
    Check,
    FileText,
    Loader2,
    MessageCircle,
    Send,
    ThumbsDown,
    ThumbsUp,
    X,
} from "lucide-react"

import { cn } from "@/lib/utils"
import { openChannelTalk } from "@/lib/channel-talk"

type HandoffIntent = "demo" | "support"

const UNRESOLVED_STREAK_THRESHOLD = 2

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

interface ChatMessage {
    id: string
    role: "assistant" | "user"
    content: string
    sources?: ChatbotSource[]
    suggestedQuestions?: string[]
    answerEventId?: string
    needsHandoff?: boolean
    handoffIntent?: HandoffIntent
    showHandoffCTA?: boolean
}

const hiddenPathPrefixes = [
    "/admin",
    "/api",
    "/checkout",
    "/pricing",
    "/receipt",
]

const starterQuestions = [
    "우리 학원에 맞는 도입 방식이 궁금해요",
    "수업 중 집중도와 출석 관리를 개선하고 싶어요",
    "결제, 영수증, 계정 문제를 상담받고 싶어요",
]

const DEEP_CONSULTATION_ICON_SRC = "/images/chatbot/ai-deep-consultation.png"

function shouldHideChatbot(pathname: string | null) {
    if (!pathname) return false
    return hiddenPathPrefixes.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`))
}

function shouldUseDeepConsultationIcon(text: string) {
    return /상담|컨설팅|도입|문의|견적|문제|장애|오류|AS|A\/S/i.test(text)
}

function makeId() {
    return `${Date.now()}-${Math.random().toString(16).slice(2)}`
}

function getAnonymousId() {
    if (typeof window === "undefined") return undefined

    const key = "classinkr_chatbot_anonymous_id"
    const existing = window.localStorage.getItem(key)
    if (existing) return existing

    const next = globalThis.crypto?.randomUUID?.() ?? makeId()
    window.localStorage.setItem(key, next)
    return next
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

        if (!answerEventId) return

        try {
            await fetch("/api/chatbot/feedback", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ answerEventId, sessionId, rating }),
            })
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

function SourceLinks({ sources }: { sources: ChatbotSource[] }) {
    if (sources.length === 0) return null

    return (
        <div className="mt-3 space-y-2">
            {sources.map((source) => (
                <Link
                    key={source.urlPath}
                    href={source.urlPath}
                    className="group flex items-start gap-2 rounded-[8px] border border-black/[0.08] bg-[#FAFAF8] px-3 py-2 text-left transition-colors hover:border-[#084734]/25 hover:bg-[#ECFDF5]"
                >
                    <FileText className="mt-0.5 h-4 w-4 shrink-0 text-[#084734]" />
                    <span className="min-w-0 flex-1">
                        <span className="block truncate text-[13px] font-bold text-[#111110]">{source.title}</span>
                        {source.heading ? (
                            <span className="mt-0.5 block truncate text-[12px] text-[#615D59]">{source.heading}</span>
                        ) : null}
                    </span>
                    <ArrowUpRight className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#A39E98] transition-colors group-hover:text-[#084734]" />
                </Link>
            ))}
        </div>
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
            content:
                "안녕하세요. ClassIn 상담 가이드입니다. 운영 고민은 먼저 정리해드리고, 계정·결제·장애처럼 확인이 필요한 내용은 바로 상담으로 이어드릴게요.",
            suggestedQuestions: starterQuestions,
        },
    ])

    const hidden = shouldHideChatbot(pathname)

    const context = useMemo(
        () => ({
            channel: "web",
            path: pathname,
        }),
        [pathname]
    )

    useEffect(() => {
        if (hidden) {
            setIsOpen(false)
        }
    }, [hidden])

    useEffect(() => {
        if (!isOpen) return

        const frame = window.requestAnimationFrame(() => {
            inputRef.current?.focus()
        })

        return () => window.cancelAnimationFrame(frame)
    }, [isOpen])

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

        try {
            const response = await fetch("/api/chatbot/query", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    message: trimmed,
                    sessionId,
                    anonymousId: getAnonymousId(),
                    context,
                }),
            })

            const data = (await response.json()) as Partial<ChatbotQueryResponse> & { error?: string }

            if (!response.ok) {
                throw new Error(data.error ?? "답변을 가져오지 못했습니다.")
            }

            setSessionId(data.sessionId ?? sessionId)
            if (data.answerMode === "handoff" || data.needsHandoff) {
                setIsDeepConsultation(true)
            }

            const nextStreak = data.unresolved ? unresolvedStreak + 1 : 0
            setUnresolvedStreak(nextStreak)

            const showHandoffCTA = Boolean(data.needsHandoff) || nextStreak >= UNRESOLVED_STREAK_THRESHOLD

            setMessages((current) => [
                ...current,
                {
                    id: makeId(),
                    role: "assistant",
                    content: data.answer ?? "확인 가능한 답변을 찾지 못했습니다.",
                    sources: data.sources ?? [],
                    suggestedQuestions: data.suggestedQuestions ?? [],
                    answerEventId: data.answerEventId,
                    needsHandoff: data.needsHandoff,
                    handoffIntent: data.handoffIntent,
                    showHandoffCTA,
                },
            ])

            if (showHandoffCTA && nextStreak >= UNRESOLVED_STREAK_THRESHOLD && !data.needsHandoff) {
                const intent = data.handoffIntent ?? "demo"
                const nudge =
                    intent === "support"
                        ? "정확한 확인이 필요한 내용으로 보여요. 상담으로 연결하면 계정, 결제, 장비 상태까지 함께 확인해드릴게요."
                        : "상황에 맞춘 도입 상담이 더 빠를 수 있어요. 학원 규모와 원하는 운영 방식에 맞춰 다음 단계를 안내해드릴게요."
                setMessages((current) => [
                    ...current,
                    {
                        id: makeId(),
                        role: "assistant",
                        content: nudge,
                        suggestedQuestions: [],
                        needsHandoff: true,
                        handoffIntent: intent,
                        showHandoffCTA: true,
                    },
                ])
            }

            requestAnimationFrame(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }))
        } catch (err) {
            setError(err instanceof Error ? err.message : "챗봇 응답 중 오류가 발생했습니다.")
            setIsDeepConsultation(true)
            setMessages((current) => [
                ...current,
                {
                    id: makeId(),
                    role: "assistant",
                    content: "지금은 답변을 불러오지 못했습니다. 급한 문의라면 상담으로 남겨주세요. 담당자가 상황을 확인해 이어서 안내드릴게요.",
                    suggestedQuestions: [],
                    needsHandoff: true,
                    handoffIntent: "demo",
                    showHandoffCTA: true,
                },
            ])
        } finally {
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
        <div className="fixed inset-x-4 bottom-[calc(5.5rem+env(safe-area-inset-bottom))] z-50 flex flex-col items-end md:inset-x-auto md:bottom-6 md:right-6">
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
                        className="mb-4 flex h-[min(560px,calc(100svh-8.5rem))] w-full max-w-[390px] flex-col overflow-hidden rounded-[16px] border border-black/[0.08] bg-white shadow-[rgba(0,0,0,0.10)_0px_20px_60px,rgba(0,0,0,0.05)_0px_8px_20px]"
                    >
                        <div className="flex items-center justify-between bg-[#009060] px-5 py-4 text-white">
                            <div className="flex min-w-0 items-center gap-3">
                                <div className="relative flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-[8px] bg-white/12">
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
                                        <Bot className="h-5 w-5" />
                                    )}
                                </div>
                                <div className="min-w-0">
                                    <h2 id="classin-chatbot-title" className="truncate text-[15px] font-bold">ClassIn 상담 가이드</h2>
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

                        <div className="flex-1 overflow-y-auto bg-[#F6F5F4]/55 px-4 py-4">
                            <div className="space-y-4">
                                {messages.map((message) => (
                                    <div
                                        key={message.id}
                                        className={cn(
                                            "flex",
                                            message.role === "user" ? "justify-end" : "justify-start"
                                        )}
                                    >
                                        <div
                                            className={cn(
                                                "max-w-[86%] rounded-[12px] px-3.5 py-3 text-sm leading-6",
                                                message.role === "user"
                                                    ? "bg-[#009060] text-white"
                                                    : "border border-black/[0.06] bg-white text-[#111110] shadow-sm"
                                            )}
                                        >
                                            <p className="whitespace-pre-line break-keep">{message.content}</p>
                                            {message.role === "assistant" ? (
                                                <>
                                                    <SourceLinks sources={message.sources ?? []} />
                                                    {(message.suggestedQuestions?.length ?? 0) > 0 ? (
                                                        <div className="mt-3 grid gap-2">
                                                            {message.suggestedQuestions?.map((question) => (
                                                                <button
                                                                    key={question}
                                                                    type="button"
                                                                    onClick={() => sendQuestion(question)}
                                                                    className="rounded-[8px] border border-[#084734]/15 bg-[#FAFAF8] px-3 py-2 text-left text-[12px] font-semibold leading-5 text-[#111110] transition-colors hover:border-[#084734]/35 hover:bg-[#ECFDF5]"
                                                                >
                                                                    {question}
                                                                </button>
                                                            ))}
                                                        </div>
                                                    ) : null}
                                                    {message.answerEventId || message.showHandoffCTA ? (
                                                        <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                                                            {message.answerEventId ? <FeedbackButtons answerEventId={message.answerEventId} sessionId={sessionId} /> : <span />}
                                                            {message.showHandoffCTA ? (
                                                                message.handoffIntent === "support" ? (
                                                                    <button
                                                                        type="button"
                                                                        onClick={() => {
                                                                            const opened = openChannelTalk()
                                                                            if (!opened) {
                                                                                window.location.href = "/contact"
                                                                            }
                                                                        }}
                                                                        className="inline-flex h-8 items-center justify-center rounded-[6px] bg-[#009060] px-3 text-xs font-bold text-white transition-colors hover:bg-[#007A52]"
                                                                    >
                                                                        실시간 상담 연결
                                                                    </button>
                                                                ) : (
                                                                    <Link
                                                                        href="/contact"
                                                                        className="inline-flex h-8 items-center justify-center rounded-[6px] bg-[#009060] px-3 text-xs font-bold text-white transition-colors hover:bg-[#007A52]"
                                                                    >
                                                                        도입 상담 남기기
                                                                    </Link>
                                                                )
                                                            ) : null}
                                                        </div>
                                                    ) : null}
                                                </>
                                            ) : null}
                                        </div>
                                    </div>
                                ))}

                                {isSending ? (
                                    <div className="flex justify-start">
                                        <div className="inline-flex items-center gap-2 rounded-[12px] border border-black/[0.06] bg-white px-3.5 py-3 text-sm text-[#615D59] shadow-sm">
                                            <Loader2 className="h-4 w-4 animate-spin text-[#084734]" />
                                            상황에 맞는 답변을 찾고 있어요
                                        </div>
                                    </div>
                                ) : null}
                                <div ref={bottomRef} />
                            </div>
                        </div>

                        {error ? (
                            <div className="border-t border-black/[0.06] bg-amber-50 px-4 py-2 text-xs font-medium text-amber-900">
                                {error}
                            </div>
                        ) : null}

                        <form onSubmit={handleSubmit} className="border-t border-black/[0.06] bg-white p-3">
                            <div className="flex items-end gap-2">
                                <textarea
                                    ref={inputRef}
                                    value={input}
                                    onChange={(event) => setInput(event.target.value)}
                                    onKeyDown={(event) => {
                                        if (event.key === "Enter" && !event.shiftKey) {
                                            event.preventDefault()
                                            void sendQuestion(input)
                                        }
                                    }}
                                    rows={1}
                                    maxLength={1000}
                                    placeholder="상담받고 싶은 내용을 입력하세요"
                                    className="min-h-10 max-h-28 flex-1 resize-none rounded-[8px] border border-[#E5E5E0] bg-white px-3 py-2 text-sm leading-6 text-[#111110] placeholder:text-[#A39E98] focus-visible:border-[#084734] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#084734]/20"
                                />
                                <button
                                    type="submit"
                                    disabled={isSending || !input.trim()}
                                    className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-[8px] bg-[#009060] text-white transition-colors hover:bg-[#007A52] disabled:cursor-not-allowed disabled:opacity-40"
                                    aria-label="질문 보내기"
                                >
                                    {isSending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                                </button>
                            </div>
                        </form>
                    </motion.div>
                )}
            </AnimatePresence>

            <motion.button
                ref={triggerRef}
                type="button"
                whileHover={shouldReduceMotion ? undefined : { scale: 1.04 }}
                whileTap={shouldReduceMotion ? undefined : { scale: 0.96 }}
                onClick={() => setIsOpen((current) => !current)}
                className="relative flex h-14 w-14 items-center justify-center overflow-hidden rounded-full bg-[#009060] text-white shadow-[0_10px_30px_rgba(0,144,96,0.32)] transition-colors hover:bg-[#007A52] focus:outline-none focus:ring-4 focus:ring-[#009060]/20 md:h-16 md:w-16"
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
    )
}
