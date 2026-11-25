"use client"

import { memo, useState, type RefObject } from "react"
import Link from "next/link"
import { AnimatePresence, motion, useReducedMotion } from "framer-motion"
import {
    ArrowRight,
    Check,
    Copy,
    ExternalLink,
    FileText,
    RotateCcw,
    ThumbsDown,
    ThumbsUp,
} from "lucide-react"

import { ClassInAIIcon } from "@/components/ui/ClassInAIIcon"
import { CHATBOT_HIT_AREA_CLASS } from "@/components/ui/chatbot-hit-area"
import type { ChatLinkClick } from "@/components/ui/chatbot-link-navigation"
import { ConsultationBridge } from "@/components/ui/chatbot/ConsultationBridge"
import {
    EASING_SOFT_ENTER,
    FOLLOW_UP_SUGGESTION_LIMIT,
    STARTER_SUGGESTION_LIMIT,
} from "@/components/ui/chatbot/constants"
import type { ChatbotSource, ChatMessage } from "@/components/ui/chatbot/types"
import { cn } from "@/lib/utils"
import { CHATBOT_MOTION, m } from "@/lib/chatbot/motion"

function getSuggestionLimit(message: ChatMessage) {
    return message.id === "welcome" ? STARTER_SUGGESTION_LIMIT : FOLLOW_UP_SUGGESTION_LIMIT
}

