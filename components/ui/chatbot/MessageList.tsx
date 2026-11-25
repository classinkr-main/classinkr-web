"use client"

import { memo, useId, useState, type RefObject } from "react"
import Link from "next/link"
import { AnimatePresence, motion, useReducedMotion } from "framer-motion"
import {
    ArrowRight,
    Check,
    ChevronDown,
    Copy,
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
    LinkifiedText,
    flattenAssistantMarkdownLinks,
    prepareAssistantDisplayText,
} from "@/components/ui/chatbot/MessageText"
import { EASING_SOFT_ENTER } from "@/components/ui/chatbot/constants"
import {
    findCurrentTurnStart,
    navigableSources,
    resolveVisibleSuggestions,
    shouldAnimateMessageLayout,
} from "@/components/ui/chatbot/message-visibility"
import type { ChatbotSource, ChatMessage } from "@/components/ui/chatbot/types"
import { cn } from "@/lib/utils"
import { CHATBOT_MOTION, m } from "@/lib/chatbot/motion"
import { buildRetryLabel, WIDGET_INTERRUPTED_NOTICE } from "@/lib/chatbot/widget-turn"

// 답 머리: 화자(Classin AI)와 상태. 상태는 알약 배지 대신 점 + 13px 글자다(DESIGN.md §4 Pill Badge retired, CX-16).
function AssistantMeta({ message }: { message: ChatMessage }) {
    return (
        <div className="mb-2 flex items-center justify-between gap-2 border-b border-line-hair pb-1.5">
            <div className="flex items-center gap-1.5 text-label text-fg-muted">
                <ClassInAIIcon size={14} variant="brand" />
                <span>Classin AI</span>
            </div>
            {message.showHandoffCTA ? (
                <span className="inline-flex items-center gap-1.5 text-note text-fg-muted">
                    <span className="status-dot" aria-hidden />
                    상담 권장
                </span>
            ) : null}
        </div>
    )
}

type FeedbackRating = "helpful" | "not_helpful"

// 누른 쪽은 aria-pressed=true 다. 저장되면 '의견 고마워요', 실패하면 '저장하지 못했어요'를 한 줄로 보이고(role=status 라
// 스크린 리더도 듣는다). 실패하면 눌림을 풀어 다시 누를 수 있게 한다(CX-25). 예전에는 실패해도 아무 표시가 없었다.
export const FEEDBACK_SAVED_NOTICE = "의견 고마워요"
export const FEEDBACK_FAILED_NOTICE = "저장하지 못했어요"

const FEEDBACK_BUTTON_CLASS =
    "inline-flex h-9 w-9 items-center justify-center rounded-[8px] border border-line-strong bg-surface-sheet text-fg-muted transition-colors hover:border-fg-accent hover:text-fg-accent"
const FEEDBACK_BUTTON_PRESSED_CLASS = "border-fg-accent text-fg-accent"

function FeedbackButtons({
    answerEventId,
    sessionId,
}: {
    answerEventId?: string
    sessionId?: string
}) {
    const [pressed, setPressed] = useState<FeedbackRating | null>(null)
    const [status, setStatus] = useState<"idle" | "saving" | "saved" | "failed">("idle")

    async function sendFeedback(rating: FeedbackRating) {
        setPressed(rating)
        setStatus("saving")

        const fail = () => {
            setPressed(null)
            setStatus("failed")
        }
        if (!answerEventId || !sessionId) {
            fail()
            return
        }

        try {
            const response = await fetch("/api/chatbot/feedback", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ answerEventId, sessionId, rating }),
            })
            if (response.ok) setStatus("saved")
            else fail()
        } catch {
            fail()
        }
    }

    const notice = status === "saved" ? FEEDBACK_SAVED_NOTICE : status === "failed" ? FEEDBACK_FAILED_NOTICE : ""

    return (
        <div className="flex flex-wrap items-center justify-end gap-x-3 gap-y-1">
            {/* 안내 영역은 처음부터 두어야 바뀐 글을 스크린 리더가 읽는다. */}
            <p role="status" className={cn("text-note", status === "failed" ? "text-fg-danger" : "text-fg-muted")}>
                {notice}
            </p>
            <div role="group" aria-label="이 답변이 도움이 됐나요?" className="flex items-center gap-2">
                <button
                    type="button"
                    onClick={() => sendFeedback("helpful")}
                    aria-pressed={pressed === "helpful"}
                    className={cn(
                        FEEDBACK_BUTTON_CLASS,
                        CHATBOT_HIT_AREA_CLASS,
                        pressed === "helpful" && FEEDBACK_BUTTON_PRESSED_CLASS
                    )}
                    aria-label="도움됨"
                    title="도움됨"
                >
                    {pressed === "helpful" ? <Check className="h-4 w-4" aria-hidden /> : <ThumbsUp className="h-4 w-4" aria-hidden />}
                </button>
                <button
                    type="button"
                    onClick={() => sendFeedback("not_helpful")}
                    aria-pressed={pressed === "not_helpful"}
                    className={cn(
                        FEEDBACK_BUTTON_CLASS,
                        CHATBOT_HIT_AREA_CLASS,
                        pressed === "not_helpful" && FEEDBACK_BUTTON_PRESSED_CLASS
                    )}
                    aria-label="도움 안 됨"
                    title="도움 안 됨"
                >
                    <ThumbsDown className="h-4 w-4" aria-hidden />
                </button>
            </div>
        </div>
    )
}

