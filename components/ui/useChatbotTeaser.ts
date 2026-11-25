"use client"

import { useCallback, useEffect, useRef, useState } from "react"

import { isChatbotSlotHidden, useConsentBannerOpen } from "@/components/consent/banner-presence"
import { resolvePageContext } from "@/lib/chatbot/page-context"
import { shouldShowTeaser, TEASER_DWELL_THRESHOLD_MS } from "@/lib/chatbot/teaser-policy"
import type { ConsentChoice } from "@/lib/consent/consent"
import { useConsent } from "@/lib/consent/useConsent"

export const TEASER_STORAGE_KEY = "classin.chatbot.teaser"
const TICK_MS = 1000

export interface StoredTeaserState {
    shown: boolean
    dismissed: boolean
    openedBefore: boolean
    dwellMs: number
}

const EMPTY: StoredTeaserState = { shown: false, dismissed: false, openedBefore: false, dwellMs: 0 }

function readState(): StoredTeaserState {
    if (typeof window === "undefined") return { ...EMPTY }
    try {
        const raw = window.sessionStorage.getItem(TEASER_STORAGE_KEY)
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
        window.sessionStorage.setItem(TEASER_STORAGE_KEY, JSON.stringify(next))
    } catch {
        // 프라이빗 모드 등 sessionStorage 불가 → 무시
    }
}

function clearState() {
    if (typeof window === "undefined") return
    try {
        window.sessionStorage.removeItem(TEASER_STORAGE_KEY)
    } catch {
        // 접근이 막힌 브라우저 → 지울 것도 없다
    }
}

/**
 * 티저 기록을 브라우저(sessionStorage)에 남겨도 되는지(쿠키 점검 C3·tech-12).
 * - persist: 선택 쿠키(분석·마케팅) 중 하나라도 동의했다.
 * - clear: '필수만'을 골랐거나 모두 철회했다 → 저장해 둔 기록을 지우고 이 페이지 안에서만 기억한다.
 * - memory: 아직 고르지 않았다 → 쓰지도 지우지도 않는다(배너가 떠 있어 체류도 쌓지 않는다).
 */
export function teaserStorageMode(decided: boolean, choice: ConsentChoice): "persist" | "clear" | "memory" {
    if (!decided) return "memory"
    return choice.analytics || choice.marketing ? "persist" : "clear"
}

/**
 * 1초마다 부르는 체류 계산(순수 함수). 쿠키 배너가 떠 있는 동안(곧 뜰 미결정 포함)은 쌓지 않고,
 * 아직 티저를 보이지 않았다면 0으로 되돌려 배너가 닫힌 뒤 처음부터 센다(CX-05).
 * 배너가 닫히는 순간 티저가 튀어나오지 않게 하려는 것이다.
 */
export function nextTeaserTick(
    prev: StoredTeaserState,
    { isEligible, bannerBlocking, tickMs = TICK_MS }: { isEligible: boolean; bannerBlocking: boolean; tickMs?: number },
): { state: StoredTeaserState; reveal: boolean } {
    if (bannerBlocking) {
        return { state: prev.shown || prev.dwellMs === 0 ? prev : { ...prev, dwellMs: 0 }, reveal: false }
    }
    const dwellMs = Math.min(prev.dwellMs + tickMs, TEASER_DWELL_THRESHOLD_MS + tickMs)
    const next: StoredTeaserState = { ...prev, dwellMs }
    if (
        shouldShowTeaser({
            dwellMs,
            isEligible,
            shown: next.shown,
            dismissed: next.dismissed,
            openedBefore: next.openedBefore,
        })
    ) {
        return { state: { ...next, shown: true }, reveal: true }
    }
    return { state: next, reveal: false }
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
    const [initialState] = useState(readState)
    const stateRef = useRef<StoredTeaserState>(initialState)
    const [show, setShow] = useState(false)
    const context = resolvePageContext(pathname)
    const isEligible = context.teaserEligible
    const { decided, choice } = useConsent()
    const bannerOpen = useConsentBannerOpen()
    // 미결정이면 배너가 곧 뜬다(지연 로드). 배너가 떠 있는 동안은 티저를 세지도 보이지도 않는다
    const bannerBlocking = bannerOpen || !decided
    const storageMode = teaserStorageMode(decided, choice)
    const storageModeRef = useRef(storageMode)

    const commit = useCallback((next: StoredTeaserState) => {
        stateRef.current = next
        if (storageModeRef.current === "persist") writeState(next)
    }, [])

    // 동의가 바뀌면 저장 방식을 따른다. 동의하면 지금까지의 기록을 옮겨 적고, '필수만'·철회면 지운다
    useEffect(() => {
        storageModeRef.current = storageMode
        if (storageMode === "persist") writeState(stateRef.current)
        else if (storageMode === "clear") clearState()
    }, [storageMode])

    // 탭이 보일 때만 체류 시간을 적립하고, 임계 도달 시 한 번 노출한다.
    useEffect(() => {
        if (typeof window === "undefined") return
        if (bannerBlocking) {
            const { state } = nextTeaserTick(stateRef.current, { isEligible, bannerBlocking })
            if (state !== stateRef.current) commit(state)
            return
        }
        const interval = window.setInterval(() => {
            if (document.visibilityState !== "visible") return
            const { state, reveal } = nextTeaserTick(stateRef.current, { isEligible, bannerBlocking: false })
            if (reveal) setShow(true)
            commit(state)
        }, TICK_MS)
        return () => window.clearInterval(interval)
    }, [isEligible, bannerBlocking, commit])

    // 비-eligible 페이지로 이동하면 노출을 감춘다(세션당 1회 정책상 재노출은 없음).
    useEffect(() => {
        if (!isEligible) {
            // eslint-disable-next-line react-hooks/set-state-in-effect
            setShow(false)
        }
    }, [isEligible])

    const dismiss = useCallback(() => {
        commit({ ...stateRef.current, dismissed: true })
        setShow(false)
    }, [commit])

    const markClicked = useCallback(() => {
        setShow(false)
    }, [])

    // 챗봇이 (어떤 경로로든) 열리면 다시 뜨지 않게 표시한다.
    // 다만 휴대폰에서 배너에 가린 채 열린 것(문서 '챗봇에게 묻기'의 열림 예약)은 아직 보지 못한 것이라 세지 않고,
    // 배너가 닫혀 창이 보일 때 센다(bannerOpen 이 바뀌면 다시 본다, 쿠키 점검 C16).
    useEffect(() => {
        if (!isOpen || isChatbotSlotHidden()) return
        commit({ ...stateRef.current, openedBefore: true })
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setShow(false)
    }, [isOpen, bannerOpen, commit])

    return {
        show: show && isEligible && !bannerBlocking,
        text: context.teaser,
        intent: context.intent,
        leadQuestion: context.starters[0] ?? "",
        dismiss,
        markClicked,
    }
}
