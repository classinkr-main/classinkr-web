"use client"

import { useCallback, useEffect, useRef, useState } from "react"

import { resolvePageContext } from "@/lib/chatbot/page-context"
import { shouldShowTeaser, TEASER_DWELL_THRESHOLD_MS } from "@/lib/chatbot/teaser-policy"

const STORAGE_KEY = "classin.chatbot.teaser"
const TICK_MS = 1000

interface StoredTeaserState {
    shown: boolean
    dismissed: boolean
    openedBefore: boolean
    dwellMs: number
}

const EMPTY: StoredTeaserState = { shown: false, dismissed: false, openedBefore: false, dwellMs: 0 }

function readState(): StoredTeaserState {
    if (typeof window === "undefined") return { ...EMPTY }
    try {
        const raw = window.sessionStorage.getItem(STORAGE_KEY)
        if (!raw) return { ...EMPTY }
        const parsed = JSON.parse(raw) as Partial<StoredTeaserState>
        return {
            shown: Boolean(parsed.shown),
            dismissed: Boolean(parsed.dismissed),
            openedBefore: Boolean(parsed.openedBefore),
            dwellMs: typeof parsed.dwellMs === "number" ? parsed.dwellMs : 0,
        }
    } catch {
        return { ...EMPTY }
    }
}

function writeState(next: StoredTeaserState) {
    if (typeof window === "undefined") return
    try {
        window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(next))
    } catch {
        // 프라이빗 모드 등 sessionStorage 불가 → 무시
    }
}

export interface ChatbotTeaserApi {
    show: boolean
    text: string
    intent?: "demo" | "support"
    leadQuestion: string
    dismiss: () => void
    markClicked: () => void
}

export function useChatbotTeaser({
    pathname,
    isOpen,
}: {
    pathname: string | null
    isOpen: boolean
}): ChatbotTeaserApi {
    const stateRef = useRef<StoredTeaserState>(readState())
    const [show, setShow] = useState(false)
    const context = resolvePageContext(pathname)
    const isEligible = context.teaserEligible

    // 탭이 보일 때만 체류 시간을 적립하고, 임계 도달 시 한 번 노출한다.
    useEffect(() => {
        if (typeof window === "undefined") return
        const interval = window.setInterval(() => {
            if (document.visibilityState !== "visible") return
            const prev = stateRef.current
            const dwellMs = Math.min(prev.dwellMs + TICK_MS, TEASER_DWELL_THRESHOLD_MS + TICK_MS)
            let next: StoredTeaserState = { ...prev, dwellMs }
            if (
                shouldShowTeaser({
                    dwellMs,
                    isEligible,
                    shown: next.shown,
                    dismissed: next.dismissed,
                    openedBefore: next.openedBefore,
                })
            ) {
                next = { ...next, shown: true }
                setShow(true)
            }
            stateRef.current = next
            writeState(next)
        }, TICK_MS)
        return () => window.clearInterval(interval)
    }, [isEligible])

    // 비-eligible 페이지로 이동하면 노출을 감춘다(세션당 1회 정책상 재노출은 없음).
    useEffect(() => {
        if (!isEligible) {
            // eslint-disable-next-line react-hooks/set-state-in-effect
            setShow(false)
        }
    }, [isEligible])

    const dismiss = useCallback(() => {
        const next = { ...stateRef.current, dismissed: true }
        stateRef.current = next
        writeState(next)
        setShow(false)
    }, [])

    const markClicked = useCallback(() => {
        setShow(false)
    }, [])

    // 챗봇이 (어떤 경로로든) 열리면 다시 뜨지 않게 표시한다.
    useEffect(() => {
        if (isOpen) {
            const next = { ...stateRef.current, openedBefore: true }
            stateRef.current = next
            writeState(next)
            // eslint-disable-next-line react-hooks/set-state-in-effect
            setShow(false)
        }
    }, [isOpen])

    return {
        show: show && isEligible,
        text: context.teaser,
        intent: context.intent,
        leadQuestion: context.starters[0] ?? "",
        dismiss,
        markClicked,
    }
}
