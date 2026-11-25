"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import { motion, useReducedMotion } from "framer-motion"
import { Check, Copy, MessageCircle } from "lucide-react"

import { cn } from "@/lib/utils"
import {
    buildChannelTalkMemberId,
    getChannelTalkAnonymousId,
    openChannelTalk,
} from "@/lib/channel-talk"
import { stashContactPrefill } from "@/lib/tracking-paths"
import type { ChatLinkClick } from "@/components/ui/chatbot-link-navigation"
import { EASING_SOFT_ENTER } from "@/components/ui/chatbot/constants"
import { buildConsultationDraft, buildHandoffProfile } from "@/components/ui/chatbot/consultation-draft"
import type { ChatMessage, HandoffIntent } from "@/components/ui/chatbot/types"

function getHandoffTopic(intent?: HandoffIntent) {
    return intent === "demo" ? "도입 상담" : "계정/접속/기술 지원"
}

function formatActionMessage(intent: HandoffIntent, draftLineCount: number) {
    return draftLineCount >= 3
        ? `${getHandoffTopic(intent)} 전용 상담 흐름으로 바로 연결해요.`
        : `${getHandoffTopic(intent)} 상담을 연결하고 담당자가 바로 이어서 확인할게요.`
}

export function ConsultationBridge({
    messages,
    message,
    sessionId,
    onNavigate,
}: {
    messages: ChatMessage[]
    message: ChatMessage
    sessionId?: string
    onNavigate?: (click: ChatLinkClick) => void
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
    // 대화 요약(draft)은 쿼리로 싣지 않는다 — 주소창·리퍼러·분석 URL 로 새어 나간다.
    // 링크를 누를 때 sessionStorage 로 건네고 문의 페이지가 읽자마자 지운다.
    const contactHref = `/contact?${new URLSearchParams({
        source: "chatbot",
        topic,
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
            className="mt-3 border-t border-fg-accent/10 pt-3"
        >
            <div className="flex items-center gap-2 text-[12px] font-bold text-fg-accent">
                <MessageCircle className="h-4 w-4" />
                상담 연결
            </div>
            <p className="mt-1 text-[11px] leading-4 text-[#615D59]">
                {formatActionMessage(message.handoffIntent ?? "support", draftLineCount)}
            </p>
            <div className="mt-2 rounded-[12px] border border-white/70 bg-fg-accent/4 px-3 py-2 text-[12px] leading-5 text-[#3B3835] shadow-[inset_0_1px_0_rgba(255,255,255,0.65)]">
                <p className="whitespace-pre-line [overflow-wrap:anywhere]">{draft}</p>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2">
                <motion.button
                    type="button"
                    onClick={openConsultation}
                    whileHover={shouldReduceMotion ? undefined : { scale: 1.03 }}
                    whileTap={shouldReduceMotion ? undefined : { scale: 0.97 }}
                    className="inline-flex h-9 items-center justify-center gap-1.5 rounded-[8px] bg-fg-accent px-3 text-xs font-bold text-fg-on-accent transition-colors hover:bg-fg-accent-hover focus-visible:outline-none"
                >
                    <MessageCircle className="h-3.5 w-3.5" />
                    {intentLabel}
                </motion.button>
                <motion.button
                    type="button"
                    onClick={() => void copyDraft()}
                    whileHover={shouldReduceMotion ? undefined : { scale: 1.03 }}
                    whileTap={shouldReduceMotion ? undefined : { scale: 0.97 }}
                    className="inline-flex h-9 items-center justify-center gap-1.5 rounded-[8px] border border-white/70 bg-white/70 px-3 text-xs font-bold text-[#111110] transition-colors hover:bg-fg-accent/8 focus-visible:outline-none"
                >
                    {state === "copied" ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                    요약 복사
                </motion.button>
                <Link
                    href={contactHref}
                    onClick={(event) => {
                        // 요약은 주소가 아니라 sessionStorage 로 넘긴다. 저장이 막히면 조용히 빈 폼으로
                        // 보내지 않고 복사해서 붙여 넣도록 안내한다.
                        if (stashContactPrefill(draft)) {
                            onNavigate?.(event)
                            return
                        }
                        event.preventDefault()
                        setToast({ type: "error", text: "요약을 보관하지 못했어요. 요약을 복사한 뒤 문의폼에 붙여 넣어 주세요." })
                    }}
                    className="inline-flex h-9 items-center justify-center rounded-[8px] px-2 text-xs font-bold text-[#615D59] transition-colors hover:bg-white/70 hover:text-fg-accent"
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
