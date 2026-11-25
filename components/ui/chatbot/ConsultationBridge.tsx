"use client"

import { useEffect, useId, useMemo, useRef, useState } from "react"
import Link from "next/link"
import { motion, useReducedMotion } from "framer-motion"
import { ArrowRight, Check, ChevronDown, Copy, MessageCircle } from "lucide-react"

import { cn } from "@/lib/utils"
import { getChannelTalkMemberId, openChannelTalk } from "@/lib/channel-talk"
import { stashContactPrefill } from "@/lib/tracking-paths"
import {
    SUPPORT_HOURS_FULL_LABEL,
    describeSupportHoursWait,
    getSupportHoursState,
    type SupportHoursState,
} from "@/lib/contact/support-hours"
import { CHATBOT_HIT_AREA_32_CLASS, CHATBOT_HIT_AREA_CLASS } from "@/components/ui/chatbot-hit-area"
import type { ChatLinkClick } from "@/components/ui/chatbot-link-navigation"
import { EASING_SOFT_ENTER } from "@/components/ui/chatbot/constants"
import {
    buildConsultationDraft,
    buildHandoffProfile,
    hasRedactedPlaceholder,
} from "@/components/ui/chatbot/consultation-draft"
import type { ChatMessage, HandoffIntent } from "@/components/ui/chatbot/types"

function getHandoffTopic(intent?: HandoffIntent) {
    return intent === "demo" ? "도입 상담" : "계정/접속/기술 지원"
}

/*
 * 채널톡(보조) 버튼 이름. 답 글이 '아래 [실시간 상담 연결]로…'·'아래 [도입 상담 남기기]로…'라고 이 이름을 부르므로
 * 운영시간 안에는 그대로 둔다. 운영시간 밖(점심 포함)에는 '실시간'을 빼고 남기는 채팅임을 밝힌다(CX-07).
 */
function getChannelTalkLabel(intent: HandoffIntent, hours: SupportHoursState) {
    if (intent === "demo") return "도입 상담 남기기"
    return hours === "open" ? "실시간 상담 연결" : "채팅으로 상담 남기기"
}

type BridgeStatus =
    | { kind: "opened" }
    | { kind: "open_failed" }
    | { kind: "stash_failed" }
    | { kind: "copied" }
    | { kind: "copy_failed" }

const PRIMARY_BUTTON_CLASS =
    "inline-flex h-9 items-center justify-center gap-1.5 rounded-[8px] bg-fg-accent px-3 text-label text-fg-on-accent transition-colors hover:bg-fg-accent-hover"
const SECONDARY_BUTTON_CLASS =
    "inline-flex h-9 items-center justify-center gap-1.5 rounded-[8px] border border-line-strong bg-surface-sheet px-3 text-label text-fg-ink transition-colors hover:border-fg-accent hover:text-fg-accent"