function AssistantMeta({ message }: { message: ChatMessage }) {
    const labels = [
        message.showHandoffCTA ? "상담 권장" : null,
    ].filter((label): label is string => Boolean(label))

    return (
        <div className="mb-2 flex items-center justify-between gap-2 border-b border-fg-accent/[0.08] pb-1.5">
            <div className="flex items-center gap-1.5 text-[11px] font-bold text-fg-accent">
                <ClassInAIIcon size={13} variant="brand" />
                <span>Classin AI</span>
            </div>
            {labels.length > 0 ? (
                <div className="flex flex-wrap gap-1.5">
                    {labels.map((label) => (
                        <span
                            key={label}
                            className={cn(
                                "inline-flex h-5 items-center rounded-full border px-2 text-[10px] font-bold",
                                label === "상담 권장"
                                    ? "border-fg-accent/15 bg-fg-accent/8 text-fg-accent"
                                    : "border-black/[0.06] bg-white/70 text-[#615D59]"
                            )}
                        >
                            {label}
                        </span>
                    ))}
                </div>
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
        <div className="flex items-center gap-2">
            <button
                type="button"
                onClick={() => sendFeedback("helpful")}
                className={cn(
                    "inline-flex h-9 w-9 items-center justify-center rounded-[8px] border border-white/70 bg-white/70 text-[#615D59] transition-colors hover:bg-fg-accent/8 hover:text-fg-accent",
                    CHATBOT_HIT_AREA_CLASS,
                    state === "helpful" && "border-fg-accent/25 bg-fg-accent/8 text-fg-accent"
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
                    "inline-flex h-9 w-9 items-center justify-center rounded-[8px] border border-white/70 bg-white/70 text-[#615D59] transition-colors hover:bg-fg-accent/8 hover:text-fg-accent",
                    CHATBOT_HIT_AREA_CLASS,
                    state === "not_helpful" && "border-fg-accent/25 bg-fg-accent/8 text-fg-accent"
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

export function sanitizeVisibleAssistantText(value: string) {
    return value
        .replace(/!\[[^\]]*]\([^)]*\)/g, "")
        .replace(/\[([^\]]+)]\((?:https?:\/\/|\/)[^)]+\)/g, "$1")
        .replace(/https?:\/\/[^\s)]+/g, "")
        .replace(/(?:\/docs|\/images|\/resources)\/[^\s)]+/g, "")
        .replace(/\[image[_\-\s]?\d*]/gi, "")
        // 제품 톤은 마크다운을 쓰지 않는다. 모델이 가끔 흘리는 **굵게** 표시는 평문으로 정리한다.
        .replace(/\*\*(.+?)\*\*/g, "$1")
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

function Caret({ shouldReduceMotion }: { shouldReduceMotion: boolean | null }) {
    return (
        <span
            className={cn(
                "inline-block w-[2px] h-[15px] ml-1.5 align-middle rounded-full bg-[#10B981] shadow-[0_0_8px_rgba(16,185,129,0.7)] shrink-0",
                shouldReduceMotion ? "opacity-100" : "animate-pulse"
            )}
            aria-hidden
        />
    )
}

// 이전 메시지들은 props(원시값)가 그대로라 memo로 재파싱(sanitize+split+regex) 건너뜀 — 스트리밍 버블만 갱신.
const MessageContent = memo(function MessageContent({
    content,
    role,
    isStreaming = false,
}: {
    content: string
    role: ChatMessage["role"]
    isStreaming?: boolean
}) {
    const shouldReduceMotion = useReducedMotion()
    const visibleContent = role === "assistant" ? sanitizeVisibleAssistantText(content) : content
    const blocks = visibleContent
        .trim()
        .split(/\n{2,}/)
        .map((block) => block.trim())
        .filter(Boolean)

    if (blocks.length === 0) return null

    return (
        <motion.div
            layout="position"
            initial={m({ opacity: 0.8 }, shouldReduceMotion)}
            animate={m({ opacity: 1 }, shouldReduceMotion)}
            transition={m(CHATBOT_MOTION.tokenFade, shouldReduceMotion)}
            className={cn(
                "space-y-2.5 whitespace-pre-wrap text-sm leading-6 [overflow-wrap:anywhere]",
                role === "assistant" ? "text-[#111110]" : "text-white"
            )}
        >
            {blocks.map((block, blockIndex) => {
                const isLastBlock = blockIndex === blocks.length - 1
                const showCaret = isStreaming && isLastBlock

                const lines = block
                    .split("\n")
                    .map((line) => line.trim())
                    .filter(Boolean)
                    .filter((line) => !/^(권장 순서|확인 기준):\s*$/i.test(line))
                const orderedItems = lines.map(orderedLineValue)
                const bulletItems = lines.map(bulletLineValue)

                if (orderedItems.length > 0 && orderedItems.every(Boolean)) {
                    return (
                        <ol key={`${blockIndex}:${block}`} className="space-y-2">
                            {orderedItems.map((item, index) => {
                                const isLastItem = index === orderedItems.length - 1
                                return (
                                    <li key={`${index}:${item}`} className="flex items-start gap-2.5">
                                        <span className="inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full border border-fg-accent/20 bg-fg-accent/8 text-[10px] font-bold text-fg-accent" aria-hidden="true">
                                            {index + 1}
                                        </span>
                                        <span className="flex-1">
                                            {item}
                                            {showCaret && isLastItem ? <Caret shouldReduceMotion={shouldReduceMotion} /> : null}
                                        </span>
                                    </li>
                                )
                            })}
                        </ol>
                    )
                }

                if (bulletItems.length > 0 && bulletItems.every(Boolean)) {
                    return (
                        <ul key={`${blockIndex}:${block}`} className="space-y-2">
                            {bulletItems.map((item, index) => {
                                const isLastItem = index === bulletItems.length - 1
                                return (
                                    <li key={`${index}:${item}`} className="flex items-start gap-2.5">
                                        <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-fg-accent" aria-hidden="true" />
                                        <span className="flex-1">
                                            {item}
                                            {showCaret && isLastItem ? <Caret shouldReduceMotion={shouldReduceMotion} /> : null}
                                        </span>
                                    </li>
                                )
                            })}
                        </ul>
                    )
                }

                // 리드 문장 + 뒤따르는 불릿 목록(예: "보통 이렇게 묶여요.\n- A\n- B")은
                // 리드 줄을 문단으로, 나머지를 불릿 리스트로 분리해 렌더링한다. 불릿이 섞인 본문에서
                // 날 대시("- ")가 그대로 보이던 문제를 막는다. 불릿 뒤에 다시 평문이 오는 혼합 블록은
                // 오인 렌더를 피하려 이 분기에서 처리하지 않고 아래 <p> 로 보낸다.
                const firstBulletIndex = lines.findIndex((line) => bulletLineValue(line) !== undefined)
                if (
                    firstBulletIndex > 0 &&
                    lines.slice(firstBulletIndex).every((line) => bulletLineValue(line) !== undefined)
                ) {
                    const leadLines = lines.slice(0, firstBulletIndex).map(cleanMessageLine).filter(Boolean)
                    const trailingBullets = lines
                        .slice(firstBulletIndex)
                        .map(bulletLineValue)
                        .filter((value): value is string => Boolean(value))
                    return (
                        <div key={`${blockIndex}:${block}`} className="space-y-2">
                            {leadLines.length > 0 && (
                                <p>
                                    {leadLines.join("\n")}
                                    {showCaret && trailingBullets.length === 0 ? <Caret shouldReduceMotion={shouldReduceMotion} /> : null}
                                </p>
                            )}
                            <ul className="space-y-2">
                                {trailingBullets.map((item, index) => {
                                    const isLastItem = index === trailingBullets.length - 1
                                    return (
                                        <li key={`${index}:${item}`} className="flex items-start gap-2.5">
                                            <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-fg-accent" aria-hidden="true" />
                                            <span className="flex-1">
                                                {item}
                                                {showCaret && isLastItem ? <Caret shouldReduceMotion={shouldReduceMotion} /> : null}
                                            </span>
                                        </li>
                                    )
                                })}
                            </ul>
                        </div>
                    )
                }

                return (
                    <p key={`${blockIndex}:${block}`}>
                        {lines.map(cleanMessageLine).filter(Boolean).join("\n")}
                        {showCaret ? <Caret shouldReduceMotion={shouldReduceMotion} /> : null}
                    </p>
                )
            })}
        </motion.div>
    )
})

function AnswerCopyButton({ message }: { message: ChatMessage }) {
    const shouldReduceMotion = useReducedMotion()
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
        <motion.button
            type="button"
            whileHover={shouldReduceMotion ? undefined : { scale: 1.03 }}
            whileTap={shouldReduceMotion ? undefined : { scale: 0.96 }}
            onClick={() => void copyAnswer()}
            className={cn(
                "inline-flex h-9 items-center justify-center gap-1.5 rounded-[8px] border px-2.5 text-[11px] font-bold transition-all shadow-[0_1px_2px_rgba(0,0,0,0.03)]",
                CHATBOT_HIT_AREA_CLASS,
                state === "copied"
                    ? "border-fg-accent/30 bg-fg-accent/8 text-fg-accent"
                    : state === "failed"
                      ? "border-[#B85C33]/20 bg-[#FBEAE2] text-[#7A2A13]"
                      : "border-white/80 bg-white/80 text-[#615D59] hover:border-fg-accent/20 hover:bg-fg-accent/8 hover:text-fg-accent"
            )}
            aria-label="답변 복사"
            title="답변 복사"
        >
            <AnimatePresence mode="wait" initial={false}>
                {state === "copied" ? (
                    <motion.span
                        key="copied"
                        initial={{ scale: 0.8, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        exit={{ scale: 0.8, opacity: 0 }}
                        transition={{ duration: 0.15 }}
                        className="flex items-center gap-1"
                    >
                        <Check className="h-3.5 w-3.5 text-fg-accent" />
                        <span>복사 완료</span>
                    </motion.span>
                ) : (
                    <motion.span
                        key="copy"
                        initial={{ scale: 0.8, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        exit={{ scale: 0.8, opacity: 0 }}
                        transition={{ duration: 0.15 }}
                        className="flex items-center gap-1"
                    >
                        <Copy className="h-3.5 w-3.5" />
                        <span>{state === "failed" ? "실패" : "답변 복사"}</span>
                    </motion.span>
                )}
            </AnimatePresence>
        </motion.button>
    )
}

function SourceLinks({
    sources,
    onNavigate,
}: {
    sources?: ChatbotSource[]
    onNavigate?: (click: ChatLinkClick) => void
}) {
    const shouldReduceMotion = useReducedMotion()
    const visibleSources = sources?.slice(0, 2) ?? []
    if (visibleSources.length === 0) return null

    return (
        <div className="mt-3 space-y-1.5 border-t border-fg-accent/10 pt-3">
            <div className="flex items-center gap-1.5 text-[11px] font-bold text-[#615D59]">
                <FileText className="h-3.5 w-3.5 text-fg-accent" aria-hidden="true" />
                <span>참고한 공식 가이드</span>
            </div>
            {visibleSources.map((source, index) => {
                // 첫 번째 출처는 점수가 가장 높은 '가장 관련 높은' 가이드 — 시각적으로 강조한다.
                const isTopMatch = index === 0
                return (
                    <motion.div
                        key={`${source.urlPath}:${source.heading ?? source.title}`}
                        initial={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, y: 6 }}
                        animate={shouldReduceMotion ? { opacity: 1 } : { opacity: 1, y: 0 }}
                        transition={{
                            duration: shouldReduceMotion ? 0.01 : 0.26,
                            ease: EASING_SOFT_ENTER,
                            delay: shouldReduceMotion ? 0 : index * 0.07,
                        }}
                    >
                        <Link
                            href={source.urlPath}
                            onClick={(event) => onNavigate?.(event)}
                            className={cn(
                                "group block rounded-[12px] border px-3 py-2 text-left transition-all focus-visible:outline-none",
                                isTopMatch
                                    ? "border-fg-accent/25 bg-fg-accent/6 hover:border-fg-accent/40 hover:bg-fg-accent/8"
                                    : "border-white/70 bg-white/60 shadow-[inset_0_1px_0_rgba(255,255,255,0.60)] hover:border-fg-accent/25 hover:bg-fg-accent/7"
                            )}
                        >
                            <span className="flex items-start justify-between gap-2 text-[12px] font-bold leading-5 text-[#111110]">
                                <span className="flex min-w-0 items-center gap-1.5">
                                    {isTopMatch ? (
                                        <span className="shrink-0 rounded-full bg-fg-accent px-1.5 py-0.5 text-[9px] font-bold leading-none text-fg-on-accent">
                                            추천
                                        </span>
                                    ) : null}
                                    <span className="min-w-0 transition-colors group-hover:text-fg-accent">{source.title}</span>
                                </span>
                                <ExternalLink className="mt-0.5 h-3.5 w-3.5 shrink-0 text-fg-accent/70 transition-transform group-hover:translate-x-0.5 group-hover:text-fg-accent" aria-hidden />
                            </span>
                            {source.heading ? (
                                <span className="mt-0.5 block text-[11px] leading-4 text-[#615D59]">
                                    {source.heading}
                                </span>
                            ) : null}
                        </Link>
                    </motion.div>
                )
            })}
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
            initial={m({ opacity: 0, y: 10, scale: 0.96 }, shouldReduceMotion)}
            animate={m({ opacity: 1, y: 0, scale: 1 }, shouldReduceMotion)}
            exit={m({ opacity: 0, y: -6, scale: 0.98 }, shouldReduceMotion)}
            transition={m(CHATBOT_MOTION.enter, shouldReduceMotion)}
            className="flex justify-start"
        >
            <div
                role="status"
                aria-live="off"
                className="relative overflow-hidden rounded-[18px] rounded-bl-[6px] border border-white/80 bg-[linear-gradient(160deg,rgba(255,255,255,0.92)_0%,rgba(246,253,249,0.85)_100%)] p-3 text-sm backdrop-blur-xl"
            >
                {/* 은은한 쉬머 반사 광택 */}
                {!shouldReduceMotion && (
                    <motion.div
                        aria-hidden
                        className="pointer-events-none absolute inset-0 -translate-x-full bg-[linear-gradient(90deg,transparent_0%,rgba(16,185,129,0.08)_50%,transparent_100%)]"
                        animate={{ translateX: ["-100%", "200%"] }}
                        transition={{ duration: 2.2, repeat: Infinity, ease: "easeInOut" }}
                    />
                )}

                <div className="flex items-center gap-2.5">
                    <div className="relative flex h-6 w-6 shrink-0 items-center justify-center rounded-[8px] border border-fg-accent/15 bg-fg-accent/8 shadow-sm">
                        <ClassInAIIcon size={13} variant="brand" className="text-fg-accent" />
                        {!shouldReduceMotion && (
                            <motion.span
                                aria-hidden
                                className="pointer-events-none absolute inset-0 rounded-[8px] border border-[#10B981]/50"
                                animate={{ scale: [1, 1.25, 1], opacity: [0.6, 0, 0.6] }}
                                transition={{ duration: 2, repeat: Infinity, ease: "easeOut" }}
                            />
                        )}
                    </div>
                    <div className="flex items-center gap-2">
                        <span className="text-xs font-semibold text-fg-accent">ClassIn 가이드 확인 중</span>
                        <div className="flex items-center gap-1" aria-hidden>
                            {[0, 1, 2].map((index) => (
                                <motion.span
                                    key={index}
                                    className="h-1.5 w-1.5 rounded-full bg-fg-accent"
                                    animate={
                                        shouldReduceMotion
                                            ? { opacity: 0.5 }
                                            : { y: [0, -3.5, 0], opacity: [0.35, 1, 0.35] }
                                    }
                                    transition={
                                        shouldReduceMotion
                                            ? undefined
                                            : { duration: 1.1, repeat: Infinity, ease: "easeInOut", delay: index * 0.15 }
                                    }
                                />
                            ))}
                        </div>
                    </div>
                </div>

                {/* 스켈레톤 로딩 바 */}
                <div className="mt-2 space-y-1.5 w-40">
                    <div className="h-1.5 w-full rounded-full bg-fg-accent/[0.08]" />
                    <div className="h-1.5 w-2/3 rounded-full bg-fg-accent/[0.05]" />
                </div>
            </div>
        </motion.div>
    )
}

interface MessageListProps {
    messages: ChatMessage[]
    sessionId?: string
    isSending: boolean
    isStreaming: boolean
    shouldReduceMotion: boolean | null
    sendQuestion: (question: string) => Promise<void>
    closeAfterInChatNavigation: (click: ChatLinkClick) => void
    bottomRef: RefObject<HTMLDivElement | null>
}

// 대화 목록. 입력 상태는 ChatComposer 가 들고 있어 글자를 칠 때 셸이 다시 그려지지 않고,
// 셸이 다른 이유(스크롤 위치·음소거 등)로 다시 그려져도 props 가 같으면 목록은 건너뛴다.
export const MessageList = memo(function MessageList({
    messages,
    sessionId,
    isSending,
    isStreaming,
    shouldReduceMotion,
    sendQuestion,
    closeAfterInChatNavigation,
    bottomRef,
}: MessageListProps) {
    return (
        <div className="space-y-4">
            <AnimatePresence mode="popLayout" initial={false}>
                {messages.map((message, index) => {
                    const isLast = index === messages.length - 1
                    const isAssistantStreaming = isLast && message.role === "assistant" && isStreaming
                    return (
                        <motion.div
                            key={message.id}
                            data-chat-message-id={message.id}
                            layout="position"
                            initial={m({ opacity: 0, y: 10, scale: 0.98 }, shouldReduceMotion)}
                            animate={m({ opacity: 1, y: 0, scale: 1 }, shouldReduceMotion)}
                            exit={m({ opacity: 0, y: -6, scale: 0.98 }, shouldReduceMotion)}
                            transition={m(CHATBOT_MOTION.enter, shouldReduceMotion)}
                            className={cn(
                                "flex",
                                message.role === "user" ? "justify-end" : "justify-start"
                            )}
                        >
                            <div
                                className={cn(
                                    "max-w-[92%] rounded-[18px] px-3.5 py-3 text-sm leading-6 backdrop-blur-xl md:max-w-[84%]",
                                    message.role === "user"
                                        ? "rounded-br-[6px] bg-fg-accent text-fg-on-accent ring-1 ring-white/20"
                                        : "rounded-bl-[6px] border border-white/80 bg-[linear-gradient(160deg,rgba(255,255,255,0.92)_0%,rgba(246,253,249,0.85)_100%)] text-[#111110]"
                                )}
                            >
                                {message.role === "assistant" ? <AssistantMeta message={message} /> : null}
                                <MessageContent
                                    content={message.content}
                                    role={message.role}
                                    isStreaming={isAssistantStreaming}
                                />
                                {message.role === "assistant" ? (
                                    <>
                                        <SourceLinks sources={message.sources} onNavigate={closeAfterInChatNavigation} />
                                        {message.retryQuestion ? (
                                            <div className="mt-3">
                                                <button
                                                    type="button"
                                                    onClick={() => void sendQuestion(message.retryQuestion ?? "")}
                                                    disabled={isSending}
                                                    className="inline-flex h-9 items-center justify-center gap-1.5 rounded-[8px] border border-fg-accent/20 bg-fg-accent/6 px-3 text-xs font-bold text-fg-accent transition-colors hover:bg-fg-accent/14 disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none"
                                                >
                                                    <RotateCcw className="h-3.5 w-3.5" aria-hidden />
                                                    다시 시도
                                                </button>
                                            </div>
                                        ) : null}
                                        {(message.suggestedQuestions?.length ?? 0) > 0 ? (
                                            <div className="mt-3 space-y-2">
                                                {message.id === "welcome" ? (
                                                    <div className="flex items-center gap-1.5 px-0.5 text-[11px] font-bold text-[#615D59]">
                                                        <span className="h-1.5 w-1.5 rounded-full bg-fg-accent" />
                                                        추천 질문으로 바로 시작하기
                                                    </div>
                                                ) : null}
                                                <div className="grid gap-2">
                                                    {message.suggestedQuestions?.slice(0, getSuggestionLimit(message)).map((question, index) => (
                                                        <motion.button
                                                            key={question}
                                                            type="button"
                                                            disabled={isSending}
                                                            onClick={() => sendQuestion(question)}
                                                            initial={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, y: 6 }}
                                                            animate={shouldReduceMotion ? { opacity: 1 } : { opacity: 1, y: 0 }}
                                                            transition={{
                                                                duration: shouldReduceMotion ? 0.01 : 0.24,
                                                                ease: EASING_SOFT_ENTER,
                                                                delay: shouldReduceMotion ? 0 : index * 0.06,
                                                            }}
                                                            whileTap={shouldReduceMotion ? undefined : { scale: 0.98 }}
                                                            className="group flex w-full items-center justify-between gap-2 whitespace-normal break-keep rounded-[12px] border border-fg-accent/15 bg-white/75 px-3.5 py-2.5 text-left text-[12px] font-semibold leading-5 text-fg-accent transition-all hover:border-fg-accent/30 hover:bg-fg-accent/8 disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none"
                                                        >
                                                            <span>{question}</span>
                                                            <ArrowRight className="h-3.5 w-3.5 shrink-0 text-fg-accent/70 transition-transform group-hover:translate-x-0.5" aria-hidden />
                                                        </motion.button>
                                                    ))}
                                                </div>
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
                                            <ConsultationBridge
                                                messages={messages}
                                                message={message}
                                                sessionId={sessionId}
                                                onNavigate={closeAfterInChatNavigation}
                                            />
                                        ) : null}
                                    </>
                                ) : null}
                            </div>
                        </motion.div>
                    )
                })}

                {isSending && !isStreaming ? (
                    <ThinkingIndicator key="thinking" shouldReduceMotion={shouldReduceMotion} />
                ) : null}
            </AnimatePresence>
            <div ref={bottomRef} />
        </div>
    )
})