function buildAnswerShareText(message: ChatMessage) {
    return sanitizeVisibleAssistantText(message.content)
}

// 복사·스크린 리더 안내에 쓰는 평문. 원본 이미지는 지우고, 주소·사이트 경로는 문장 중간에서 지우지 않는다(CX-17).
// 마크다운 링크는 이름만 남긴다. 화면은 같은 다듬기(prepareAssistantDisplayText) 뒤 링크를 그린다(MessageText).
export function sanitizeVisibleAssistantText(value: string) {
    return flattenAssistantMarkdownLinks(prepareAssistantDisplayText(value))
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
                "inline-block w-[2px] h-[15px] ml-1.5 align-middle rounded-full bg-fg-accent shrink-0",
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
    animateLayout = false,
    onNavigate,
}: {
    content: string
    role: ChatMessage["role"]
    isStreaming?: boolean
    // 최근 말풍선만 layout 애니메이션을 켠다(CX-13).
    animateLayout?: boolean
    // 답 글 속 사이트 링크를 누르면 부른다(휴대폰이면 대화창을 닫는다, CX-17).
    onNavigate?: (click: ChatLinkClick) => void
}) {
    const shouldReduceMotion = useReducedMotion()
    // 답 글은 링크를 남긴 채 다듬고(CX-17), 사용자 글은 그대로 둔다(링크로 그리지 않는다).
    const visibleContent = role === "assistant" ? prepareAssistantDisplayText(content) : content
    // 목록 항목 값은 every(Boolean) 로 걸렀지만 타입은 string | undefined 라 빈 글로 받는다.
    const renderText = (text: string | undefined) =>
        role === "assistant" ? <LinkifiedText text={text ?? ""} onNavigate={onNavigate} /> : text
    const blocks = visibleContent
        .trim()
        .split(/\n{2,}/)
        .map((block) => block.trim())
        .filter(Boolean)

    if (blocks.length === 0) return null

    return (
        <motion.div
            layout={animateLayout ? "position" : false}
            initial={m({ opacity: 0.8 }, shouldReduceMotion)}
            animate={m({ opacity: 1 }, shouldReduceMotion)}
            transition={m(CHATBOT_MOTION.tokenFade, shouldReduceMotion)}
            className={cn(
                "space-y-2.5 whitespace-pre-wrap text-caption leading-6 [overflow-wrap:anywhere]",
                role === "assistant" ? "text-fg-ink" : "text-fg-on-accent"
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
                                    <li key={`${index}:${item}`} className="flex items-start gap-2">
                                        {/* 번호는 장식이라 읽지 않는다(목록이 순서를 알린다). 원 배지 대신 13px 숫자(CX-16). */}
                                        <span className="min-w-4 shrink-0 text-folio leading-6 tabular-nums text-fg-muted" aria-hidden="true">
                                            {index + 1}.
                                        </span>
                                        <span className="flex-1">
                                            {renderText(item)}
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
                                            {renderText(item)}
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
                                    {renderText(leadLines.join("\n"))}
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
                                                {renderText(item)}
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
                        {renderText(lines.map(cleanMessageLine).filter(Boolean).join("\n"))}
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
                "inline-flex h-9 items-center justify-center gap-1.5 rounded-[8px] border bg-surface-sheet px-2.5 text-label transition-colors",
                CHATBOT_HIT_AREA_CLASS,
                state === "copied"
                    ? "border-fg-accent text-fg-accent"
                    : state === "failed"
                      ? "border-fg-danger text-fg-danger"
                      : "border-line-strong text-fg-muted hover:border-fg-accent hover:text-fg-accent"
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
                        <Check className="h-3.5 w-3.5" aria-hidden />
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
                        <Copy className="h-3.5 w-3.5" aria-hidden />
                        <span>{state === "failed" ? "복사 실패" : "답변 복사"}</span>
                    </motion.span>
                )}
            </AnimatePresence>
        </motion.button>
    )
}

