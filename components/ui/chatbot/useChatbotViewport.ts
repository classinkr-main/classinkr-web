"use client"

import { useCallback, useMemo, useSyncExternalStore, type CSSProperties } from "react"

import { CHATBOT_DESKTOP_MEDIA_QUERY } from "@/components/ui/chatbot-link-navigation"

/*
 * 대화창 크기를 보이는 화면(visualViewport)에 맞춘다(CX-10).
 *
 * 휴대폰 키보드가 올라오면 iOS Safari·Android Chrome(기본 resizes-visual) 모두 레이아웃 뷰포트는 그대로 두고 보이는 화면만 줄인다.
 * fixed 로 아래에 붙은 대화창은 키보드에 가려지고, 100svh 로 잡은 높이는 줄지 않는다. 그래서 열린 동안 visualViewport 를 읽어
 * 대화창을 키보드 위로 올리고 높이를 보이는 화면에 맞춘다. viewport 메타의 interactive-widget 은 사이트 전체 레이아웃을 바꾸므로 쓰지 않는다
 * (실기기 비교는 사람 확인 항목).
 *
 * 낮은 화면(가로 모드·키보드·글꼴 확대)에서는 compact 로 헤더를 한 줄로 줄이고 부제·환영 칩을 접고 휴대폰 런처를 감춘다.
 * 기준은 rem 이라 글꼴을 키우면(200%) 같은 화면도 낮은 화면으로 본다.
 */

/** 보이는 높이가 이 rem 보다 낮으면 compact(16px 기준 544px). */
export const CHATBOT_COMPACT_MAX_REM = 34
/** 아래가 이만큼 가려지면 키보드가 열린 것으로 본다. */
export const CHATBOT_KEYBOARD_MIN_PX = 120
/** 대화창 최대 높이(휴대폰 클래스 h-[min(680px,…)] 와 같다). */
const PANEL_MAX_HEIGHT_PX = 680

export interface ChatbotViewportInput {
    innerHeight: number
    visualHeight?: number
    visualOffsetTop?: number
    scale?: number
    rootFontSize?: number
}

export interface ChatbotViewport {
    /** 보이는 화면 높이(px). */
    height: number
    /** 레이아웃 뷰포트 아래가 가려진 높이(키보드 등, px). 0 이면 가려진 곳이 없다. */
    keyboardInset: number
    compact: boolean
}

export function resolveChatbotViewport({
    innerHeight,
    visualHeight,
    visualOffsetTop = 0,
    scale = 1,
    rootFontSize = 16,
}: ChatbotViewportInput): ChatbotViewport {
    const fontSize = rootFontSize > 0 ? rootFontSize : 16
    // 두 손가락 확대 중에는 보이는 화면이 줄고 움직이므로 키보드로 보지 않는다(대화창을 따라 움직이지 않는다).
    const zoomed = scale > 1.01
    const hasVisual = typeof visualHeight === "number" && visualHeight > 0
    const height = !zoomed && hasVisual ? visualHeight : innerHeight
    const rawInset = !zoomed && hasVisual ? innerHeight - visualHeight - visualOffsetTop : 0
    const keyboardInset = rawInset >= 1 ? Math.round(rawInset) : 0
    const compact = height / fontSize < CHATBOT_COMPACT_MAX_REM || keyboardInset >= CHATBOT_KEYBOARD_MIN_PX
    return { height: Math.max(0, Math.round(height)), keyboardInset, compact }
}

export interface MobilePanelLayout {
    wrapperStyle?: CSSProperties
    panelStyle?: CSSProperties
    /** 런처를 감춘다(대화창 헤더에 닫기 버튼이 있다). 낮은 화면에서 목록 높이를 되찾는다. */
    hideLauncher: boolean
}

/**
 * 휴대폰(< 48rem) 대화창의 위치·높이. 보통 화면은 클래스(h-[min(680px,calc(100svh-5.5rem))])를 그대로 쓰고,
 * 키보드가 열렸거나 낮은 화면이면 보이는 높이에 맞춘 값을 inline 으로 준다.
 */
