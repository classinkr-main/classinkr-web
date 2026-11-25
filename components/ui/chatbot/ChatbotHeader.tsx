"use client"

import Image from "next/image"
import { motion } from "framer-motion"
import { Volume2, VolumeX, X } from "lucide-react"

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
}

// 대화창 헤더: 상담 아이콘(생각 중 펄스 링), 제목, 음소거·닫기 버튼.
export function ChatbotHeader({
    isDeepConsultation,
    isSending,
    isStreaming,
    shouldReduceMotion,
    muted,
    toggleMute,
    closeChatbot,
}: ChatbotHeaderProps) {
    return (
        <motion.div
            variants={itemVariants}
            custom={shouldReduceMotion}
            className="flex items-center justify-between border-b border-white/50 bg-white/20 px-4 py-3.5 backdrop-blur-xl"
        >
            <div className="flex min-w-0 items-center gap-3">
                <motion.div
                    animate={(!isSending && !isStreaming) ? { scale: [1, 1.15, 1] } : {}}
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
                <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                        <h2 id="classin-chatbot-title" className="truncate text-[15px] font-bold text-[#111110]">Classin 상담 가이드</h2>
                        <motion.span
                            aria-hidden
                            className="h-2 w-2 shrink-0 rounded-full bg-fg-accent"
                            animate={shouldReduceMotion ? undefined : { opacity: [1, 0.45, 1], scale: [1, 0.82, 1] }}
                            transition={shouldReduceMotion ? undefined : { duration: 2.6, repeat: Infinity, ease: "easeInOut" }}
                        />
                    </div>
                    <p className="mt-0.5 truncate text-xs font-medium text-[#615D59]">운영·도입·CS 상담</p>
                </div>
            </div>
            <div className="flex items-center gap-3">
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
