"use client"

import { FormEvent, useLayoutEffect, useSyncExternalStore, type RefObject } from "react"
import { motion } from "framer-motion"
import { LoaderCircle, Send } from "lucide-react"

import { isNearBottom, resolveChatInputHeight, resolveListScrollTopAfterInputResize } from "@/components/ui/chatbot-input-autosize"
import { itemVariants } from "@/components/ui/chatbot/constants"
import { CHATBOT_MOTION, m } from "@/lib/chatbot/motion"

// 입력 중인 글을 담는 작은 저장소. 셸이 하나 만들어 들고 있어서 창을 닫았다 열어도 글이 이어지고,
// 밖(티저·문서 CTA 의 prefill, 보낸 뒤 비우기)에서도 바꿀 수 있다. 글이 바뀌면 이 저장소를 구독한
// ChatComposer 만 다시 그려진다 — 셸과 대화 목록은 글자를 칠 때 다시 그려지지 않는다.
export interface ComposerDraftStore {
    get: () => string
    set: (value: string) => void
    subscribe: (listener: () => void) => () => void
}

export function createComposerDraftStore(): ComposerDraftStore {
    let value = ""
    const listeners = new Set<() => void>()
    return {
        get: () => value,
        set: (next) => {
            if (next === value) return
            value = next
            listeners.forEach((listener) => listener())
        },
        subscribe: (listener) => {
            listeners.add(listener)
            return () => {
                listeners.delete(listener)
            }
        },
    }
}

interface ChatComposerProps {
    draftStore: ComposerDraftStore
    inputRef: RefObject<HTMLTextAreaElement | null>
    messagesContainerRef: RefObject<HTMLDivElement | null>
    error: string | null
    isSending: boolean
    isStreaming: boolean
    shouldReduceMotion: boolean | null
    sendQuestion: (question: string) => Promise<void>
}

// 입력 폼·입력 상태·오류 띠. 입력 상태를 여기서 구독해 글자를 칠 때 대화 목록과 셸이 다시 그려지지 않는다.
export function ChatComposer({
    draftStore,
    inputRef,
    messagesContainerRef,
    error,
    isSending,
    isStreaming,
    shouldReduceMotion,
    sendQuestion,
}: ChatComposerProps) {
    const input = useSyncExternalStore(draftStore.subscribe, draftStore.get, draftStore.get)
    const setInput = draftStore.set

    // 입력창이 내용에 맞춰 44px → 112px 까지 늘고, 넘치면 안쪽 스크롤로 바뀐다.
    // 한계는 computed min/max-height 를 읽어 글꼴 확대 상태에서도 CSS(min-h-11·max-h-28)와 같게 둔다.
    // 그리기 전에 맞춰야 한 줄 높이로 깜빡이지 않으므로 layout effect 로 둔다.
    useLayoutEffect(() => {
        const el = inputRef.current
        if (!el) return

        const resize = () => {
            const container = messagesContainerRef.current
            const wasNearBottom = container ? isNearBottom(container) : false
            const prevScrollTop = container ? container.scrollTop : 0
            const prev = el.offsetHeight

            el.style.height = "auto"
            const cs = window.getComputedStyle(el)
            const { height, overflowY } = resolveChatInputHeight(
                el.scrollHeight,
                parseFloat(cs.minHeight),
                parseFloat(cs.maxHeight),
            )
            el.style.height = `${height}px`
            el.style.overflowY = overflowY

            // 입력창이 커지면 대화 목록이 줄어든다. 맨 아래를 보고 있었다면 계속 맨 아래에 둔다.
            // 재려고 auto 로 줄인 사이 깎인 scrollTop 은 되돌린다(스크롤 앵커링이 없는 Safari 에서 남는다).
            if (container) {
                const nextScrollTop = resolveListScrollTopAfterInputResize({
                    heightChanged: height !== prev,
                    wasNearBottom,
                    prevScrollTop,
                    scrollTop: container.scrollTop,
                    scrollHeight: container.scrollHeight,
                })
                if (nextScrollTop !== null) container.scrollTop = nextScrollTop
            }
        }

        resize()
        window.addEventListener("resize", resize)
        return () => window.removeEventListener("resize", resize)
    }, [input, inputRef, messagesContainerRef])

    function handleSubmit(event: FormEvent<HTMLFormElement>) {
        event.preventDefault()
        void sendQuestion(input)
    }

    return (
        <motion.div
            variants={itemVariants}
            custom={shouldReduceMotion}
            className="relative flex flex-col min-h-0 w-full"
        >
            {error ? (
                <div className="flex items-center justify-between gap-3 border-t border-white/50 bg-[#FBEAE2]/70 px-4 py-2 text-xs font-medium text-[#7A2A13] backdrop-blur-xl">
                    <span>{error}</span>
                </div>
            ) : null}

            <form onSubmit={handleSubmit} className="relative overflow-hidden border-t border-white/50 bg-white/25 p-3.5 backdrop-blur-xl w-full">
                {/* 생성 중 상단 은은한 에메랄드 스트리밍 진행 표시선 */}
                {(isSending || isStreaming) && !shouldReduceMotion && (
                    <motion.div
                        aria-hidden
                        className="pointer-events-none absolute inset-x-0 top-0 h-[2px] bg-[linear-gradient(90deg,transparent_0%,#10B981_50%,transparent_100%)]"
                        animate={{ x: ["-100%", "100%"] }}
                        transition={{ duration: 1.5, repeat: Infinity, ease: "easeInOut" }}
                    />
                )}
                <div className="flex items-end gap-2 rounded-[16px] border border-white/70 bg-white/60 p-1.5 shadow-[0_10px_26px_rgba(49,48,46,0.06),inset_0_1px_0_rgba(255,255,255,0.75)] transition-colors focus-within:border-fg-accent/30 focus-within:bg-white/80 focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-fg-accent">
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
                        data-focus-ring="parent"
                        className="min-h-11 max-h-28 flex-1 resize-none rounded-[12px] border-0 bg-transparent px-3 py-2.5 text-[15px] leading-6 text-[#111110] placeholder:text-fg-placeholder focus-visible:outline-none transition-[height] duration-150 ease-out"
                    />
                    <motion.button
                        type="submit"
                        disabled={isSending || !input.trim()}
                        animate={{
                            scale: (isSending || !input.trim()) ? 0.96 : 1,
                            opacity: (isSending || !input.trim()) ? 0.45 : 1,
                        }}
                        whileHover={(isSending || !input.trim()) ? undefined : { scale: 1.05 }}
                        whileTap={(isSending || !input.trim()) ? undefined : { scale: 0.95 }}
                        transition={m(CHATBOT_MOTION.micro, shouldReduceMotion)}
                        className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-[12px] bg-fg-accent text-fg-on-accent transition-colors hover:bg-fg-accent-hover disabled:cursor-not-allowed disabled:shadow-none focus-visible:outline-none"
                        aria-label="질문 보내기"
                    >
                        {isSending ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                    </motion.button>
                </div>
            </form>
        </motion.div>
    )
}
