"use client"

import { FormEvent, memo, useEffect, useMemo, useRef, useState } from "react"
import Image from "next/image"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { AnimatePresence, motion, useReducedMotion } from "framer-motion"
import {
    ArrowRight,
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
import { trackEvent } from "@/lib/analytics"
import { resolvePageContext, mergeStarters } from "@/lib/chatbot/page-context"
import {
    CHATBOT_OPEN_EVENT,
    openChatbot,
    type ChatbotOpenDetail,
    type ChatbotOpenSource,
} from "@/lib/chatbot/open-chatbot"
import { ChatbotTeaser } from "@/components/ui/ChatbotTeaser"
import { useChatbotTeaser } from "@/components/ui/useChatbotTeaser"

type HandoffIntent = "demo" | "support"

const UNRESOLVED_STREAK_THRESHOLD = 3
const CHATBOT_REQUEST_TIMEOUT_MS = 14_000
const STARTER_SUGGESTION_LIMIT = 4
const FOLLOW_UP_SUGGESTION_LIMIT = 3
const ANSWER_SCROLL_TOP_OFFSET_PX = 32
// 공용 진입 이징 — 메시지·출처·추천 질문 등 대화 표면 애니메이션을 한 곡선으로 맞춘다.
const EASING_SOFT_ENTER = [0.22, 1, 0.36, 1] as const

interface ChatbotSource {
    title: string
    heading?: string
    urlPath: string
    category: string
    excerpt: string
    score: number
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

// /api/chatbot/query/stream 의 NDJSON 이벤트(서버 ChatbotStreamEvent 와 구조 일치).
// server-only 모듈을 클라이언트에서 import 하지 않기 위해 형태만 로컬에 둔다.
interface ChatbotStreamMeta {
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

type ChatbotStreamEvent =
    | { type: "delta"; text: string }
    | { type: "replace"; answer: string }
    | { type: "meta"; meta: ChatbotStreamMeta }
    | { type: "error"; error: string }

const hiddenPathPrefixes = [
    "/admin",
    "/api",
    "/checkout",
    "/pricing",
    "/receipt",
]

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
                        "inline-flex h-6 items-center rounded-full border px-2.5 text-[11px] font-bold",
                        label === "상담 권장"
                            ? "border-[#084734]/10 bg-[#ECFDF5]/80 text-[#084734]"
                            : "border-black/[0.06] bg-white/70 text-[#615D59]"
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
    const shouldReduceMotion = useReducedMotion()
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
        <motion.div
            initial={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, y: 8 }}
            animate={shouldReduceMotion ? { opacity: 1 } : { opacity: 1, y: 0 }}
            transition={{ duration: shouldReduceMotion ? 0.01 : 0.28, ease: EASING_SOFT_ENTER }}
            className="mt-3 border-t border-[#084734]/10 pt-3"
        >
            <div className="flex items-center gap-2 text-[12px] font-bold text-[#084734]">
                <MessageCircle className="h-4 w-4" />
                상담 연결
            </div>
            <p className="mt-1 text-[11px] leading-4 text-[#615D59]">
                {formatActionMessage(message.handoffIntent ?? "support", draftLineCount)}
            </p>
            <div className="mt-2 rounded-[12px] border border-white/70 bg-[#ECFDF5]/45 px-3 py-2 text-[12px] leading-5 text-[#3B3835] shadow-[inset_0_1px_0_rgba(255,255,255,0.65)]">
                <p className="whitespace-pre-line [overflow-wrap:anywhere]">{draft}</p>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2">
                <motion.button
                    type="button"
                    onClick={openConsultation}
                    whileHover={shouldReduceMotion ? undefined : { scale: 1.03 }}
                    whileTap={shouldReduceMotion ? undefined : { scale: 0.97 }}
                    className="inline-flex h-9 items-center justify-center gap-1.5 rounded-[8px] bg-[#084734] px-3 text-xs font-bold text-white shadow-[0_6px_14px_rgba(8,71,52,0.18)] transition-colors hover:bg-[#065c41] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#084734]/30"
                >
                    <MessageCircle className="h-3.5 w-3.5" />
                    {intentLabel}
                </motion.button>
                <motion.button
                    type="button"
                    onClick={() => void copyDraft()}
                    whileHover={shouldReduceMotion ? undefined : { scale: 1.03 }}
                    whileTap={shouldReduceMotion ? undefined : { scale: 0.97 }}
                    className="inline-flex h-9 items-center justify-center gap-1.5 rounded-[8px] border border-white/70 bg-white/70 px-3 text-xs font-bold text-[#111110] transition-colors hover:bg-[#ECFDF5] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#084734]/25"
                >
                    {state === "copied" ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                    요약 복사
                </motion.button>
                <Link
                    href={contactHref}
                    className="inline-flex h-9 items-center justify-center rounded-[8px] px-2 text-xs font-bold text-[#615D59] transition-colors hover:bg-white/70 hover:text-[#084734]"
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
        </motion.div>
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
                    "inline-flex h-8 w-8 items-center justify-center rounded-[8px] border border-white/70 bg-white/70 text-[#615D59] transition-colors hover:bg-[#ECFDF5] hover:text-[#084734]",
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
                    "inline-flex h-8 w-8 items-center justify-center rounded-[8px] border border-white/70 bg-white/70 text-[#615D59] transition-colors hover:bg-[#ECFDF5] hover:text-[#084734]",
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

// 이전 메시지들은 props(원시값)가 그대로라 memo로 재파싱(sanitize+split+regex) 건너뜀 — 스트리밍 버블만 갱신.
const MessageContent = memo(function MessageContent({ content, role }: { content: string; role: ChatMessage["role"] }) {
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
                        <div key={`${blockIndex}:${block}`} className="space-y-1.5">
                            {leadLines.length > 0 && <p>{leadLines.join("\n")}</p>}
                            <ul className="ml-4 list-disc space-y-1.5 marker:text-[#0e5038]">
                                {trailingBullets.map((item, index) => (
                                    <li key={`${index}:${item}`}>{item}</li>
                                ))}
                            </ul>
                        </div>
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
})

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
                "inline-flex h-8 items-center justify-center gap-1.5 rounded-[8px] border border-white/70 bg-white/70 px-2.5 text-[11px] font-bold text-[#615D59] transition-colors hover:bg-[#ECFDF5] hover:text-[#084734]",
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
    const shouldReduceMotion = useReducedMotion()
    const visibleSources = sources?.slice(0, 2) ?? []
    if (visibleSources.length === 0) return null

    return (
        <div className="mt-3 space-y-1.5 border-t border-[#084734]/10 pt-3">
            <div className="text-[11px] font-bold text-[#615D59]">참고한 가이드</div>
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
                            className={cn(
                                "block rounded-[12px] border px-3 py-2 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#084734]/25",
                                isTopMatch
                                    ? "border-[#084734]/25 bg-[#ECFDF5]/70 shadow-[inset_0_1px_0_rgba(255,255,255,0.70),0_2px_8px_rgba(8,71,52,0.06)] hover:bg-[#ECFDF5]"
                                    : "border-white/70 bg-white/60 shadow-[inset_0_1px_0_rgba(255,255,255,0.60)] hover:bg-[#ECFDF5]/90"
                            )}
                        >
                            <span className="flex items-start justify-between gap-2 text-[12px] font-bold leading-5 text-[#111110]">
                                <span className="flex min-w-0 items-center gap-1.5">
                                    {isTopMatch ? (
                                        <span className="shrink-0 rounded-full bg-[#084734] px-1.5 py-0.5 text-[9px] font-bold leading-none text-white">
                                            추천
                                        </span>
                                    ) : null}
                                    <span className="min-w-0">{source.title}</span>
                                </span>
                                <ExternalLink className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#084734]" aria-hidden />
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
            initial={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, y: 8 }}
            animate={shouldReduceMotion ? { opacity: 1 } : { opacity: 1, y: 0 }}
            transition={{ duration: shouldReduceMotion ? 0.01 : 0.18, ease: "easeOut" }}
            className="flex justify-start"
        >
            <div
                role="status"
                aria-live="polite"
                className="inline-flex items-center gap-2 rounded-[14px] border border-white/70 bg-white/70 px-3.5 py-2.5 shadow-[0_10px_22px_rgba(49,48,46,0.07),inset_0_1px_0_rgba(255,255,255,0.65)] backdrop-blur-xl"
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
    const [isStreaming, setIsStreaming] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [isDeepConsultation, setIsDeepConsultation] = useState(false)
    const [unresolvedStreak, setUnresolvedStreak] = useState(0)
    const bottomRef = useRef<HTMLDivElement | null>(null)
    const messagesContainerRef = useRef<HTMLDivElement | null>(null)
    const pendingAssistantScrollIdRef = useRef<string | null>(null)
    const inputRef = useRef<HTMLTextAreaElement | null>(null)
    const triggerRef = useRef<HTMLButtonElement | null>(null)
    const [messages, setMessages] = useState<ChatMessage[]>(() => [
        {
            id: "welcome",
            role: "assistant",
            content: CLASSIN_POSITIONING.chatbot.welcome,
            suggestedQuestions: resolvePageContext(pathname).starters.slice(0, STARTER_SUGGESTION_LIMIT),
        },
    ])

    const hidden = shouldHideChatbot(pathname)

    const pageContext = useMemo(() => resolvePageContext(pathname), [pathname])
    const chatbotTeaser = useChatbotTeaser({ pathname, isOpen })
    const openSourceRef = useRef<ChatbotOpenSource>("button")
    const wasOpenRef = useRef(false)
    const firstQuestionSentRef = useRef(false)
    const teaserShownTrackedRef = useRef(false)

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
    }, [isOpen, shouldReduceMotion])

    useEffect(() => {
        if (!isOpen) return
        const messageId = pendingAssistantScrollIdRef.current
        if (!messageId) return

        const container = messagesContainerRef.current
        const message = container?.querySelector<HTMLElement>(`[data-chat-message-id="${messageId}"]`)
        if (!container || !message) return

        const containerRect = container.getBoundingClientRect()
        const messageRect = message.getBoundingClientRect()
        const nextTop = container.scrollTop + messageRect.top - containerRect.top - ANSWER_SCROLL_TOP_OFFSET_PX

        container.scrollTop = Math.max(0, nextTop)
        const alignedTop = message.getBoundingClientRect().top - container.getBoundingClientRect().top
        if (!isSending || alignedTop <= ANSWER_SCROLL_TOP_OFFSET_PX + 2) {
            pendingAssistantScrollIdRef.current = null
        }
    }, [isOpen, isSending, messages, shouldReduceMotion])


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

    useEffect(() => {
        const handler = (event: Event) => {
            const detail = (event as CustomEvent<ChatbotOpenDetail>).detail
            openSourceRef.current = detail?.source ?? "cta"
            if (detail?.prefill) setInput(detail.prefill)
            if (detail?.intent === "support") setIsDeepConsultation(true)
            setIsOpen(true)
        }
        window.addEventListener(CHATBOT_OPEN_EVENT, handler)
        return () => window.removeEventListener(CHATBOT_OPEN_EVENT, handler)
    }, [])

    useEffect(() => {
        if (isOpen && !wasOpenRef.current) {
            trackEvent("chatbot_opened", { source: openSourceRef.current })
        }
        wasOpenRef.current = isOpen
    }, [isOpen])

    useEffect(() => {
        if (chatbotTeaser.show && !teaserShownTrackedRef.current) {
            teaserShownTrackedRef.current = true
            trackEvent("chatbot_teaser_shown", { path: pathname })
        }
    }, [chatbotTeaser.show, pathname])

    if (hidden) return null

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

        setInput("")
        setError(null)
        setIsSending(true)
        setIsStreaming(false)

        const userMessage: ChatMessage = {
            id: makeId(),
            role: "user",
            content: trimmed,
        }

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
                    context,
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
                }))

                if (nextStreak >= UNRESOLVED_STREAK_THRESHOLD && !meta.needsHandoff) {
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
            }
        } catch (err) {
            const isAbort = err instanceof DOMException && err.name === "AbortError"
            setError(isAbort ? "응답이 지연되고 있습니다. 잠깐 후 다시 시도해 주세요." : err instanceof Error ? err.message : "챗봇 응답 중 오류가 발생했습니다.")
            const errorContent = isAbort
                ? "응답이 지연되고 있어요. 같은 질문을 다시 시도하거나 질문을 조금 더 짧게 보내주세요."
                : "지금은 답변을 불러오지 못했습니다. 같은 질문을 다시 시도할 수 있어요."
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
                        initial={
                            shouldReduceMotion
                                ? { opacity: 0 }
                                : { opacity: 0, y: 24, scale: 0.94, filter: "blur(10px)" }
                        }
                        animate={
                            shouldReduceMotion
                                ? { opacity: 1 }
                                : { opacity: 1, y: 0, scale: 1, filter: "blur(0px)" }
                        }
                        exit={
                            shouldReduceMotion
                                ? { opacity: 0 }
                                : { opacity: 0, y: 18, scale: 0.96, filter: "blur(8px)" }
                        }
                        transition={
                            shouldReduceMotion
                                ? { duration: 0.01 }
                                : { type: "spring", stiffness: 380, damping: 32, mass: 0.9 }
                        }
                        className="relative mb-3 flex h-[min(680px,calc(100svh-5.5rem))] w-full max-w-none overflow-hidden rounded-[26px] border border-white/60 bg-[linear-gradient(152deg,rgba(255,255,255,0.88)_0%,rgba(236,253,245,0.76)_50%,rgba(246,245,244,0.82)_100%)] text-[#111110] shadow-[0_34px_80px_rgba(8,71,52,0.18),0_18px_42px_rgba(49,48,46,0.10),0_4px_12px_rgba(0,0,0,0.05),inset_0_1px_0_rgba(255,255,255,0.72)] backdrop-blur-2xl md:mb-4 md:h-[min(640px,calc(100svh-8rem))] md:w-[424px] md:max-w-[424px]"
                    >
                        <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(255,255,255,0.48)_0%,rgba(255,255,255,0.12)_42%,rgba(8,71,52,0.06)_100%)]" aria-hidden />
                        <div className="pointer-events-none absolute inset-x-5 top-0 h-px bg-white/80" aria-hidden />

                        <div className="relative flex min-h-0 w-full flex-col">
                            <div className="flex items-center justify-between border-b border-white/50 bg-white/20 px-4 py-3.5 backdrop-blur-xl">
                                <div className="flex min-w-0 items-center gap-3">
                                    <div className="relative flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-[14px] border border-white/70 bg-[linear-gradient(145deg,rgba(255,255,255,0.82),rgba(209,250,229,0.50))] shadow-[0_10px_26px_rgba(8,71,52,0.12),inset_0_1px_0_rgba(255,255,255,0.80)]">
                                        {isDeepConsultation ? (
                                            <>
                                                <Image
                                                    src={DEEP_CONSULTATION_ICON_SRC}
                                                    alt=""
                                                    fill
                                                    className="object-cover opacity-95"
                                                    sizes="44px"
                                                    aria-hidden
                                                />
                                                <span className="absolute inset-0 bg-[#ECFDF5]/20 mix-blend-soft-light" aria-hidden />
                                            </>
                                        ) : (
                                            <>
                                                <span className="absolute inset-1 rounded-[10px] bg-[#ECFDF5]/80" aria-hidden />
                                                <Bot className="relative h-5 w-5 text-[#084734]" />
                                            </>
                                        )}
                                    </div>
                                    <div className="min-w-0">
                                        <div className="flex items-center gap-1.5">
                                            <h2 id="classin-chatbot-title" className="truncate text-[15px] font-bold text-[#111110]">Classin 상담 가이드</h2>
                                            <motion.span
                                                aria-hidden
                                                className="h-2 w-2 shrink-0 rounded-full bg-[#084734] shadow-[0_0_0_3px_rgba(8,71,52,0.12),0_0_14px_rgba(8,71,52,0.32)]"
                                                animate={shouldReduceMotion ? undefined : { opacity: [1, 0.45, 1], scale: [1, 0.82, 1] }}
                                                transition={shouldReduceMotion ? undefined : { duration: 2.6, repeat: Infinity, ease: "easeInOut" }}
                                            />
                                        </div>
                                        <p className="mt-0.5 truncate text-xs font-medium text-[#615D59]">운영·도입·CS 상담</p>
                                    </div>
                                </div>
                                <button
                                    type="button"
                                    onClick={closeChatbot}
                                    className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/60 bg-white/35 text-[#615D59] shadow-[inset_0_1px_0_rgba(255,255,255,0.60)] transition-colors hover:bg-white/70 hover:text-[#084734] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#084734]/25"
                                    aria-label="챗봇 닫기"
                                >
                                    <X className="h-5 w-5" />
                                </button>
                            </div>

                            <div
                                ref={messagesContainerRef}
                                className="min-h-0 flex-1 overflow-y-auto px-3.5 py-4 [scrollbar-color:rgba(8,71,52,0.28)_transparent] [scrollbar-gutter:stable] [scrollbar-width:thin] md:px-4 [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-[#084734]/25 [&::-webkit-scrollbar-track]:bg-transparent"
                                role="log"
                                aria-live="polite"
                                aria-relevant="additions"
                            >
                                <div className="space-y-4">
                                    {messages.map((message) => (
                                        <motion.div
                                            key={message.id}
                                            data-chat-message-id={message.id}
                                            initial={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, y: 10, scale: 0.98 }}
                                            animate={shouldReduceMotion ? { opacity: 1 } : { opacity: 1, y: 0, scale: 1 }}
                                            transition={{ duration: shouldReduceMotion ? 0.01 : 0.28, ease: EASING_SOFT_ENTER }}
                                            className={cn(
                                                "flex",
                                                message.role === "user" ? "justify-end" : "justify-start"
                                            )}
                                        >
                                            <div
                                                className={cn(
                                                    "max-w-[92%] rounded-[18px] px-3.5 py-3 text-sm leading-6 backdrop-blur-xl md:max-w-[84%]",
                                                    message.role === "user"
                                                        ? "rounded-br-[6px] bg-[linear-gradient(145deg,#084734,#0A5A40)] text-white shadow-[0_12px_26px_rgba(8,71,52,0.22),0_3px_8px_rgba(8,71,52,0.16)] ring-1 ring-white/20"
                                                        : "rounded-bl-[6px] border border-white/70 bg-white/75 text-[#111110] shadow-[0_12px_30px_rgba(49,48,46,0.08),0_2px_6px_rgba(0,0,0,0.04)]"
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
                                                                    className="inline-flex h-9 items-center justify-center gap-1.5 rounded-[8px] border border-[#084734]/20 bg-[#ECFDF5]/80 px-3 text-xs font-bold text-[#084734] transition-colors hover:bg-[#D1FAE5] disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#084734]/25"
                                                                >
                                                                    <RotateCcw className="h-3.5 w-3.5" aria-hidden />
                                                                    다시 시도
                                                                </button>
                                                            </div>
                                                        ) : null}
                                                        {(message.suggestedQuestions?.length ?? 0) > 0 ? (
                                                            <div className="mt-3 grid gap-2">
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
                                                                        className="flex w-full items-center justify-between gap-2 whitespace-normal break-keep rounded-[12px] border border-[#084734]/15 bg-white/60 px-3.5 py-2.5 text-left text-[12px] font-semibold leading-5 text-[#084734] shadow-[inset_0_1px_0_rgba(255,255,255,0.60)] transition-colors hover:border-[#084734]/30 hover:bg-[#ECFDF5]/90 disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#084734]/25"
                                                                    >
                                                                        <span>{question}</span>
                                                                        <ArrowRight className="h-3.5 w-3.5 shrink-0" aria-hidden />
                                                                    </motion.button>
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

                                    {isSending && !isStreaming ? (
                                        <ThinkingIndicator shouldReduceMotion={shouldReduceMotion} />
                                    ) : null}
                                    <div ref={bottomRef} />
                                </div>
                            </div>

                            {error ? (
                                <div className="flex items-center justify-between gap-3 border-t border-white/50 bg-[#FBEAE2]/70 px-4 py-2 text-xs font-medium text-[#7A2A13] backdrop-blur-xl">
                                    <span>{error}</span>
                                </div>
                            ) : null}

                            <form onSubmit={handleSubmit} className="border-t border-white/50 bg-white/25 p-3.5 backdrop-blur-xl">
                                <div className="flex items-end gap-2 rounded-[16px] border border-white/70 bg-white/60 p-1.5 shadow-[0_10px_26px_rgba(49,48,46,0.06),inset_0_1px_0_rgba(255,255,255,0.75)] transition-colors focus-within:border-[#084734]/30 focus-within:bg-white/80">
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
                                        className="min-h-11 max-h-28 flex-1 resize-none rounded-[12px] border-0 bg-transparent px-3 py-2.5 text-[15px] leading-6 text-[#111110] placeholder:text-[#A39E98] focus-visible:outline-none"
                                    />
                                    <button
                                        type="submit"
                                        disabled={isSending || !input.trim()}
                                        className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-[12px] bg-[#084734] text-white shadow-[0_8px_18px_rgba(8,71,52,0.25),inset_0_1px_0_rgba(255,255,255,0.16)] transition-colors hover:bg-[#065c41] disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#084734]/25"
                                        aria-label="질문 보내기"
                                    >
                                        {isSending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                                    </button>
                                </div>
                            </form>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            <AnimatePresence>
                {!isOpen && chatbotTeaser.show ? (
                    <ChatbotTeaser
                        key="teaser"
                        text={chatbotTeaser.text}
                        onOpen={() => {
                            trackEvent("chatbot_teaser_clicked", { path: pathname })
                            chatbotTeaser.markClicked()
                            openChatbot({
                                source: "teaser",
                                prefill: chatbotTeaser.leadQuestion,
                                intent: chatbotTeaser.intent,
                            })
                        }}
                        onDismiss={() => {
                            trackEvent("chatbot_teaser_dismissed", { path: pathname })
                            chatbotTeaser.dismiss()
                        }}
                    />
                ) : null}
            </AnimatePresence>
            <div className="relative flex h-14 w-14 items-center justify-center md:h-16 md:w-16">
                {!isOpen && !shouldReduceMotion ? (
                    <motion.span
                        aria-hidden
                        className="pointer-events-none absolute inset-0 rounded-full bg-[#A7F3D0]/25 blur-lg"
                        initial={{ scale: 0.96, opacity: 0.38 }}
                        animate={{ scale: [0.96, 1.22], opacity: [0.38, 0] }}
                        transition={{ duration: 3.8, repeat: Infinity, repeatDelay: 1.2, ease: "easeOut" }}
                    />
                ) : null}
                <motion.button
                    ref={triggerRef}
                    type="button"
                    whileHover={shouldReduceMotion ? undefined : { scale: 1.04 }}
                    whileTap={shouldReduceMotion ? undefined : { scale: 0.96 }}
                    onClick={() => {
                        openSourceRef.current = "button"
                        setIsOpen((current) => !current)
                    }}
                    className="relative flex h-14 w-14 items-center justify-center overflow-hidden rounded-full border border-[#084734]/15 bg-[#ECFDF5]/85 text-[#084734] shadow-none backdrop-blur-xl transition-colors hover:border-[#084734]/20 hover:bg-[#DDF8ED]/90 focus:outline-none focus:ring-4 focus:ring-[#084734]/20 md:h-16 md:w-16"
                    aria-label={isOpen ? "챗봇 닫기" : "챗봇 열기"}
                    aria-expanded={isOpen}
                    aria-controls="classin-chatbot-dialog"
                >
                    <span
                        aria-hidden
                        className="pointer-events-none absolute inset-px rounded-full bg-white/20"
                    />
                    {isOpen ? (
                        <X className="relative h-6 w-6" />
                    ) : isDeepConsultation ? (
                        <>
                            <Image
                                src={DEEP_CONSULTATION_ICON_SRC}
                                alt=""
                                fill
                                className="object-cover"
                                sizes="64px"
                                aria-hidden
                            />
                            <span className="absolute inset-0 bg-[#084734]/20 mix-blend-multiply" aria-hidden />
                        </>
                    ) : (
                        <MessageCircle className="relative h-6 w-6" />
                    )}
                </motion.button>
            </div>
        </div>
    )
}
