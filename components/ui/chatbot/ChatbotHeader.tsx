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

// 대화창 헤더: 상담 아이콘(생각 중 펄스 링), 제목, 새 대화·음소거·닫기 버튼.
// 제목은 자르지 않고 줄을 바꾸며, 자리가 모자라면(글꼴 200% 등) 버튼 줄이 아래로 내려간다 — 제목 폭이 0 이 되지 않는다(CX-10).
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
                "flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-b border-white/50 bg-white/20 px-4 backdrop-blur-xl",
                compact ? "py-2" : "py-3.5"
            )}
        >
            <div className="flex min-w-0 flex-[1_1_9rem] items-center gap-3">
                {/* 낮은 화면에서는 장식 아이콘을 빼 헤더를 버튼 높이 한 줄로 줄인다(CX-10). */}
                {compact ? null : (
                    <motion.div
                        animate={(!isSending && !isStreaming && !shouldReduceMotion) ? { scale: [1, 1.15, 1] } : {}}
                        transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
                        className="relative flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-[14px] border border-white/70 bg-[linear-gradient(145deg,rgba(255,255,255,0.82),rgba(209,250,229,0.50))]"
                    >
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
                                <span className="absolute inset-0 bg-fg-accent/2 mix-blend-soft-light" aria-hidden />
                            </>
                        ) : (
                            <>
                                <span className="absolute inset-1 rounded-[10px] bg-fg-accent/6" aria-hidden />
                                <ClassInAIIcon size={22} variant="brand" className="relative text-fg-accent" />
                            </>
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
                    <div className="flex items-center gap-1.5">
                        <h2 id="classin-chatbot-title" tabIndex={-1} className="min-w-0 break-keep text-[15px] font-bold text-[#111110]">Classin 상담 가이드</h2>
                        <motion.span
                            aria-hidden
                            className="h-2 w-2 shrink-0 rounded-full bg-fg-accent"
                            animate={shouldReduceMotion ? undefined : { opacity: [1, 0.45, 1], scale: [1, 0.82, 1] }}
                            transition={shouldReduceMotion ? undefined : { duration: 2.6, repeat: Infinity, ease: "easeInOut" }}
                        />
                    </div>
                    {compact ? null : <p className="mt-0.5 break-keep text-xs font-medium text-[#615D59]">운영·도입·CS 상담</p>}
                </div>
            </div>
            <div className="ml-auto flex shrink-0 items-center gap-2">
                {/* 새 대화(CX-02): 데스크톱은 글자를 함께, 휴대폰은 아이콘만. '다시 시도'의 RotateCcw 와 겹치지 않게 다른 아이콘을 쓴다. */}
                {canStartNewChat ? (
                    <button
                        type="button"
                        onClick={onNewChat}
                        className={cn(
                            "inline-flex h-9 min-w-9 items-center justify-center gap-1.5 rounded-[8px] border border-line-strong bg-surface-sheet px-2 text-label text-fg-muted transition-colors hover:text-fg-accent",
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
                        "inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/60 bg-white/35 text-[#615D59] shadow-[inset_0_1px_0_rgba(255,255,255,0.60)] transition-colors hover:bg-white/70 hover:text-fg-accent focus-visible:outline-none",
                        CHATBOT_HIT_AREA_CLASS
                    )}
                    aria-label={muted ? "소리 켜기" : "음소거"}
                >
                    {muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
                </button>
                <button
                    type="button"
                    onClick={closeChatbot}
                    className={cn(
                        "inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/60 bg-white/35 text-[#615D59] shadow-[inset_0_1px_0_rgba(255,255,255,0.60)] transition-colors hover:bg-white/70 hover:text-fg-accent focus-visible:outline-none",
                        CHATBOT_HIT_AREA_CLASS
                    )}
                    aria-label="챗봇 닫기"
                >
                    <X className="h-5 w-5" />
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
