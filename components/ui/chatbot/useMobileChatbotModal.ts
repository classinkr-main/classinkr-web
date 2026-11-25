"use client"

import { useCallback, useEffect, useLayoutEffect, useRef, type RefObject } from "react"

/*
 * 휴대폰(< 48rem) 대화창을 모달로 다룬다(CX-09·CX-11).
 * - 뒤쪽(본문·헤더·푸터·쿠키 배너·하단 CTA)을 inert 로 만들어 Tab·화면 읽기가 대화창 밖으로 새지 않게 하고,
 *   문서 스크롤을 잠가 열린 채로 뒤 페이지가 움직이지 않게 한다.
 * - 열 때 history 에 같은 주소의 항목을 하나 쌓아, 뒤로가기 한 번이면 페이지를 떠나지 않고 창만 닫는다.
 *   Next.js App Router 는 바깥에서 부른 pushState 에 자기 상태(__NA·트리)를 복사해 넣으므로(app-router.js) 그 항목으로
 *   앞뒤로 움직여도 같은 페이지를 다시 그릴 뿐 새로고침하지 않는다.
 */

const HISTORY_STATE_KEY = "__classinChatbot"

function readHistoryToken(state: unknown): string | null {
    if (!state || typeof state !== "object") return null
    const value = (state as Record<string, unknown>)[HISTORY_STATE_KEY]
    return typeof value === "string" ? value : null
}

function makeHistoryToken() {
    return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`
}

/**
 * 대화창 자리(AppChrome 의 [data-chatbot-slot])와 형제인 요소를 inert 로 만든다. 이미 inert 인 요소(모바일 메뉴 등이 건 것)는
 * 건드리지 않고, 되돌릴 때도 여기서 건 것만 푼다. 채널톡·토스트처럼 .site 밖에 붙는 요소는 그대로 둔다.
 */
function makeBackgroundInert(root: HTMLElement | null): () => void {
    if (!root) return () => {}
    const slot = root.closest<HTMLElement>("[data-chatbot-slot]") ?? root
    const parent = slot.parentElement
    if (!parent) return () => {}
    const changed: HTMLElement[] = []
    for (const child of Array.from(parent.children)) {
        if (!(child instanceof HTMLElement) || child === slot || child.inert) continue
        child.inert = true
        changed.push(child)
    }
    return () => {
        for (const element of changed) element.inert = false
    }
}

/** 문서 스크롤을 잠근다. 스크롤 위치는 그대로 두고(position: fixed 를 쓰지 않는다) 사용자 스크롤만 막는다. */
function lockDocumentScroll(): () => void {
    const html = document.documentElement
    const body = document.body
    const previous = { html: html.style.overflow, body: body.style.overflow }
    html.style.overflow = "hidden"
    body.style.overflow = "hidden"
    return () => {
        html.style.overflow = previous.html
        body.style.overflow = previous.body
    }
}

/** 대화창이 모달인 동안 뒤쪽을 inert 로, 문서 스크롤을 잠근다. */
export function useModalBackground(active: boolean, rootRef: RefObject<HTMLElement | null>) {
    useEffect(() => {
        if (!active) return
        const restoreInert = makeBackgroundInert(rootRef.current)
        const unlockScroll = lockDocumentScroll()
        return () => {
            restoreInert()
            unlockScroll()
        }
    }, [active, rootRef])
}

/**
 * 휴대폰에서 대화창을 열면 history 항목을 하나 쌓고, 뒤로가기(popstate)로 그 항목을 벗어나면 onBack 을 부른다.
 * - release: 닫기 버튼·Esc·딤으로 닫을 때. 쌓은 항목이 지금 항목이면 history.back() 으로 걷어 낸다(뒤로가기가 한 번 헛돌지 않게).
 * - abandon: 답 안 링크로 다른 페이지로 갈 때. 이동이 그 항목 위에 쌓이므로 걷어 내지 않는다(걷으면 이동이 취소된다).
 */
export function useChatbotHistoryEntry({ active, onBack }: { active: boolean; onBack: () => void }) {
    const tokenRef = useRef<string | null>(null)
    // release 가 부른 history.back() 의 popstate 를 기다리는 중. 그사이 다시 열면 popstate 뒤에 쌓는다.
    const pendingBackRef = useRef(false)
    const activeRef = useRef(active)
    const onBackRef = useRef(onBack)

    useLayoutEffect(() => {
        activeRef.current = active
        onBackRef.current = onBack
    })

    const push = useCallback(() => {
        if (tokenRef.current || pendingBackRef.current) return
        const token = makeHistoryToken()
        try {
            window.history.pushState({ [HISTORY_STATE_KEY]: token }, "")
            tokenRef.current = token
        } catch {
            // history 를 쓸 수 없는 환경: 뒤로가기 닫기 없이 동작한다.
        }
    }, [])

    useEffect(() => {
        if (active) push()
    }, [active, push])

    useEffect(() => {
        const onPopState = (event: PopStateEvent) => {
            if (pendingBackRef.current) {
                pendingBackRef.current = false
                if (activeRef.current) push()
                return
            }
            const token = tokenRef.current
            if (!token || readHistoryToken(event.state) === token) return
            tokenRef.current = null
            onBackRef.current()
        }
        window.addEventListener("popstate", onPopState)
        return () => window.removeEventListener("popstate", onPopState)
    }, [push])

    const release = useCallback(() => {
        const token = tokenRef.current
        if (!token) return
        tokenRef.current = null
        if (readHistoryToken(window.history.state) !== token) return
        pendingBackRef.current = true
        window.history.back()
    }, [])

    const abandon = useCallback(() => {
        tokenRef.current = null
    }, [])

    return { release, abandon }
}
