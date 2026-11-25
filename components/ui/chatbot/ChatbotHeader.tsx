"use client"

import Image from "next/image"
import { motion } from "framer-motion"
import { MessageSquarePlus, Volume2, VolumeX, X } from "lucide-react"

import { ClassInAIIcon } from "@/components/ui/ClassInAIIcon"
import { CHATBOT_HIT_AREA_CLASS } from "@/components/ui/chatbot-hit-area"
import { DEEP_CONSULTATION_ICON_SRC, itemVariants } from "@/components/ui/chatbot/constants"
import { cn } from "@/lib/utils"

interface ChatbotHeaderProps {
    isDeepConsultation: boolean
    isSending: boolean
    isStreaming: boolean
    shouldReduceMotion: boolean | null
    muted: boolean
    toggleMute: () => void
    closeChatbot: () => void
    // 사용자 질문이 하나라도 있을 때만 새 대화 버튼을 보인다.
    canStartNewChat: boolean
    onNewChat: () => void
    // 낮은 화면(키보드·가로 모드·글꼴 확대)에서는 한 줄로 줄이고 부제를 감춘다(CX-10).
    compact?: boolean
}

// 헤더의 둥근 아이콘 버튼(음소거·닫기). 불투명 sheet 면 + hair 선, hover 는 선과 글자를 진하게(CX-14·CX-15).
const HEADER_ICON_BUTTON_CLASS =
    "inline-flex h-9 w-9 items-center justify-center rounded-full border border-line-hair bg-surface-sheet text-fg-muted transition-colors hover:border-line-strong hover:text-fg-ink"

// 대화창 헤더: 상담 아이콘(생각 중 펄스 링), 제목, 새 대화·음소거·닫기 버튼.
// 제목은 자르지 않고 줄을 바꾸며, 자리가 모자라면(글꼴 200% 등) 버튼 줄이 아래로 내려간다 — 제목 폭이 0 이 되지 않는다(CX-10).
// 면은 불투명 sheet 이고 아래 hair 선 하나로 목록과 가른다(CX-14). 제목 옆의 깜빡이는 초록 점('지금 연결됨'처럼 읽힌다)은 뺐다(CX-06).
export function ChatbotHeader({
    isDeepConsultation,
    isSending,
    isStreaming,
    shouldReduceMotion,
    muted,
    toggleMute,
    closeChatbot,
    canStartNewChat,
    onNewChat,
    compact = false,
}: ChatbotHeaderProps) {
    return (
        <motion.div
            variants={itemVariants}
            custom={shouldReduceMotion}
            className={cn(
                "flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-b border-line-hair bg-surface-sheet px-4",
                compact ? "py-2" : "py-3.5"
            )}
        >
            <div className="flex min-w-0 flex-[1_1_9rem] items-center gap-3">
                {/* 낮은 화면에서는 장식 아이콘을 빼 헤더를 버튼 높이 한 줄로 줄인다(CX-10). */}
                {compact ? null : (
                    <motion.div
                        animate={(!isSending && !isStreaming && !shouldReduceMotion) ? { scale: [1, 1.15, 1] } : {}}
                        transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
                        className="relative flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-[14px] border border-line-hair bg-surface-sheet"
                    >
                        {isDeepConsultation ? (
                            <Image
                                src={DEEP_CONSULTATION_ICON_SRC}
                                alt=""
                                fill
                                className="object-cover"
                                sizes="44px"
                                aria-hidden
                            />
                        ) : (
                            <ClassInAIIcon size={22} variant="brand" className="relative text-fg-accent" />
                        )}
                        {/* 생각 중/스트리밍 중일 때 초록 펄스 링 렌더링 */}
                        {(isSending || isStreaming) && !shouldReduceMotion && (
                            <>
                                <motion.span
                                    initial={{ scale: 0.8, opacity: 0.5 }}
                                    animate={{ scale: 1.4, opacity: 0 }}
                                    transition={{ duration: 1.6, repeat: Infinity, ease: "easeOut" }}
                                    className="absolute inset-0 rounded-[14px] border border-fg-accent/40 pointer-events-none"
                                />
                                <motion.span
                                    initial={{ scale: 0.8, opacity: 0.5 }}
                                    animate={{ scale: 1.7, opacity: 0 }}
                                    transition={{ duration: 1.6, repeat: Infinity, ease: "easeOut", delay: 0.6 }}
                                    className="absolute inset-0 rounded-[14px] border border-fg-accent/20 pointer-events-none"
                                />
                            </>
                        )}
                    </motion.div>
                )}
                <div className="min-w-0">
                    <h2 id="classin-chatbot-title" tabIndex={-1} className="min-w-0 break-keep text-ui font-semibold text-fg-ink">Classin 상담 가이드</h2>
                    {compact ? null : <p className="mt-0.5 break-keep text-note text-fg-muted">운영·도입·CS 상담</p>}
                </div>
            </div>
            <div className="ml-auto flex shrink-0 items-center gap-2">
                {/* 새 대화(CX-02): 데스크톱은 글자를 함께, 휴대폰은 아이콘만. '다시 시도'의 RotateCcw 와 겹치지 않게 다른 아이콘을 쓴다. */}
                {canStartNewChat ? (
                    <button
                        type="button"
                        onClick={onNewChat}
                        className={cn(
                            "inline-flex h-9 min-w-9 items-center justify-center gap-1.5 rounded-[8px] border border-line-strong bg-surface-sheet px-2 text-label text-fg-muted transition-colors hover:border-fg-accent hover:text-fg-accent",
                            CHATBOT_HIT_AREA_CLASS
                        )}
                        aria-label="새 대화 시작"
                    >
                        <MessageSquarePlus className="h-4 w-4" aria-hidden />
                        <span className="hidden md:inline" aria-hidden>새 대화</span>
                    </button>
                ) : null}
                <button
                    type="button"
                    onClick={toggleMute}
                    className={cn(
                        HEADER_ICON_BUTTON_CLASS,
                        CHATBOT_HIT_AREA_CLASS
                    )}
                    aria-label={muted ? "소리 켜기" : "음소거"}
                >
                    {muted ? <VolumeX className="h-4 w-4" aria-hidden /> : <Volume2 className="h-4 w-4" aria-hidden />}
                </button>
                <button
                    type="button"
                    onClick={closeChatbot}
                    className={cn(
                        HEADER_ICON_BUTTON_CLASS,
                        CHATBOT_HIT_AREA_CLASS
                    )}
                    aria-label="챗봇 닫기"
                >
                    <X className="h-5 w-5" aria-hidden />
                </button>
            </div>
        </motion.div>
    )
}

// 새 대화 뒤 목록 위에 두는 되돌리기 띠(CX-02). 확인 창 대신 바로 비우고 여기서 복구한다.
// 다음 질문을 보내거나 창을 닫을 때까지 남는다 — 시간 제한이 없어 시간 제한 접근성 문제가 없다.
export function NewChatUndoBar({ onUndo }: { onUndo: () => void }) {
    return (
        <div
            role="status"
            className="flex items-center justify-between gap-3 border-b border-line-hair bg-surface-sheet px-4 py-1.5 text-note text-fg-muted"
        >
            <span>대화를 비웠어요</span>
            <button
                type="button"
                onClick={onUndo}
                className={cn(
                    "inline-flex h-9 items-center justify-center rounded-[8px] px-2 text-label text-fg-accent underline-offset-4 transition-colors hover:underline",
                    CHATBOT_HIT_AREA_CLASS
                )}
            >
                되돌리기
            </button>
        </div>
    )
}