export function resolveMobilePanelLayout(viewport: ChatbotViewport): MobilePanelLayout {
    if (viewport.keyboardInset > 0) {
        return {
            wrapperStyle: { bottom: `${viewport.keyboardInset}px`, paddingBottom: "0.5rem" },
            panelStyle: { height: `min(${PANEL_MAX_HEIGHT_PX}px, calc(${viewport.height}px - 1rem))`, marginBottom: 0 },
            hideLauncher: true,
        }
    }
    if (viewport.compact) {
        return {
            wrapperStyle: { paddingBottom: "calc(0.5rem + env(safe-area-inset-bottom))" },
            panelStyle: {
                height: `min(${PANEL_MAX_HEIGHT_PX}px, calc(${viewport.height}px - 1rem - env(safe-area-inset-bottom)))`,
                marginBottom: 0,
            },
            hideLauncher: true,
        }
    }
    return { hideLauncher: false }
}

// 글꼴 크기는 열 때와 화면 크기가 바뀔 때만 읽는다(그릴 때마다 계산 스타일을 읽지 않는다).
let rootFontSizeCache = 16

function readRootFontSize() {
    if (typeof window === "undefined") return 16
    const value = Number.parseFloat(window.getComputedStyle(document.documentElement).fontSize)
    return Number.isFinite(value) && value > 0 ? value : 16
}

function readViewportKey(): string {
    if (typeof window === "undefined") return ""
    const visual = window.visualViewport
    const viewport = resolveChatbotViewport({
        innerHeight: window.innerHeight,
        visualHeight: visual?.height,
        visualOffsetTop: visual?.offsetTop,
        scale: visual?.scale,
        rootFontSize: rootFontSizeCache,
    })
    return `${viewport.height}|${viewport.keyboardInset}|${viewport.compact ? 1 : 0}`
}

const inactiveKey = () => ""

function parseViewportKey(key: string): ChatbotViewport | null {
    if (!key) return null
    const [height, keyboardInset, compact] = key.split("|")
    return { height: Number(height), keyboardInset: Number(keyboardInset), compact: compact === "1" }
}

/** 대화창이 보이는 동안만 보이는 화면을 구독한다. 닫혀 있으면 null. */
export function useChatbotViewport(active: boolean): ChatbotViewport | null {
    const subscribe = useCallback(
        (notify: () => void) => {
            if (!active || typeof window === "undefined") return () => {}
            rootFontSizeCache = readRootFontSize()
            const handle = () => {
                rootFontSizeCache = readRootFontSize()
                notify()
            }
            const visual = window.visualViewport
            visual?.addEventListener("resize", handle)
            visual?.addEventListener("scroll", handle)
            window.addEventListener("resize", handle)
            notify()
            return () => {
                visual?.removeEventListener("resize", handle)
                visual?.removeEventListener("scroll", handle)
                window.removeEventListener("resize", handle)
            }
        },
        [active]
    )
    const key = useSyncExternalStore(subscribe, active ? readViewportKey : inactiveKey, inactiveKey)
    return useMemo(() => parseViewportKey(key), [key])
}

function subscribeMobileQuery(notify: () => void) {
    const query = window.matchMedia(CHATBOT_DESKTOP_MEDIA_QUERY)
    query.addEventListener("change", notify)
    return () => query.removeEventListener("change", notify)
}

/** 휴대폰 폭(< 48rem)인지. 대화창이 모달이 되고 뒤로가기로 닫히는 기준이다(DESIGN.md 5-C 와 Tailwind md: 경계). */
export function useIsMobileChatbotViewport(): boolean {
    return useSyncExternalStore(
        subscribeMobileQuery,
        () => !window.matchMedia(CHATBOT_DESKTOP_MEDIA_QUERY).matches,
        () => false
    )
}
