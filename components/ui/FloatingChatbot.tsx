"use client"

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react"
import Image from "next/image"
import { usePathname } from "next/navigation"
import { AnimatePresence, motion, useReducedMotion } from "framer-motion"
import { ArrowDown, X } from "lucide-react"

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
import { useConsentBannerOpen } from "@/components/consent/banner-presence"
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
import { ChatbotHeader, NewChatUndoBar } from "@/components/ui/chatbot/ChatbotHeader"
import { ChatComposer, createComposerDraftStore } from "@/components/ui/chatbot/ChatComposer"
import { MessageList } from "@/components/ui/chatbot/MessageList"
import { DEEP_CONSULTATION_ICON_SRC, containerVariants, itemVariants } from "@/components/ui/chatbot/constants"
import { findCurrentTurnStart, findQuestionAnchorId, latestMessageSignature } from "@/components/ui/chatbot/message-visibility"
import {
    CONTINUE_READING_OVERLAP_PX,
    pickAnchorTarget,
    resolveModeAfterUserScroll,
    resolveReadingScroll,
    resolveReopenScroll,
    shouldShowContinueHint,
    type ReadingScrollMode,
    type SavedListScroll,
} from "@/components/ui/chatbot/reading-scroll"
import { CHATBOT_HIT_AREA_CLASS } from "@/components/ui/chatbot-hit-area"
import { useChatbotConversation } from "@/components/ui/chatbot/useChatbotConversation"
import {
    resolveMobilePanelLayout,
    useChatbotViewport,
    useIsMobileChatbotViewport,
} from "@/components/ui/chatbot/useChatbotViewport"
import { useChatbotHistoryEntry, useModalBackground } from "@/components/ui/chatbot/useMobileChatbotModal"

// 챗봇 위젯 셸: 런처·패널 틀·열기/닫기·포커스·스크롤·티저를 맡는다.
// 대화 상태는 chatbot/useChatbotConversation, 헤더·목록·입력 폼·상담 카드는 chatbot/ 아래 모듈이 그린다.

// 끝 말풍선의 머리가 목록 아래 끝에서 이만큼 안쪽까지 내려가 있으면 '보이지 않는 새 답'으로 본다.
const JUMP_TO_LATEST_FOLD_SLACK_PX = 8
const FINE_POINTER_QUERY = "(hover: hover) and (pointer: fine)"
// 휠·키·손가락 입력 뒤 이만큼 안의 scroll 은 사용자가 움직인 것으로 본다. 끌기·관성 스크롤은 이어지는 동안 창을 늘린다.
// 손가락은 누른 동안을 touchend 로 재지 않는다 — 답을 받는 동안 손가락 밑 문단이 다시 그려지면 touchend 가 목록까지 오지 않는다.
const USER_SCROLL_INPUT_WINDOW_MS = 300
// 셸이 맞춘 scroll 이 이만큼 안에 그 자리로 오면 셸의 것으로 보고, 사용자 입력 직후라도 방식을 바꾸지 않는다.
const OWN_SCROLL_MATCH_MS = 200
// 셸이 부드럽게 내리는 scroll 이 끝날 만한 시간.
const AUTO_SCROLL_SETTLE_MS = 600
// 마우스로 스크롤 막대를 누른 채 이보다 오래면 놓친 pointerup 으로 보고 잡음을 푼다(목록 맞춤이 영영 멈추지 않게).
const USER_PRESS_STALE_MS = 10_000

// 목록 안 말풍선 머리의 위치(보이는 목록 위 끝에서 px). 여는 중인 창은 scale 이 걸려 있어 그만큼 되돌린다.
function measureTopInList(container: HTMLElement, element: HTMLElement): number {
    const box = container.getBoundingClientRect()
    const scale = container.offsetHeight > 0 && box.height > 0 ? box.height / container.offsetHeight : 1
    return (element.getBoundingClientRect().top - box.top) / scale
}


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

// 닫을 때 포커스를 돌려줄 수 있는 요소인지(연 버튼이 사라졌거나 가려졌으면 런처로 보낸다).
function canReturnFocusTo(element: HTMLElement | null): element is HTMLElement {
    if (!element || !element.isConnected) return false
    if (element.closest("[inert]")) return false
    if ((element as HTMLButtonElement).disabled) return false
    return element.getClientRects().length > 0
}

