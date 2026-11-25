"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import Image from "next/image"
import { usePathname } from "next/navigation"
import { AnimatePresence, motion, useReducedMotion } from "framer-motion"
import { X } from "lucide-react"

import { ClassInAIIcon } from "@/components/ui/ClassInAIIcon"
import { cn } from "@/lib/utils"
import { trackEvent } from "@/lib/analytics"
import { CHATBOT_DESKTOP_MEDIA_QUERY, shouldCloseChatbotAfterLinkClick, type ChatLinkClick } from "@/components/ui/chatbot-link-navigation"
import {
    CHATBOT_OPEN_EVENT,
    openChatbot,
    type ChatbotOpenDetail,
    type ChatbotOpenSource,
} from "@/lib/chatbot/open-chatbot"
import { ChatbotTeaser } from "@/components/ui/ChatbotTeaser"
import { useChatbotTeaser } from "@/components/ui/useChatbotTeaser"
import { isNearBottom } from "@/components/ui/chatbot-input-autosize"
import { CHATBOT_MOTION, m } from "@/lib/chatbot/motion"
import {
    isMuted,
    setMuted,
    playOpenSound,
    playCloseSound,
} from "@/lib/chatbot/sound"
import { ChatbotHeader } from "@/components/ui/chatbot/ChatbotHeader"
import { ChatComposer, createComposerDraftStore } from "@/components/ui/chatbot/ChatComposer"
import { MessageList } from "@/components/ui/chatbot/MessageList"
import { DEEP_CONSULTATION_ICON_SRC, containerVariants, itemVariants } from "@/components/ui/chatbot/constants"
import { useChatbotConversation } from "@/components/ui/chatbot/useChatbotConversation"

// 챗봇 위젯 셸: 런처·패널 틀·열기/닫기·포커스·스크롤·티저를 맡는다.
// 대화 상태는 chatbot/useChatbotConversation, 헤더·목록·입력 폼·상담 카드는 chatbot/ 아래 모듈이 그린다.

const ANSWER_SCROLL_TOP_OFFSET_PX = 32


const hiddenPathPrefixes = [
    "/admin",
    "/api",
    "/checkout",
    "/pricing",
    "/receipt",
]

