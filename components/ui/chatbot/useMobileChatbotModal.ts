"use client"

import { useEffect, useLayoutEffect, useState, type RefObject } from "react"

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

interface ChatbotHistoryEntryOptions {
    isActive: () => boolean
    onBack: () => void
}

/**
 * history 항목을 쌓고 걷는 규칙(훅이 effect 로 이어 붙인다).
 * - 이동·새로고침으로 쌓은 항목이 남으면(token 이 기억에서 사라진 뒤 그 항목에 다시 닿으면) 같은 문서를 가리키는 헛 항목이므로
 *   history.back() 으로 한 번 더 물러 뒤로가기 한 번이 헛돌지 않게 한다.
 */
export function createChatbotHistoryEntry(initial: ChatbotHistoryEntryOptions, win?: Pick<Window, "history">) {
    let { isActive, onBack } = initial
    let token: string | null = null
    // release/정리가 부른 history.back() 의 popstate 를 기다리는 중. 그사이 다시 열면 popstate 뒤에 쌓는다.
    let pendingBack = false
    const target = () => win ?? window

    const push = () => {
        if (token || pendingBack) return
        const next = makeHistoryToken()
        try {
            target().history.pushState({ [HISTORY_STATE_KEY]: next }, "")
            token = next
        } catch {
            // history 를 쓸 수 없는 환경: 뒤로가기 닫기 없이 동작한다.
        }
    }

    const stepBackFromStaleEntry = () => {
        pendingBack = true
        try {
            target().history.back()
        } catch {
            pendingBack = false
        }
    }

    /** 마운트 때: 새로고침으로 남은 옛 token 항목에 서 있으면 그 항목을 걷는다. */
    const cleanupStale = () => {
        if (token || pendingBack) return
        if (readHistoryToken(target().history.state)) stepBackFromStaleEntry()
    }

    const handlePopState = (state: unknown) => {
        if (pendingBack) {
            pendingBack = false
            if (isActive()) push()
            return
        }
        const eventToken = readHistoryToken(state)
        if (!token) {
            // 닫힌 창의 옛 항목(다른 페이지로 떠났다 돌아온 뒤 등)이면 한 번 더 물러선다.
            if (eventToken && !isActive()) stepBackFromStaleEntry()
            return
        }
        if (eventToken === token) return
        token = null
        onBack()
    }

    const release = () => {
        if (!token) return
        const current = token
        token = null
        if (readHistoryToken(target().history.state) !== current) return
        pendingBack = true
        target().history.back()
    }

    const abandon = () => {
        token = null
    }

    // 훅이 렌더마다 최신 값을 넣는다(컨트롤러는 한 번만 만든다).
    const setHandlers = (next: ChatbotHistoryEntryOptions) => {
        isActive = next.isActive
        onBack = next.onBack
    }

    return { push, cleanupStale, handlePopState, release, abandon, setHandlers }
}

/**
 * 휴대폰에서 대화창을 열면 history 항목을 하나 쌓고, 뒤로가기(popstate)로 그 항목을 벗어나면 onBack 을 부른다.
 * - release: 닫기 버튼·Esc·딤으로 닫을 때. 쌓은 항목이 지금 항목이면 history.back() 으로 걷어 낸다(뒤로가기가 한 번 헛돌지 않게).
 * - abandon: 답 안 링크로 다른 페이지로 갈 때. 이동이 그 항목 위에 쌓이므로 걷어 내지 않는다(걷으면 이동이 취소된다).
 *   남은 항목은 돌아올 때(popstate) 한 번 더 물러서며 정리한다.
 */
export function useChatbotHistoryEntry({ active, onBack }: { active: boolean; onBack: () => void }) {
    const [entry] = useState(() => createChatbotHistoryEntry({ isActive: () => false, onBack: () => {} }))

    useLayoutEffect(() => {
        entry.setHandlers({ isActive: () => active, onBack })
    })

    useEffect(() => {
        entry.cleanupStale()
    }, [entry])

    useEffect(() => {
        if (active) entry.push()
    }, [active, entry])

    useEffect(() => {
        const onPopState = (event: PopStateEvent) => entry.handlePopState(event.state)
        window.addEventListener("popstate", onPopState)
        return () => window.removeEventListener("popstate", onPopState)
    }, [entry])

    return { release: entry.release, abandon: entry.abandon }
}