export function FloatingChatbot() {
    const pathname = usePathname()
    const shouldReduceMotion = useReducedMotion()
    const [isOpen, setIsOpen] = useState(false)
    const [showJumpToLatest, setShowJumpToLatest] = useState(false)
    const [showContinueHint, setShowContinueHint] = useState(false)
    const [muted, setMutedState] = useState(() => isMuted())
    const rootRef = useRef<HTMLDivElement | null>(null)
    const bottomRef = useRef<HTMLDivElement | null>(null)
    const messagesContainerRef = useRef<HTMLDivElement | null>(null)
    const pendingAssistantScrollIdRef = useRef<string | null>(null)
    const inputRef = useRef<HTMLTextAreaElement | null>(null)
    const triggerRef = useRef<HTMLButtonElement | null>(null)
    // 창을 연 요소(문서 '챗봇에게 묻기' 버튼·런처 등). 닫을 때 여기로 포커스를 돌려준다(CX-09).
    const openerRef = useRef<HTMLElement | null>(null)
    const returnFocusOnCloseRef = useRef(false)
    // 답 안 링크로 다른 페이지로 가며 닫혔다 — 포커스를 옮기지 않고 history 항목도 걷지 않는다.
    const closedByNavigationRef = useRef(false)
    const hasUserMessagesRef = useRef(false)
    // '새 답변' 버튼: 목록 끝의 지문과, 사용자가 맨 아래에서 마지막으로 본 지문.
    const latestSignatureRef = useRef("")
    const seenSignatureRef = useRef("")
    // 목록을 움직이는 방식(follow·anchor·hold, reading-scroll.ts)과 맞출 말풍선. 렌더와 상관없는 값이라 ref 로 둔다.
    const readingModeRef = useRef<ReadingScrollMode>("hold")
    const anchorIdRef = useRef<string | null>(null)
    // 사용자가 목록을 직접 움직이는지 가르는 값: 마우스로 누른 시각(0 이면 안 누름), 마지막 입력 시각, 마지막 scrollTop,
    // 셸이 마지막으로 맞춘 scrollTop 과 그 시각.
    const userScrollRef = useRef({ pressedAt: 0, lastInputAt: 0, lastTop: 0, ownTop: -1, ownAt: 0 })
    // 닫기 전 읽던 자리. 다시 열 때 대화가 그대로면 이 자리로 돌아간다.
    const savedScrollRef = useRef<SavedListScroll | null>(null)
    // 셸이 부드럽게 내리는 중인 시각의 끝(markAutoScroll).
    const autoScrollUntilRef = useRef(0)
    const lastQuestionIdRef = useRef<string | null>(null)
    const isSendingRef = useRef(false)
    // 입력 중인 글. 셸이 저장소를 들고 있어 창을 닫았다 열어도 이어지고, 글자를 칠 때는 ChatComposer 만 다시 그려진다.
    const [draftStore] = useState(createComposerDraftStore)

    const hidden = shouldHideChatbot(pathname)

    const {
        messages,
        sessionId,
        isSending,
        isStreaming,
        isSlow,
        cooldownSeconds,
        isDeepConsultation,
        setIsDeepConsultation,
        srAnnouncement,
        hasUserMessages,
        canUndoNewChat,
        sendQuestion,
        retryTurn,
        startNewChat,
        undoNewChat,
    } = useChatbotConversation({
        pathname,
        hidden,
        isOpen,
        pendingAssistantScrollIdRef,
        onBeforeSend: ({ clearDraft }) => {
            if (clearDraft) draftStore.set("")
            // 보낸 질문과 대기 말풍선이 보이게 맨 아래를 따라간다. 답 말풍선이 생기면 그 질문을 맞춘다(CX-12).
            readingModeRef.current = "follow"
            anchorIdRef.current = null
            setShowContinueHint(false)
        },
    })

    const chatbotTeaser = useChatbotTeaser({ pathname, isOpen })
    const openSourceRef = useRef<ChatbotOpenSource>("button")
    const wasOpenRef = useRef(false)
    const teaserShownTrackedRef = useRef(false)

    // 휴대폰(< 48rem)에서 대화창이 보이는 동안은 모달이다: 뒤쪽 inert·문서 스크롤 잠금·뒤로가기로 닫기(CX-09·CX-11).
    // 휴대폰은 쿠키 배너가 떠 있으면 대화창을 숨기므로(site-base.css 동시 노출) 그동안은 모달로 다루지 않는다.
    const isMobileViewport = useIsMobileChatbotViewport()
    const consentBannerOpen = useConsentBannerOpen()
    const isPanelVisible = isOpen && !hidden && !(isMobileViewport && consentBannerOpen)
    const isModal = isPanelVisible && isMobileViewport
    // 보이는 화면(키보드·가로 모드·글꼴 확대)에 맞춘 높이와 compact(CX-10).
    const viewport = useChatbotViewport(isPanelVisible)
    const compact = viewport?.compact ?? false
    const mobilePanelLayout = isMobileViewport && viewport ? resolveMobilePanelLayout(viewport) : null
    const hideLauncher = isOpen && Boolean(mobilePanelLayout?.hideLauncher)

    useModalBackground(isModal, rootRef)
    const { release: releaseHistoryEntry, abandon: abandonHistoryEntry } = useChatbotHistoryEntry({
        active: isModal,
        // 뒤로가기(휴대폰 쓸어 넘기기 포함)는 페이지를 떠나지 않고 창만 닫는다.
        onBack: () => {
            returnFocusOnCloseRef.current = true
            setIsOpen(false)
        },
    })

    // 닫기 버튼·Esc·딤·런처로 닫는다. 연 요소로 포커스를 돌려주고, 휴대폰에서 쌓은 history 항목을 걷는다.
    const closeChatbot = useCallback(() => {
        returnFocusOnCloseRef.current = true
        releaseHistoryEntry()
        setIsOpen(false)
    }, [releaseHistoryEntry])

    const toggleMute = () => {
        const nextMute = !muted
        setMutedState(nextMute)
        setMuted(nextMute)
    }

    useLayoutEffect(() => {
        hasUserMessagesRef.current = hasUserMessages
    }, [hasUserMessages])

    const lastQuestionId = useMemo(() => messages[findCurrentTurnStart(messages)]?.id ?? null, [messages])
    useLayoutEffect(() => {
        lastQuestionIdRef.current = lastQuestionId
        isSendingRef.current = isSending
    }, [lastQuestionId, isSending])

    // 다이얼로그 열기/닫기 시점에 음향 효과 재생
    useEffect(() => {
        if (isOpen) {
            playOpenSound()
        } else if (wasOpenRef.current) {
            playCloseSound()
        }
    }, [isOpen])

    // 열 때 연 요소를 기억한다(포커스를 옮기기 전에 읽는다).
    useLayoutEffect(() => {
        if (!isOpen) return
        const active = document.activeElement
        const dialog = document.getElementById("classin-chatbot-dialog")
        openerRef.current =
            active instanceof HTMLElement && active !== document.body && !dialog?.contains(active) ? active : null
    }, [isOpen])

    // 열면 정밀 포인터(마우스·트랙패드)는 입력창으로, 터치는 대화창 제목으로 포커스를 옮긴다.
    // 터치에서 키보드가 갑자기 뜨지 않게 입력창에는 주지 않는다(CX-09). 티저·문서 CTA 가 미리 채운 글은 끝에 커서를 둔다(CX-24).
    useEffect(() => {
        if (!isOpen) return

        const frame = window.requestAnimationFrame(() => {
            if (window.matchMedia(FINE_POINTER_QUERY).matches) {
                const input = inputRef.current
                if (!input) return
                input.focus()
                const end = input.value.length
                input.setSelectionRange(end, end)
                return
            }
            document.getElementById("classin-chatbot-title")?.focus({ preventScroll: true })
        })

        return () => window.cancelAnimationFrame(frame)
    }, [isOpen])

    // 닫히면 연 요소(없거나 가려졌으면 런처)로 포커스를 돌려준다. 답 안 링크로 떠나며 닫힌 경우는 다음 페이지로 가는 중이라 두고,
    // 쌓아 둔 history 항목도 걷지 않는다(걷으면 이동이 취소된다).
    useEffect(() => {
        if (isOpen) return
        if (closedByNavigationRef.current) {
            closedByNavigationRef.current = false
            returnFocusOnCloseRef.current = false
            abandonHistoryEntry()
            return
        }
        if (!returnFocusOnCloseRef.current) return
        returnFocusOnCloseRef.current = false
        const frame = window.requestAnimationFrame(() => {
            const opener = openerRef.current
            openerRef.current = null
            const target = canReturnFocusTo(opener) ? opener : triggerRef.current
            target?.focus()
        })
        return () => window.cancelAnimationFrame(frame)
    }, [isOpen, abandonHistoryEntry])

    // '새 답변' 버튼: 맨 아래가 아니고, 맨 아래에서 마지막으로 본 뒤 목록 끝이 바뀌었고, 끝 말풍선 머리가 화면 아래로 밀려나 있을 때만.
    // 답을 질문 기준으로 맞춘 직후처럼 새 답 머리가 보이는 동안에는 띄우지 않는다(CX-12). 대신 지금 읽는 답이 아래로 이어지면
    // '아래로 이어서 읽기' 표시를 둔다. 다시 열 때 돌아갈 읽던 자리도 여기서 적어 둔다.
    const updateJumpToLatest = useCallback(() => {
        const container = messagesContainerRef.current
        if (!container) return
        savedScrollRef.current = { top: container.scrollTop, signature: latestSignatureRef.current }
        if (isNearBottom(container)) {
            seenSignatureRef.current = latestSignatureRef.current
            setShowJumpToLatest(false)
            setShowContinueHint(false)
            return
        }
        const unseen = seenSignatureRef.current !== latestSignatureRef.current
        const items = container.querySelectorAll<HTMLElement>("[data-chat-message-id]")
        const last = items[items.length - 1]
        const belowFold =
            Boolean(last) &&
            last.getBoundingClientRect().top > container.getBoundingClientRect().bottom - JUMP_TO_LATEST_FOLD_SLACK_PX
        const showJump = unseen && belowFold
        setShowJumpToLatest(showJump)
        setShowContinueHint(
            shouldShowContinueHint({
                hasUserMessages: hasUserMessagesRef.current,
                jumpToLatestShown: showJump,
                following: readingModeRef.current === "follow" || performance.now() < autoScrollUntilRef.current,
                remainingBelow: container.scrollHeight - container.scrollTop - container.clientHeight,
                lastHeadAboveFold: Boolean(last) && !belowFold,
            })
        )
    }, [])

    // 셸이 부드럽게 내리는 동안('새 답변'·다 받은 렌더의 마지막 이동)은 '이어서 읽기'를 띄우지 않고, 다 내린 뒤 다시 잰다.
    const markAutoScroll = useCallback(() => {
        autoScrollUntilRef.current = performance.now() + AUTO_SCROLL_SETTLE_MS
        window.setTimeout(updateJumpToLatest, AUTO_SCROLL_SETTLE_MS + 50)
    }, [updateJumpToLatest])

    // 지금 방식(readingModeRef)대로 목록을 한 번 맞춘다(reading-scroll.ts). 마우스로 스크롤 막대를 잡고 있는 동안은 움직이지 않는다.
    const applyReadingScroll = useCallback((isSendingNow: boolean, smooth: boolean) => {
        const container = messagesContainerRef.current
        if (!container) return
        const gesture = userScrollRef.current
        if (gesture.pressedAt > 0 && performance.now() - gesture.pressedAt < USER_PRESS_STALE_MS) return
        const anchorId = anchorIdRef.current
        const anchor = anchorId ? container.querySelector<HTMLElement>(`[data-chat-message-id="${anchorId}"]`) : null
        const decision = resolveReadingScroll({
            mode: readingModeRef.current,
            scrollTop: container.scrollTop,
            scrollHeight: container.scrollHeight,
            clientHeight: container.clientHeight,
            anchorTop: anchor ? measureTopInList(container, anchor) : null,
            isSending: isSendingNow,
        })
        readingModeRef.current = decision.mode
        if (decision.scrollTop === null) return
        if (smooth) {
            markAutoScroll()
            container.scrollTo({ top: decision.scrollTop, behavior: "smooth" })
            return
        }
        container.scrollTop = decision.scrollTop
        gesture.ownTop = container.scrollTop
        gesture.ownAt = performance.now()
    }, [markAutoScroll])

    // 처음 열면(아직 질문이 없으면) 환영 말풍선 머리부터 보이게 맨 위에서 시작한다(CX-12). 이어지는 대화는 닫기 전 읽던 자리로
    // 돌아가고, 닫힌 동안 대화가 바뀌었으면(받던 답이 끝남·새로고침 뒤 복원) 마지막 질문을 맞춘다 — 짧은 턴이면 맨 아래와 같다.
    // 예전에는 늘 맨 아래로 가서, 긴 답을 머리부터 읽다 닫고 다시 열면 답 끝과 칩만 보였다.
    useEffect(() => {
        if (!isOpen) return
        const frame = window.requestAnimationFrame(() => {
            const container = messagesContainerRef.current
            if (!container) return
            const plan = resolveReopenScroll({
                hasUserMessages: hasUserMessagesRef.current,
                saved: savedScrollRef.current,
                signature: latestSignatureRef.current,
            })
            if (plan.kind === "anchor-last-question") {
                anchorIdRef.current = lastQuestionIdRef.current
                readingModeRef.current = "anchor"
                applyReadingScroll(isSendingRef.current, false)
                seenSignatureRef.current = latestSignatureRef.current
            } else {
                container.scrollTop = plan.kind === "restore" ? plan.top : 0
                readingModeRef.current = "hold"
            }
            userScrollRef.current.lastTop = container.scrollTop
            updateJumpToLatest()
        })

        return () => window.cancelAnimationFrame(frame)
    }, [isOpen, applyReadingScroll, updateJumpToLatest])

    const latestSignature = useMemo(() => latestMessageSignature(messages), [messages])
    useLayoutEffect(() => {
        latestSignatureRef.current = latestSignature
    }, [latestSignature])

    useEffect(() => {
        if (!isOpen) return
        const frame = window.requestAnimationFrame(updateJumpToLatest)
        return () => window.cancelAnimationFrame(frame)
    }, [isOpen, latestSignature, updateJumpToLatest])

    // 목록 scroll. 휠·키·손가락 입력 직후거나 마우스로 스크롤 막대를 잡고 있으면 사용자가 움직인 것이다: 맞춤을 멈추고 그 자리를
    // 존중하며, 받는 중에 스스로 맨 아래까지 내려오면 새 글을 따라간다(resolveModeAfterUserScroll). 셸이 맞춘 scroll 은 방식을 바꾸지 않는다.
    const handleScroll = () => {
        const container = messagesContainerRef.current
        if (!container) return
        const gesture = userScrollRef.current
        const now = performance.now()
        const top = container.scrollTop
        const delta = top - gesture.lastTop
        gesture.lastTop = top
        const ours = now - gesture.ownAt < OWN_SCROLL_MATCH_MS && Math.abs(top - gesture.ownTop) <= 1
        const pressed = gesture.pressedAt > 0 && now - gesture.pressedAt < USER_PRESS_STALE_MS
        if (!ours && (pressed || now - gesture.lastInputAt < USER_SCROLL_INPUT_WINDOW_MS)) {
            gesture.lastInputAt = now
            readingModeRef.current = resolveModeAfterUserScroll({
                mode: readingModeRef.current,
                delta,
                nearBottom: isNearBottom(container),
                isSending,
            })
        }
        updateJumpToLatest()
    }

    const markUserScrollInput = () => {
        userScrollRef.current.lastInputAt = performance.now()
    }
    // 마우스로 스크롤 막대를 끄는 동안. 목록 밖에서 놓아도 풀리게 창에서 기다린다. 손가락은 입력 창(markUserScrollInput)으로 가른다.
    const handleListPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
        if (event.pointerType === "touch") return
        userScrollRef.current.pressedAt = performance.now()
        const release = () => {
            userScrollRef.current.pressedAt = 0
            markUserScrollInput()
            window.removeEventListener("pointerup", release)
            window.removeEventListener("pointercancel", release)
        }
        window.addEventListener("pointerup", release)
        window.addEventListener("pointercancel", release)
    }

    const jumpToLatest = () => {
        const container = messagesContainerRef.current
        if (!container) return
        pendingAssistantScrollIdRef.current = null
        anchorIdRef.current = null
        // 받는 중이면 맨 아래 새 글을 따라간다. 버튼이 내리는 scroll 은 셸의 것이다 — 바로 앞의 끌기 입력 창에 묻혀 사용자 것으로 읽히지 않게 지운다.
        readingModeRef.current = isSending ? "follow" : "hold"
        userScrollRef.current.lastInputAt = 0
        seenSignatureRef.current = latestSignatureRef.current
        markAutoScroll()
        container.scrollTo({ top: container.scrollHeight, behavior: shouldReduceMotion ? "auto" : "smooth" })
        setShowJumpToLatest(false)
        // 버튼이 사라지므로 포커스를 옮겨 둔다: 정밀 포인터는 입력창, 터치는 대화 내용 영역.
        if (window.matchMedia(FINE_POINTER_QUERY).matches && inputRef.current) {
            inputRef.current.focus()
        } else {
            container.focus({ preventScroll: true })
        }
    }

    // 입력창이 커질 때 목록을 맨 아래에 붙일지(ChatComposer). 답 머리를 맞추는 중(anchor)이거나 맞춰 둔 채 받는 중(hold)이면
    // 붙이지 않는다 — 붙이면 입력창이 커진 만큼 질문·답 머리가 위로 밀린다. 따라가는 중·받은 뒤에는 예전처럼 붙인다.
    const shouldStickListToBottom = useCallback(
        () => readingModeRef.current === "follow" || (readingModeRef.current === "hold" && !isSendingRef.current),
        []
    )

    // '아래로 이어서 읽기': 한 화면씩 내리되 앞 화면의 끝 줄을 남겨 어디까지 읽었는지 잇는다. 사용자가 내린 것으로 본다.
    // 포커스는 대화 내용 영역으로 옮겨 이어서 화살표·PageDown 으로 읽게 한다(표시는 맨 아래에 닿으면 사라진다).
    const continueReading = () => {
        const container = messagesContainerRef.current
        if (!container) return
        markUserScrollInput()
        container.scrollBy({
            top: Math.max(container.clientHeight - CONTINUE_READING_OVERLAP_PX, container.clientHeight / 2),
            behavior: shouldReduceMotion ? "auto" : "smooth",
        })
        container.focus({ preventScroll: true })
    }

    // 답을 받는 동안 목록 자리(CX-12). 보낸 뒤에는 맨 아래를 따라가고, 답 말풍선이 생기면 그 답을 낳은 질문(긴 질문이면 답 머리)을
    // 목록 위쪽에 맞춘 뒤 멈춘다(hold) — 답이 길어져도 답 머리는 그 자리에 있고 사용자가 읽으며 내려간다. 예전에는 맞춘 뒤에도
    // '맨 아래 근처면 따라가기'가 조각마다 이겨 답 머리가 위로 밀려 나갔고, 끝 meta 렌더에서 한 번 더 따라가 390px 튀었다.
    // 답 말풍선이 생기기 전에 사용자가 목록을 움직였으면 맞추지 않는다. 다 받은 렌더의 마지막 이동(짧은 답에서 질문을 위로 맞추기·
    // 따라가던 맨 아래)은 부드럽게 한다(움직임 줄이기 설정이면 바로). 여는 렌더는 위 열기 효과가 자리를 정한다.
    const followWasSendingRef = useRef(false)
    const readingOpenRef = useRef(false)
    useEffect(() => {
        if (!isOpen) {
            readingOpenRef.current = false
            followWasSendingRef.current = false
            return
        }
        const justOpened = !readingOpenRef.current
        readingOpenRef.current = true
        const wasSending = followWasSendingRef.current
        followWasSendingRef.current = isSending
        if (justOpened) return

        const container = messagesContainerRef.current
        if (!container) return
        const pendingId = pendingAssistantScrollIdRef.current
        const answer = pendingId ? container.querySelector<HTMLElement>(`[data-chat-message-id="${pendingId}"]`) : null
        if (pendingId && answer) {
            pendingAssistantScrollIdRef.current = null
            if (readingModeRef.current === "follow") {
                const questionId = findQuestionAnchorId(messages, pendingId)
                const question = questionId
                    ? container.querySelector<HTMLElement>(`[data-chat-message-id="${questionId}"]`)
                    : null
                anchorIdRef.current =
                    question && pickAnchorTarget(question.offsetHeight, container.clientHeight) === "question" ? questionId : pendingId
                readingModeRef.current = "anchor"
            }
        }

        const endOfTurn = wasSending && !isSending
        if (!isSending && !endOfTurn) return
        applyReadingScroll(isSending, endOfTurn && !shouldReduceMotion)
    }, [isOpen, isSending, messages, shouldReduceMotion, applyReadingScroll])

    useEffect(() => {
        if (!isOpen) return

        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === "Escape" && !event.isComposing) {
                closeChatbot()
            }
        }

        document.addEventListener("keydown", handleKeyDown)
        return () => document.removeEventListener("keydown", handleKeyDown)
    }, [isOpen, closeChatbot])

    useEffect(() => {
        const handler = (event: Event) => {
            const detail = (event as CustomEvent<ChatbotOpenDetail>).detail
            openSourceRef.current = detail?.source ?? "cta"
            // 쓰던 글이 있으면 덮지 않는다(CX-24). 비어 있을 때만 미리 채운다.
            if (detail?.prefill && !draftStore.get().trim()) draftStore.set(detail.prefill)
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

    // 새 대화·되돌리기 뒤 포커스: 정밀 포인터면 입력창, 아니면 대화창 제목(h2 tabIndex=-1). 터치에서 키보드가 갑자기 뜨지 않게 한다.
    // 새 대화 버튼·되돌리기 버튼은 누른 뒤 사라지므로 포커스를 옮겨 둔다(CX-02).
    const focusAfterConversationReset = () => {
        window.requestAnimationFrame(() => {
            if (window.matchMedia(FINE_POINTER_QUERY).matches && inputRef.current) {
                inputRef.current.focus()
                return
            }
            document.getElementById("classin-chatbot-title")?.focus()
        })
    }

    const handleNewChat = () => {
        if (!startNewChat()) return
        readingModeRef.current = "hold"
        anchorIdRef.current = null
        focusAfterConversationReset()
    }

    const handleUndoNewChat = () => {
        if (!undoNewChat()) return
        focusAfterConversationReset()
        window.requestAnimationFrame(() => {
            const container = messagesContainerRef.current
            if (container) container.scrollTop = container.scrollHeight
            seenSignatureRef.current = latestSignatureRef.current
            readingModeRef.current = "hold"
            anchorIdRef.current = null
        })
    }

    // 휴대폰에서 답 안 링크로 다른 페이지(또는 같은 페이지 #앵커)로 가면 대화창과 딤이 목적지를 덮지 않게 닫는다.
    // 다음 페이지로 가는 중이라 런처로 포커스를 옮기지 않는다. 대화 상태(messages·sessionId)는 두므로 다시 열면 이어진다.
    const closeAfterInChatNavigation = useCallback((click: ChatLinkClick) => {
        const isDesktop = window.matchMedia(CHATBOT_DESKTOP_MEDIA_QUERY).matches
        if (!shouldCloseChatbotAfterLinkClick(click, isDesktop)) return
        closedByNavigationRef.current = true
        setIsOpen(false)
    }, [])

    if (hidden) return null

    return (
        <div
            ref={rootRef}
            style={mobilePanelLayout?.wrapperStyle}
            className="pointer-events-none fixed inset-x-0 bottom-0 z-(--z-chatbot) flex flex-col items-end px-3 pb-[calc(1rem+env(safe-area-inset-bottom))] md:inset-x-auto md:bottom-6 md:right-6 md:px-0 md:pb-0"
        >
            {/* 휴대폰 딤: scrim 토큰(blur 없음, DESIGN.md 면 6 · CX-14) */}
            <AnimatePresence>
                {isOpen && (
                    <motion.div
                        key="mobile-backdrop"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.18 }}
                        onClick={closeChatbot}
                        className="pointer-events-auto fixed inset-0 z-0 touch-none bg-surface-scrim md:hidden"
                        aria-hidden="true"
                    />
                )}
            </AnimatePresence>

            <AnimatePresence>
                {isOpen && (
                    <motion.div
                        id="classin-chatbot-dialog"
                        role="dialog"
                        // 휴대폰은 화면을 덮는 모달(뒤쪽 inert), 데스크톱은 페이지 옆에 떠 있는 비모달 창이다(CX-09).
                        aria-modal={isModal ? "true" : "false"}
                        aria-labelledby="classin-chatbot-title"
                        variants={containerVariants}
                        custom={shouldReduceMotion}
                        initial="initial"
                        animate="animate"
                        exit="exit"
                        style={mobilePanelLayout?.panelStyle}
                        // 불투명 면(CX-14): paper 지면 + 1px line-strong + Deep Shadow(떠 있는 층). 반투명 그라데이션·backdrop blur 없음 —
                        // 밝은 페이지 위에서 뒤 글자가 비치지 않고, 강제 색상(고대비)에서도 1px 선이 경계로 남는다.
                        // 반경(26px)은 챗봇 모양 결정 전이라 그대로 둔다(DESIGN.md '챗봇 위젯 면').
                        className="pointer-events-auto relative z-10 mb-3 flex h-[min(680px,calc(100svh-5.5rem))] w-full max-w-[36rem] origin-bottom overflow-hidden rounded-[26px] border border-line-strong bg-surface-paper text-fg-ink shadow-deep md:mb-4 md:h-[min(640px,calc(100svh-8rem))] md:w-[424px] md:max-w-[424px] md:origin-bottom-right"
                    >
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
                                canStartNewChat={hasUserMessages}
                                onNewChat={handleNewChat}
                                compact={compact}
                            />
                            {canUndoNewChat ? <NewChatUndoBar onUndo={handleUndoNewChat} /> : null}

                            {/* 대화 내용 목록 (Staggered Item 2) */}
                            <div className="relative flex min-h-0 flex-1 flex-col">
                                <motion.div
                                    ref={messagesContainerRef}
                                    // 목록 스크롤을 framer 레이아웃 측정에 넣는다. 없으면 입력창이 커질 때 맞춘 맨 아래 위치를
                                    // 메시지 layout 애니메이션이 스크롤 이동으로 오해해 되돌린다.
                                    layoutScroll
                                    onScroll={handleScroll}
                                    // 사용자가 직접 움직이는 scroll 을 가르는 입력(handleScroll).
                                    onWheel={markUserScrollInput}
                                    onKeyDown={markUserScrollInput}
                                    onTouchStart={markUserScrollInput}
                                    onTouchMove={markUserScrollInput}
                                    onTouchEnd={markUserScrollInput}
                                    onPointerDown={handleListPointerDown}
                                    variants={itemVariants}
                                    custom={shouldReduceMotion}
                                    // 대화 기록 영역(CX-27). 새 답은 셸의 안내 영역이 한 번 읽으므로 여기서는 낭독하지 않는다(aria-live off).
                                    // '새 답변' 버튼을 누른 뒤 포커스를 받을 수 있게 tabIndex=-1.
                                    role="log"
                                    aria-label="대화 내용"
                                    aria-live="off"
                                    tabIndex={-1}
                                    // 목록 끝에서 더 굴려도 뒤 페이지로 스크롤이 넘어가지 않는다(CX-11).
                                    className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3.5 py-4 [scrollbar-gutter:stable] [scrollbar-width:thin] md:px-4 [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-fg-accent/25 [&::-webkit-scrollbar-track]:bg-transparent"
                                >
                                    <MessageList
                                        messages={messages}
                                        sessionId={sessionId}
                                        isSending={isSending}
                                        isStreaming={isStreaming}
                                        isSlow={isSlow}
                                        cooldownSeconds={cooldownSeconds}
                                        shouldReduceMotion={shouldReduceMotion}
                                        compact={compact}
                                        sendQuestion={sendQuestion}
                                        onRetry={retryTurn}
                                        closeAfterInChatNavigation={closeAfterInChatNavigation}
                                        bottomRef={bottomRef}
                                    />
                                </motion.div>
                                {/* 위로 올려 읽는 동안 새 답이 아래에 오면 한 번에 내려가는 버튼(CX-12). 누름 영역 44px. */}
                                {showJumpToLatest ? (
                                    <button
                                        type="button"
                                        onClick={jumpToLatest}
                                        aria-label="새 답변으로 이동"
                                        className="absolute bottom-3 left-1/2 z-10 inline-flex min-h-11 -translate-x-1/2 items-center gap-1.5 rounded-(--radius-control) border border-line-strong bg-surface-sheet px-4 text-label text-fg-ink transition-colors hover:border-fg-accent hover:text-fg-accent"
                                    >
                                        <ArrowDown className="h-4 w-4" aria-hidden />
                                        새 답변
                                    </button>
                                ) : null}
                                {/* 지금 읽는 답이 아래로 이어진다는 표시. 답 말풍선 밖 오른쪽 여백(말풍선 최대 폭 92%·84% 바깥)에 두어 글을 가리지 않는다.
                                    누르면 한 화면씩 내린다. 보이는 36px, 누름 영역 44px. '새 답변' 버튼과 함께 뜨지 않는다. */}
                                {showContinueHint ? (
                                    <div className="pointer-events-none absolute bottom-3 right-1 z-10 md:right-4">
                                        <button
                                            type="button"
                                            data-chat-continue-hint=""
                                            onClick={continueReading}
                                            aria-label="아래로 이어서 읽기"
                                            title="아래로 이어서 읽기"
                                            className={cn(
                                                "pointer-events-auto inline-flex h-9 w-9 items-center justify-center rounded-(--radius-control) border border-line-strong bg-surface-sheet text-fg-muted transition-colors hover:border-fg-accent hover:text-fg-accent",
                                                CHATBOT_HIT_AREA_CLASS
                                            )}
                                        >
                                            <ArrowDown className="h-4 w-4" aria-hidden />
                                        </button>
                                    </div>
                                ) : null}
                            </div>

                            {/* 하단 폼 및 에러 (Staggered Item 3) */}
                            <ChatComposer
                                draftStore={draftStore}
                                inputRef={inputRef}
                                messagesContainerRef={messagesContainerRef}
                                isVisible={isPanelVisible}
                                cooldownSeconds={cooldownSeconds}
                                isSending={isSending}
                                isStreaming={isStreaming}
                                shouldReduceMotion={shouldReduceMotion}
                                sendQuestion={sendQuestion}
                                shouldStickListToBottom={shouldStickListToBottom}
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
                            // 닫기 버튼이 사라지므로 런처로 포커스를 옮긴다(CX-09).
                            triggerRef.current?.focus()
                        }}
                    />
                ) : null}
            </AnimatePresence>
            {/* 낮은 화면·키보드가 열린 휴대폰에서는 런처를 감춰 목록 높이를 되찾는다(헤더에 닫기 버튼이 있다, CX-10). */}
            <div className={cn("pointer-events-auto relative flex h-14 w-14 items-center justify-center md:h-16 md:w-16", hideLauncher && "hidden")}>
                <motion.button
                    ref={triggerRef}
                    type="button"
                    whileHover={shouldReduceMotion ? undefined : { scale: 1.05 }}
                    whileTap={m(CHATBOT_MOTION.tap, shouldReduceMotion)}
                    onClick={() => {
                        if (isOpen) {
                            closeChatbot()
                            return
                        }
                        openSourceRef.current = "button"
                        setIsOpen(true)
                    }}
                    // 런처는 떠 있는 층이라 Deep Shadow 하나를 둔다. 원형은 챗봇 모양 결정 전까지의 예외(DESIGN.md §5 반경).
                    // 닫힌 런처의 선은 채움과 같은 색이라 평소에는 보이지 않고, 강제 색상에서만 경계로 남는다.
                    className={cn(
                        "relative flex h-14 w-14 items-center justify-center overflow-hidden rounded-full border shadow-deep transition-colors md:h-16 md:w-16",
                        isOpen
                            ? "border-line-strong bg-surface-sheet text-fg-ink hover:bg-surface-sunken"
                            : "border-fg-accent bg-fg-accent text-fg-on-accent hover:border-fg-accent-hover hover:bg-fg-accent-hover"
                    )}
                    aria-label={isOpen ? "챗봇 닫기" : "챗봇 열기"}
                    aria-expanded={isOpen}
                    aria-controls="classin-chatbot-dialog"
                >
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
                                <X className="h-6 w-6 text-fg-ink" />
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
                                <ClassInAIIcon size={28} variant="white" className="relative md:h-8 md:w-8" />
                            </motion.div>
                        )}
                    </AnimatePresence>

                    {/* 예전의 초록 핑 점('실시간 상담 대기')·후광은 사람 상담원이 기다리는 것처럼 읽혀 뺐다(CX-06).
                        이 창은 AI 안내이고, 사람 상담은 상담 연결 카드로 이어진다. */}
                </motion.button>
            </div>
        </div>
    )
}