function shouldHideChatbot(pathname: string | null) {
    if (!pathname) return false
    return hiddenPathPrefixes.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`))
}

export function FloatingChatbot() {
    const pathname = usePathname()
    const shouldReduceMotion = useReducedMotion()
    const [isOpen, setIsOpen] = useState(false)
    const [isAtBottom, setIsAtBottom] = useState(true)
    const [muted, setMutedState] = useState(() => isMuted())
    const bottomRef = useRef<HTMLDivElement | null>(null)
    const messagesContainerRef = useRef<HTMLDivElement | null>(null)
    const pendingAssistantScrollIdRef = useRef<string | null>(null)
    const inputRef = useRef<HTMLTextAreaElement | null>(null)
    const triggerRef = useRef<HTMLButtonElement | null>(null)
    // 입력 중인 글. 셸이 저장소를 들고 있어 창을 닫았다 열어도 이어지고, 글자를 칠 때는 ChatComposer 만 다시 그려진다.
    const [draftStore] = useState(createComposerDraftStore)

    const hidden = shouldHideChatbot(pathname)

    const {
        messages,
        sessionId,
        isSending,
        isStreaming,
        error,
        isDeepConsultation,
        setIsDeepConsultation,
        srAnnouncement,
        sendQuestion,
    } = useChatbotConversation({
        pathname,
        hidden,
        pendingAssistantScrollIdRef,
        onBeforeSend: () => {
            draftStore.set("")
            setIsAtBottom(true)
        },
    })

    const chatbotTeaser = useChatbotTeaser({ pathname, isOpen })
    const openSourceRef = useRef<ChatbotOpenSource>("button")
    const wasOpenRef = useRef(false)
    const teaserShownTrackedRef = useRef(false)

    const toggleMute = () => {
        const nextMute = !muted
        setMutedState(nextMute)
        setMuted(nextMute)
    }

    // 다이얼로그 열기/닫기 시점에 음향 효과 재생
    useEffect(() => {
        if (isOpen) {
            playOpenSound()
        } else if (wasOpenRef.current) {
            playCloseSound()
        }
    }, [isOpen])

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
            setIsAtBottom(true)
        })

        return () => window.cancelAnimationFrame(frame)
    }, [isOpen, shouldReduceMotion])

    const handleScroll = () => {
        const container = messagesContainerRef.current
        if (!container) return

        setIsAtBottom(isNearBottom(container))
    }

    useEffect(() => {
        if (!isOpen) return

        if (isSending && isAtBottom) {
            const container = messagesContainerRef.current
            if (container) {
                container.scrollTop = container.scrollHeight
            }
        }
    }, [messages, isSending, isAtBottom, isOpen])

    useEffect(() => {
        if (!isOpen) return
        const messageId = pendingAssistantScrollIdRef.current
        if (!messageId) return

        const container = messagesContainerRef.current
        const message = container?.querySelector<HTMLElement>(`[data-chat-message-id="${messageId}"]`)
        if (!container || !message || !isAtBottom) return

        const containerRect = container.getBoundingClientRect()
        const messageRect = message.getBoundingClientRect()
        const nextTop = container.scrollTop + messageRect.top - containerRect.top - ANSWER_SCROLL_TOP_OFFSET_PX

        container.scrollTop = Math.max(0, nextTop)
        const alignedTop = message.getBoundingClientRect().top - container.getBoundingClientRect().top
        if (!isSending || alignedTop <= ANSWER_SCROLL_TOP_OFFSET_PX + 2) {
            pendingAssistantScrollIdRef.current = null
        }
    }, [isOpen, isSending, messages, isAtBottom])


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
            if (detail?.prefill) draftStore.set(detail.prefill)
            if (detail?.intent === "support") setIsDeepConsultation(true)
            setIsOpen(true)
        }
        window.addEventListener(CHATBOT_OPEN_EVENT, handler)
        return () => window.removeEventListener(CHATBOT_OPEN_EVENT, handler)
    }, [draftStore, setIsDeepConsultation])

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

    // 휴대폰에서 답 안 링크로 다른 페이지(또는 같은 페이지 #앵커)로 가면 대화창과 딤이 목적지를 덮지 않게 닫는다.
    // 다음 페이지로 가는 중이라 런처로 포커스를 옮기지 않는다. 대화 상태(messages·sessionId)는 두므로 다시 열면 이어진다.
    const closeAfterInChatNavigation = useCallback((click: ChatLinkClick) => {
        const isDesktop = window.matchMedia(CHATBOT_DESKTOP_MEDIA_QUERY).matches
        if (!shouldCloseChatbotAfterLinkClick(click, isDesktop)) return
        setIsOpen(false)
    }, [])

    if (hidden) return null

    function closeChatbot() {
        setIsOpen(false)
        window.requestAnimationFrame(() => {
            triggerRef.current?.focus()
        })
    }

    return (
        <div className="pointer-events-none fixed inset-x-0 bottom-0 z-(--z-chatbot) flex flex-col items-end px-3 pb-[calc(1rem+env(safe-area-inset-bottom))] md:inset-x-auto md:bottom-6 md:right-6 md:px-0 md:pb-0">
            {/* 모바일 화면 백드롭 딤/블러 오버레이 */}
            <AnimatePresence>
                {isOpen && (
                    <motion.div
                        key="mobile-backdrop"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.18 }}
                        onClick={closeChatbot}
                        className="pointer-events-auto fixed inset-0 z-0 bg-black/20 backdrop-blur-[2px] md:hidden"
                        aria-hidden="true"
                    />
                )}
            </AnimatePresence>

            <AnimatePresence>
                {isOpen && (
                    <motion.div
                        id="classin-chatbot-dialog"
                        role="dialog"
                        aria-modal="false"
                        aria-labelledby="classin-chatbot-title"
                        variants={containerVariants}
                        custom={shouldReduceMotion}
                        initial="initial"
                        animate="animate"
                        exit="exit"
                        className="pointer-events-auto relative z-10 mb-3 flex h-[min(680px,calc(100svh-5.5rem))] w-full max-w-none origin-bottom overflow-hidden rounded-[26px] border border-white/60 bg-[linear-gradient(152deg,rgba(255,255,255,0.88)_0%,rgba(236,253,245,0.76)_50%,rgba(246,245,244,0.82)_100%)] text-[#111110] backdrop-blur-2xl md:mb-4 md:h-[min(640px,calc(100svh-8rem))] md:w-[424px] md:max-w-[424px] md:origin-bottom-right"
                    >
                        <div className="pointer-events-none absolute inset-x-5 top-0 h-px bg-white/80" aria-hidden />

                        <div className="relative flex min-h-0 w-full flex-col">
                            {/* 헤더 (Staggered Item 1) */}
                            <ChatbotHeader
                                isDeepConsultation={isDeepConsultation}
                                isSending={isSending}
                                isStreaming={isStreaming}
                                shouldReduceMotion={shouldReduceMotion}
                                muted={muted}
                                toggleMute={toggleMute}
                                closeChatbot={closeChatbot}
                            />

                            {/* 대화 내용 목록 (Staggered Item 2) */}
                            <motion.div
                                ref={messagesContainerRef}
                                // 목록 스크롤을 framer 레이아웃 측정에 넣는다. 없으면 입력창이 커질 때 맞춘 맨 아래 위치를
                                // 메시지 layout 애니메이션이 스크롤 이동으로 오해해 되돌린다.
                                layoutScroll
                                onScroll={handleScroll}
                                variants={itemVariants}
                                custom={shouldReduceMotion}
                                className="min-h-0 flex-1 overflow-y-auto px-3.5 py-4 [scrollbar-gutter:stable] [scrollbar-width:thin] md:px-4 [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-fg-accent/25 [&::-webkit-scrollbar-track]:bg-transparent"
                            >
                                <MessageList
                                    messages={messages}
                                    sessionId={sessionId}
                                    isSending={isSending}
                                    isStreaming={isStreaming}
                                    shouldReduceMotion={shouldReduceMotion}
                                    sendQuestion={sendQuestion}
                                    closeAfterInChatNavigation={closeAfterInChatNavigation}
                                    bottomRef={bottomRef}
                                />
                            </motion.div>

                            {/* 하단 폼 및 에러 (Staggered Item 3) */}
                            <ChatComposer
                                draftStore={draftStore}
                                inputRef={inputRef}
                                messagesContainerRef={messagesContainerRef}
                                error={error}
                                isSending={isSending}
                                isStreaming={isStreaming}
                                shouldReduceMotion={shouldReduceMotion}
                                sendQuestion={sendQuestion}
                            />

                            {/* 스크린 리더용 안내 전용 영역 (A11y) */}
                            <div className="sr-only" aria-live="polite" aria-atomic="true">
                                {srAnnouncement}
                            </div>
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
            <div className="pointer-events-auto relative flex h-14 w-14 items-center justify-center md:h-16 md:w-16">
                {!isOpen && !shouldReduceMotion ? (
                    <motion.span
                        aria-hidden
                        className="pointer-events-none absolute -inset-1 rounded-full bg-[#10B981]/25 blur-md"
                        initial={{ scale: 0.96, opacity: 0.38 }}
                        animate={CHATBOT_MOTION.ambient}
                        transition={{ duration: CHATBOT_MOTION.ambient.duration, repeat: Infinity, repeatDelay: CHATBOT_MOTION.ambient.repeatDelay, ease: "easeOut" }}
                    />
                ) : null}
                <motion.button
                    ref={triggerRef}
                    type="button"
                    whileHover={shouldReduceMotion ? undefined : { scale: 1.05 }}
                    whileTap={m(CHATBOT_MOTION.tap, shouldReduceMotion)}
                    onClick={() => {
                        openSourceRef.current = "button"
                        setIsOpen((current) => !current)
                    }}
                    className={cn(
                        "relative flex h-14 w-14 items-center justify-center overflow-hidden rounded-full transition-all duration-200 md:h-16 md:w-16",
                        isOpen
                            ? "border border-black/[0.08] bg-white text-[#111110] shadow-[0_12px_28px_rgba(0,0,0,0.12),0_4px_10px_rgba(0,0,0,0.04)] hover:bg-[#F6F5F4]"
                            : "border border-white/20 bg-fg-accent text-fg-on-accent hover:bg-fg-accent-hover"
                    )}
                    aria-label={isOpen ? "챗봇 닫기" : "챗봇 열기"}
                    aria-expanded={isOpen}
                    aria-controls="classin-chatbot-dialog"
                >
                    <span
                        aria-hidden
                        className="pointer-events-none absolute inset-px rounded-full bg-white/10"
                    />
                    <AnimatePresence mode="wait" initial={false}>
                        {isOpen ? (
                            <motion.div
                                key="close-icon"
                                initial={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, rotate: -90, scale: 0.8 }}
                                animate={shouldReduceMotion ? { opacity: 1 } : { opacity: 1, rotate: 0, scale: 1 }}
                                exit={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, rotate: 90, scale: 0.8 }}
                                transition={{ duration: 0.18, ease: "easeOut" }}
                                className="flex items-center justify-center"
                            >
                                <X className="h-6 w-6 text-[#111110]" />
                            </motion.div>
                        ) : isDeepConsultation ? (
                            <motion.div
                                key="deep-consult-icon"
                                initial={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.8 }}
                                animate={shouldReduceMotion ? { opacity: 1 } : { opacity: 1, scale: 1 }}
                                exit={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.8 }}
                                transition={{ duration: 0.18, ease: "easeOut" }}
                                className="relative h-full w-full"
                            >
                                <Image
                                    src={DEEP_CONSULTATION_ICON_SRC}
                                    alt=""
                                    fill
                                    className="object-cover"
                                    sizes="64px"
                                    aria-hidden
                                />
                                <span className="absolute inset-0 bg-fg-accent/20 mix-blend-multiply" aria-hidden />
                            </motion.div>
                        ) : (
                            <motion.div
                                key="ai-icon"
                                initial={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, rotate: 90, scale: 0.8 }}
                                animate={shouldReduceMotion ? { opacity: 1 } : { opacity: 1, rotate: 0, scale: 1 }}
                                exit={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, rotate: -90, scale: 0.8 }}
                                transition={{ duration: 0.18, ease: "easeOut" }}
                                className="relative flex items-center justify-center"
                            >
                                <ClassInAIIcon size={28} variant="white" className="relative drop-shadow-[0_2px_4px_rgba(0,0,0,0.15)] md:h-8 md:w-8" />
                            </motion.div>
                        )}
                    </AnimatePresence>

                    {/* 실시간 상담 대기 상태 인디케이터 (Live Status Dot) */}
                    {!isOpen && (
                        <span
                            aria-hidden
                            className="pointer-events-none absolute right-2 top-2 flex h-2.5 w-2.5 md:right-2.5 md:top-2.5"
                        >
                            {!shouldReduceMotion && (
                                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#6EE7B7] opacity-75 duration-1000" />
                            )}
                            <span className="relative inline-flex h-2.5 w-2.5 rounded-full border-2 border-fg-accent bg-[#34D399]" />
                        </span>
                    )}
                </motion.button>
            </div>
        </div>
    )
}