/**
 * 상담 연결 카드(CX-03·CX-07·CX-18).
 * - 요약은 카드를 띄운 답까지의 구간으로 만든다 — 다음 턴이 와도 이 카드의 요약은 바뀌지 않는다.
 * - 주 버튼은 '문의폼에 연락처 남기기' 하나(연락받을 유일한 길), 보조는 채널톡 하나. 요약 복사는 실패했을 때만 보인다.
 * - 휴대폰에서는 버튼 줄을 먼저 보이고 요약은 '요약 보기'로 접는다. 뒤에 새 카드가 생기면 이 카드는 한 줄로 접힌다.
 * - 운영시간(평일 09:00~18:00)을 보이고 '바로'를 약속하지 않는다. 운영시간 밖에는 언제 확인하는지 한 줄로 알린다.
 */
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
    const summaryId = useId()
    const [status, setStatus] = useState<BridgeStatus | null>(null)
    const [summaryOpen, setSummaryOpen] = useState(false)
    const [expandedWhileSuperseded, setExpandedWhileSuperseded] = useState(false)
    // 접힌 카드를 펼치거나 다시 접으면 버튼이 바뀌어 포커스가 사라진다 — 바뀐 자리의 버튼으로 옮긴다.
    const expandToggleRef = useRef<HTMLButtonElement>(null)
    const collapseToggleRef = useRef<HTMLButtonElement>(null)
    const toggledByUserRef = useRef(false)
    useEffect(() => {
        if (!toggledByUserRef.current) return
        toggledByUserRef.current = false
        ;(expandedWhileSuperseded ? collapseToggleRef : expandToggleRef).current?.focus()
    }, [expandedWhileSuperseded])
    // 운영시간 판정은 카드가 생길 때 한 번 한다(KST). 창을 오래 열어 둬도 문구가 바뀌며 흔들리지 않는다.
    const [hours] = useState<SupportHoursState>(() => getSupportHoursState())

    // 요약은 이 답까지의 구간에서만 만든다. 구간 앞쪽 메시지는 바뀌지 않으므로 뒤 턴이 와도 같은 글이다.
    const draft = useMemo(() => buildConsultationDraft(messages, message), [messages, message])
    const superseded = useMemo(() => {
        const index = messages.findIndex((item) => item.id === message.id)
        return index >= 0 && messages.slice(index + 1).some((item) => item.showHandoffCTA)
    }, [messages, message.id])

    const intent = message.handoffIntent ?? "support"
    const topic = getHandoffTopic(message.handoffIntent)
    const channelTalkLabel = getChannelTalkLabel(intent, hours)
    const waitNotice = describeSupportHoursWait(hours)
    const redactedSomething = hasRedactedPlaceholder(draft)
    const showCopyFallback =
        status?.kind === "open_failed" ||
        status?.kind === "stash_failed" ||
        status?.kind === "copied" ||
        status?.kind === "copy_failed"
    // 대화 요약(draft)은 쿼리로 싣지 않는다 — 주소창·리퍼러·분석 URL 로 새어 나간다.
    // 링크를 누를 때 sessionStorage 로 건네고 문의 페이지가 읽자마자 지운다. #contact-form 으로 폼 첫 화면에 내려 준다(CX-18).
    const contactHref = `/contact?${new URLSearchParams({
        source: "chatbot",
        topic,
    }).toString()}#contact-form`

    function openConsultation() {
        const profile = buildHandoffProfile(messages, message, message.sessionId ?? sessionId)
        // 회원 id 는 '마케팅' 동의(+채널톡 키)가 있을 때만 만든다. 동의 없이 연 상담은 익명이다(쿠키 점검 C8).
        const opened = openChannelTalk({
            memberId: getChannelTalkMemberId(),
            profile,
            chatProfile: profile,
            draftMessage: draft,
        })
        setStatus({ kind: opened ? "opened" : "open_failed" })
        if (!opened) setSummaryOpen(true)
    }

    async function copyDraft() {
        try {
            if (!navigator?.clipboard?.writeText) {
                throw new Error("clipboard_not_supported")
            }
            await navigator.clipboard.writeText(draft)
            setStatus({ kind: "copied" })
        } catch {
            setStatus({ kind: "copy_failed" })
            setSummaryOpen(true)
        }
    }

    const statusText = (() => {
        switch (status?.kind) {
            case "opened":
                return hours === "open"
                    ? "상담창에 요약을 넣어 두었어요. 전송하면 담당자가 이어서 확인해요. 창을 닫으면 답을 못 볼 수 있어요. 연락받으려면 문의폼에 연락처를 남겨 주세요."
                    : "상담창에 요약을 넣어 두었어요. 전송하면 운영시간에 순서대로 확인해요. 창을 닫으면 답을 못 볼 수 있어요. 연락받으려면 문의폼에 연락처를 남겨 주세요."
            case "open_failed":
                return "상담창을 열지 못했어요. 문의폼으로 남겨 주시면 연락드릴게요."
            case "stash_failed":
                return "요약을 문의폼으로 옮기지 못했어요. 요약을 복사해 두고 한 번 더 누르면 문의폼으로 가요."
            case "copied":
                return "요약을 복사했어요. 문의폼의 '문의 내용' 칸에 붙여 넣어 주세요."
            case "copy_failed":
                return "복사하지 못했어요. 아래 요약을 길게 눌러 직접 복사해 주세요."
            default:
                return ""
        }
    })()
    const statusIsError = status?.kind === "open_failed" || status?.kind === "stash_failed" || status?.kind === "copy_failed"

    if (superseded && !expandedWhileSuperseded) {
        // 뒤에 새 상담 카드가 있으면 이 카드는 한 줄로 접는다 — 같은 버튼이 대화에 쌓이지 않게(CX-03).
        return (
            <div className="mt-3 border-t border-line-hair pt-2">
                <button
                    ref={expandToggleRef}
                    type="button"
                    aria-expanded={false}
                    onClick={() => {
                        toggledByUserRef.current = true
                        setExpandedWhileSuperseded(true)
                    }}
                    className={cn(
                        "inline-flex h-9 items-center gap-1.5 rounded-[8px] px-1 text-label text-fg-muted transition-colors hover:text-fg-accent",
                        CHATBOT_HIT_AREA_CLASS
                    )}
                >
                    <MessageCircle className="h-4 w-4" aria-hidden />
                    이전 상담 연결 안내 펼치기
                    <ChevronDown className="h-3.5 w-3.5" aria-hidden />
                </button>
            </div>
        )
    }

    return (
        <motion.div
            initial={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, y: 8 }}
            animate={shouldReduceMotion ? { opacity: 1 } : { opacity: 1, y: 0 }}
            transition={{ duration: shouldReduceMotion ? 0.01 : 0.28, ease: EASING_SOFT_ENTER }}
            className="mt-3 border-t border-fg-accent/10 pt-3"
        >
            {/* 머리 줄: 제목과 (휴대폰) 요약 펼치기 · (뒤에 새 카드가 생긴 뒤 펼쳤으면) 접기. 버튼 줄이 바로 아래 오도록 한 줄에 둔다. */}
            <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5 text-label text-fg-accent">
                    <MessageCircle className="h-4 w-4" aria-hidden />
                    상담 연결
                </div>
                <div className="flex items-center gap-1">
                    {/* 휴대폰에서는 요약을 접어 버튼 줄이 먼저 보이게 한다. 데스크톱은 늘 펼친다. */}
                    <button
                        type="button"
                        aria-expanded={summaryOpen}
                        aria-controls={summaryId}
                        onClick={() => setSummaryOpen((open) => !open)}
                        className={cn(
                            "inline-flex h-8 items-center gap-1 rounded-[8px] px-1 text-note text-fg-muted transition-colors hover:text-fg-accent md:hidden",
                            CHATBOT_HIT_AREA_32_CLASS
                        )}
                    >
                        {summaryOpen ? "요약 접기" : "요약 보기"}
                        <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", summaryOpen && "rotate-180")} aria-hidden />
                    </button>
                    {superseded ? (
                        <button
                            ref={collapseToggleRef}
                            type="button"
                            aria-expanded
                            onClick={() => {
                                toggledByUserRef.current = true
                                setExpandedWhileSuperseded(false)
                            }}
                            className={cn(
                                "inline-flex h-8 items-center gap-1 rounded-[8px] px-1 text-note text-fg-muted transition-colors hover:text-fg-accent",
                                CHATBOT_HIT_AREA_32_CLASS
                            )}
                        >
                            카드 접기
                        </button>
                    ) : null}
                </div>
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-2">
                <Link
                    href={contactHref}
                    onClick={(event) => {
                        // 요약은 주소가 아니라 sessionStorage 로 넘긴다. 저장이 막히면 조용히 빈 폼으로
                        // 보내지 않고 복사해서 붙여 넣도록 안내한다(한 번 더 누르면 빈 폼으로 간다).
                        if (stashContactPrefill(draft)) {
                            onNavigate?.(event)
                            return
                        }
                        if (status?.kind === "stash_failed" || status?.kind === "copied" || status?.kind === "copy_failed") {
                            onNavigate?.(event)
                            return
                        }
                        event.preventDefault()
                        setStatus({ kind: "stash_failed" })
                        setSummaryOpen(true)
                    }}
                    className={cn(PRIMARY_BUTTON_CLASS, CHATBOT_HIT_AREA_CLASS)}
                >
                    문의폼에 연락처 남기기
                    <ArrowRight className="h-3.5 w-3.5" aria-hidden />
                </Link>
                <button
                    type="button"
                    onClick={openConsultation}
                    className={cn(SECONDARY_BUTTON_CLASS, CHATBOT_HIT_AREA_CLASS)}
                >
                    <MessageCircle className="h-3.5 w-3.5" aria-hidden />
                    {channelTalkLabel}
                </button>
                {showCopyFallback ? (
                    <button
                        type="button"
                        onClick={() => void copyDraft()}
                        className={cn(SECONDARY_BUTTON_CLASS, CHATBOT_HIT_AREA_CLASS)}
                    >
                        {status?.kind === "copied" ? <Check className="h-3.5 w-3.5" aria-hidden /> : <Copy className="h-3.5 w-3.5" aria-hidden />}
                        요약 복사
                    </button>
                ) : null}
            </div>
            <p
                role="status"
                className={cn("text-note", statusText ? "mt-2" : "sr-only", statusIsError ? "text-fg-danger" : "text-fg-muted")}
            >
                {statusText}
            </p>
            {/* 운영시간. 운영시간 밖(점심 포함)에는 '바로'·'실시간' 없이 언제 확인하는지 말한다(CX-07). */}
            <p className="mt-2 text-note text-fg-muted">
                {waitNotice ?? `상담 운영시간: ${SUPPORT_HOURS_FULL_LABEL}`}
            </p>
            <div id={summaryId} className={cn("mt-2", summaryOpen ? "block" : "hidden md:block")}>
                <p className="hidden text-note text-fg-muted md:block">담당자에게 넘길 요약</p>
                <div className="mt-1 rounded-[12px] border border-line-hair bg-surface-sunken px-3 py-2 text-note text-fg-body">
                    <p className="whitespace-pre-line [overflow-wrap:anywhere]">{draft}</p>
                </div>
                {redactedSomething ? (
                    <p className="mt-1 text-note text-fg-muted">
                        요약에서 연락처·이름은 가렸어요. 연락처는 문의폼 칸에 남겨 주세요.
                    </p>
                ) : null}
            </div>
        </motion.div>
    )
}