function SourceLinks({
    sources,
    onNavigate,
    showHeading = true,
}: {
    sources?: ChatbotSource[]
    onNavigate?: (click: ChatLinkClick) => void
    // 접힌 출처를 펼칠 때는 제목 줄과 윗선을 접기 버튼이 대신한다.
    showHeading?: boolean
}) {
    const shouldReduceMotion = useReducedMotion()
    // 주소가 없는 출처(복원 저장에서 빠진 경우 등)는 누를 수 없으니 건너뛴다(CX-19).
    const visibleSources = navigableSources(sources).slice(0, 2)
    if (visibleSources.length === 0) return null

    return (
        <div className={cn("space-y-1.5", showHeading && "mt-3 border-t border-line-hair pt-3")}>
            {showHeading ? (
                <div className="flex items-center gap-1.5 text-note text-fg-muted">
                    <FileText className="h-3.5 w-3.5 text-fg-accent" aria-hidden="true" />
                    <span>참고한 공식 가이드</span>
                </div>
            ) : null}
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
                            className="group block rounded-[12px] border border-line-strong bg-surface-sheet px-3 py-2 text-left transition-colors hover:border-fg-accent"
                        >
                            {/* 가장 관련 높은 가이드는 알약 대신 점 + '추천' 13px 글자로 표시한다(CX-16). */}
                            {isTopMatch ? (
                                <span className="mb-0.5 flex items-center gap-1.5 text-note text-fg-muted">
                                    <span className="status-dot" aria-hidden />
                                    추천
                                </span>
                            ) : null}
                            <span className="flex items-start justify-between gap-2 text-label text-fg-ink">
                                <span className="min-w-0 transition-colors group-hover:text-fg-accent">{source.title}</span>
                                <ArrowRight className="mt-0.5 h-3.5 w-3.5 shrink-0 text-fg-accent arrow-nudge" aria-hidden />
                            </span>
                            {source.heading ? (
                                <span className="mt-0.5 block text-note text-fg-muted">
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

// 지난 답의 출처는 한 줄로 접어 둔다(CX-12). 펼치면 같은 링크를 보인다 — 긴 대화에서 출처 카드가 쌓이지 않게 한다.
function CollapsedSourceLinks({
    sources,
    onNavigate,
}: {
    sources?: ChatbotSource[]
    onNavigate?: (click: ChatLinkClick) => void
}) {
    const [expanded, setExpanded] = useState(false)
    const listId = useId()
    const count = Math.min(navigableSources(sources).length, 2)
    if (count === 0) return null

    return (
        <div className="mt-3 border-t border-line-hair pt-1.5">
            <button
                type="button"
                onClick={() => setExpanded((value) => !value)}
                aria-expanded={expanded}
                aria-controls={listId}
                className={cn(
                    "inline-flex min-h-9 items-center gap-1.5 text-note text-fg-muted transition-colors hover:text-fg-ink",
                    CHATBOT_HIT_AREA_CLASS
                )}
            >
                <FileText className="h-3.5 w-3.5 text-fg-accent" aria-hidden="true" />
                <span>참고한 공식 가이드 {count}개</span>
                <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", expanded && "rotate-180")} aria-hidden="true" />
            </button>
            {expanded ? (
                <div id={listId} className="mt-1.5">
                    <SourceLinks sources={sources} onNavigate={onNavigate} showHeading={false} />
                </div>
            ) : null}
        </div>
    )
}

// 대기 말풍선. 스크린 리더에는 보낼 때('답변을 찾는 중이에요')와 늦어질 때 셸의 안내 영역이 한 번씩 알리므로,
// 여기는 live 영역이 아니다(예전의 role=status + aria-live=off 를 정리했다, CX-09).
function ThinkingIndicator({
    shouldReduceMotion,
    isSlow,
}: {
    shouldReduceMotion: boolean | null
    isSlow: boolean
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
                className="relative overflow-hidden rounded-[18px] rounded-bl-[6px] border border-line-hair bg-surface-sheet p-3"
            >
                <div className="flex items-center gap-2.5">
                    <div className="relative flex h-6 w-6 shrink-0 items-center justify-center rounded-[8px] border border-line-hair bg-surface-sheet">
                        <ClassInAIIcon size={14} variant="brand" className="text-fg-accent" />
                        {!shouldReduceMotion && (
                            <motion.span
                                aria-hidden
                                className="pointer-events-none absolute inset-0 rounded-[8px] border border-fg-accent/50"
                                animate={{ scale: [1, 1.25, 1], opacity: [0.6, 0, 0.6] }}
                                transition={{ duration: 2, repeat: Infinity, ease: "easeOut" }}
                            />
                        )}
                    </div>
                    <div className="flex items-center gap-2">
                        <span className="text-label text-fg-muted">{isSlow ? "답변이 조금 늦어지고 있어요" : "ClassIn 가이드 확인 중"}</span>
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
                <div className="mt-2 w-40 space-y-1.5" aria-hidden>
                    <div className="h-1.5 w-full bg-surface-skeleton" />
                    <div className="h-1.5 w-2/3 bg-surface-skeleton" />
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
    // 첫 글자가 6초 넘게 오지 않으면 대기 말풍선 문구를 바꾼다(CX-01).
    isSlow: boolean
    // 429 뒤 남은 대기 초. 다시 시도 버튼을 막고 남은 초를 보인다(CX-01).
    cooldownSeconds: number
    shouldReduceMotion: boolean | null
    // 낮은 화면(키보드·가로 모드·글꼴 확대)에서는 환영 칩을 접어 둔다(CX-10).
    compact?: boolean
    sendQuestion: (question: string) => Promise<void>
    // 실패한 말풍선 자리에서 같은 질문을 다시 받는다(사용자 말풍선은 그대로).
    onRetry: (messageId: string) => void
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
    isSlow,
    cooldownSeconds,
    shouldReduceMotion,
    compact = false,
    sendQuestion,
    onRetry,
    closeAfterInChatNavigation,
    bottomRef,
}: MessageListProps) {
    // 환영 칩을 낮은 화면에서 펼쳤는지. 접힌 동안은 '추천 질문 n개 보기' 한 줄만 보인다.
    const [starterChipsExpanded, setStarterChipsExpanded] = useState(false)
    const starterChipsId = useId()
    // 지금 턴(마지막 질문 뒤)의 답에만 칩과 펼친 출처를 둔다. 지난 답의 칩은 지우고 출처는 접는다(CX-12).
    const currentTurnStart = findCurrentTurnStart(messages)

    return (
        <div className="space-y-4">
            <AnimatePresence mode="popLayout" initial={false}>
                {messages.map((message, index) => {
                    const isLast = index === messages.length - 1
                    const isAssistantStreaming = isLast && message.role === "assistant" && isStreaming
                    const isCurrentTurn = index > currentTurnStart
                    const suggestions = resolveVisibleSuggestions(message, { isCurrentTurn })
                    const isWelcome = message.id === "welcome"
                    const foldStarterChips = isWelcome && compact && !starterChipsExpanded
                    // 오래된 말풍선은 layout 애니메이션을 끄고 재지 않는다 — 긴 대화에서 입력·스트리밍이 느려지지 않게(CX-13).
                    const animateLayout = shouldAnimateMessageLayout(index, messages.length)
                    return (
                        <motion.div
                            key={message.id}
                            data-chat-message-id={message.id}
                            layout={animateLayout ? "position" : false}
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
                                // 불투명 면(CX-14): 답은 sheet + hair 선, 질문은 그린 채움. 반투명·blur 없음.
                                // 강제 색상(고대비)에서도 말풍선 경계가 남게 질문 말풍선에도 같은 색 선을 둔다.
                                className={cn(
                                    "max-w-[92%] rounded-[18px] border px-3.5 py-3 text-caption leading-6 md:max-w-[84%]",
                                    message.role === "user"
                                        ? "rounded-br-[6px] border-fg-accent bg-fg-accent text-fg-on-accent"
                                        : "rounded-bl-[6px] border-line-hair bg-surface-sheet text-fg-ink"
                                )}
                            >
                                {message.role === "assistant" ? <AssistantMeta message={message} /> : null}
                                {/* 화자 표시(CX-27): 답에는 'Classin AI' 머리가 보이고, 사용자 말풍선은 화면 읽기에만 '내 질문'을 붙인다. */}
                                {message.role === "user" ? <span className="sr-only">내 질문: </span> : null}
                                <MessageContent
                                    content={message.content}
                                    role={message.role}
                                    isStreaming={isAssistantStreaming}
                                    animateLayout={isAssistantStreaming}
                                    onNavigate={closeAfterInChatNavigation}
                                />
                                {message.role === "assistant" ? (
                                    <>
                                        {isCurrentTurn ? (
                                            <SourceLinks sources={message.sources} onNavigate={closeAfterInChatNavigation} />
                                        ) : (
                                            <CollapsedSourceLinks sources={message.sources} onNavigate={closeAfterInChatNavigation} />
                                        )}
                                        {message.interrupted ? (
                                            <p className="mt-2 border-t border-line-hair pt-2 text-note text-fg-muted">
                                                {WIDGET_INTERRUPTED_NOTICE}
                                            </p>
                                        ) : null}
                                        {message.retryQuestion ? (
                                            <div className="mt-3">
                                                <button
                                                    type="button"
                                                    onClick={() => onRetry(message.id)}
                                                    disabled={isSending || cooldownSeconds > 0}
                                                    aria-label={buildRetryLabel(message.retryQuestion)}
                                                    className={cn(
                                                        "inline-flex h-9 items-center justify-center gap-1.5 rounded-[8px] border border-line-strong bg-surface-sheet px-3 text-label text-fg-accent transition-colors hover:border-fg-accent disabled:cursor-not-allowed disabled:border-line-hair disabled:bg-surface-skeleton disabled:text-fg-muted",
                                                        CHATBOT_HIT_AREA_CLASS
                                                    )}
                                                >
                                                    <RotateCcw className="h-3.5 w-3.5" aria-hidden />
                                                    {cooldownSeconds > 0 ? `다시 시도 (${cooldownSeconds}초)` : "다시 시도"}
                                                </button>
                                            </div>
                                        ) : null}
                                        {suggestions.length > 0 && foldStarterChips ? (
                                            <div className="mt-3">
                                                <button
                                                    type="button"
                                                    onClick={() => {
                                                        setStarterChipsExpanded(true)
                                                        // 이 버튼은 펼치면 사라지므로 첫 칩으로 포커스를 옮긴다.
                                                        window.requestAnimationFrame(() => {
                                                            document.getElementById(starterChipsId)?.querySelector<HTMLButtonElement>("button")?.focus()
                                                        })
                                                    }}
                                                    aria-expanded={false}
                                                    aria-controls={starterChipsId}
                                                    className={cn(
                                                        "inline-flex min-h-9 items-center gap-1.5 text-label text-fg-accent transition-colors hover:text-fg-ink",
                                                        CHATBOT_HIT_AREA_CLASS
                                                    )}
                                                >
                                                    <span>추천 질문 {suggestions.length}개 보기</span>
                                                    <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />
                                                </button>
                                            </div>
                                        ) : null}
                                        {suggestions.length > 0 && !foldStarterChips ? (
                                            <div className="mt-3 space-y-2" id={isWelcome ? starterChipsId : undefined}>
                                                {isWelcome ? (
                                                    <div className="flex items-center gap-1.5 px-0.5 text-note text-fg-muted">
                                                        <span className="status-dot" aria-hidden />
                                                        추천 질문으로 바로 시작하기
                                                    </div>
                                                ) : null}
                                                <div className="grid gap-2">
                                                    {suggestions.map((question, index) => (
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
                                                            // 칩 13px(CX-16), 불투명 면 + 선(CX-14). 비활성(답 받는 중)은 skeleton 면.
                                                            className="group flex w-full items-center justify-between gap-2 whitespace-normal break-keep rounded-[12px] border border-line-strong bg-surface-sheet px-3.5 py-2.5 text-left text-label text-fg-accent transition-colors hover:border-fg-accent disabled:cursor-not-allowed disabled:border-line-hair disabled:bg-surface-skeleton disabled:text-fg-muted"
                                                        >
                                                            <span>{question}</span>
                                                            <ArrowRight className="h-3.5 w-3.5 shrink-0 arrow-nudge" aria-hidden />
                                                        </motion.button>
                                                    ))}
                                                </div>
                                            </div>
                                        ) : null}
                                        {message.answerEventId || message.showHandoffCTA ? (
                                            <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                                                <AnswerCopyButton message={message} />
                                                {message.answerEventId ? (
                                                    // 피드백은 그 답을 받은 세션으로 보낸다 — 새 대화·되돌리기·복원 뒤에도 answerEventId 와 짝이 맞는다.
                                                    <FeedbackButtons answerEventId={message.answerEventId} sessionId={message.sessionId ?? sessionId} />
                                                ) : null}
                                            </div>
                                        ) : null}
                                        {message.showHandoffCTA ? (
                                            <ConsultationBridge
                                                messages={messages}
                                                message={message}
                                                sessionId={message.sessionId ?? sessionId}
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
                    <ThinkingIndicator key="thinking" shouldReduceMotion={shouldReduceMotion} isSlow={isSlow} />
                ) : null}
            </AnimatePresence>
            <div ref={bottomRef} />
        </div>
    )
})
