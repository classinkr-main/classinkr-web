import { readFileSync } from "node:fs"
import { join } from "node:path"

import { describe, expect, it } from "vitest"

import { CHAT_NEAR_BOTTOM_THRESHOLD_PX } from "@/components/ui/chatbot-input-autosize"
import {
    ANSWER_SCROLL_TOP_OFFSET_PX,
    pickAnchorTarget,
    resolveModeAfterUserScroll,
    resolveReadingRoomMinHeight,
    resolveReadingScroll,
    resolveReopenScroll,
    shouldShowContinueHint,
    type ReadingScrollMode,
} from "@/components/ui/chatbot/reading-scroll"

const CLIENT = 478

describe("resolveReadingScroll — 답을 받는 동안 목록 자리(CX-12)", () => {
    it("follow 는 맨 아래로 가고, 다 받은 렌더에서 한 번 따라간 뒤 hold 로 넘어간다", () => {
        expect(resolveReadingScroll({ mode: "follow", scrollTop: 100, scrollHeight: 900, clientHeight: CLIENT, anchorTop: null, isSending: true })).toEqual({
            scrollTop: 422,
            mode: "follow",
        })
        expect(resolveReadingScroll({ mode: "follow", scrollTop: 422, scrollHeight: 900, clientHeight: CLIENT, anchorTop: null, isSending: true })).toEqual({
            scrollTop: null,
            mode: "follow",
        })
        expect(resolveReadingScroll({ mode: "follow", scrollTop: 422, scrollHeight: 1300, clientHeight: CLIENT, anchorTop: null, isSending: false })).toEqual({
            scrollTop: 822,
            mode: "hold",
        })
    })

    it("anchor 는 맞출 자리가 없으면 그만큼만 올리고 계속 맞추며, 자리가 생기면 12px 에 맞춘 뒤 hold 로 넘어간다", () => {
        // 답이 짧아 질문 머리를 12px 까지 올릴 수 없다: 맨 아래(최대)까지만 올리고 anchor 를 이어 간다.
        expect(resolveReadingScroll({ mode: "anchor", scrollTop: 300, scrollHeight: 820, clientHeight: CLIENT, anchorTop: 200, isSending: true })).toEqual({
            scrollTop: 342,
            mode: "anchor",
        })
        // 자리가 생겼다: 질문 머리를 12px 에 둔다.
        expect(resolveReadingScroll({ mode: "anchor", scrollTop: 342, scrollHeight: 1200, clientHeight: CLIENT, anchorTop: 158, isSending: true })).toEqual({
            scrollTop: 342 + 158 - ANSWER_SCROLL_TOP_OFFSET_PX,
            mode: "hold",
        })
        // 이미 맞춰져 있으면 움직이지 않는다.
        expect(resolveReadingScroll({ mode: "anchor", scrollTop: 488, scrollHeight: 1200, clientHeight: CLIENT, anchorTop: 12, isSending: true })).toEqual({
            scrollTop: null,
            mode: "hold",
        })
    })

    it("anchor 대상이 아직 없으면 기다리고, 다 받은 렌더에서는 한 번 맞춘 뒤 hold 다", () => {
        expect(resolveReadingScroll({ mode: "anchor", scrollTop: 0, scrollHeight: 500, clientHeight: CLIENT, anchorTop: null, isSending: true }).mode).toBe("anchor")
        expect(resolveReadingScroll({ mode: "anchor", scrollTop: 0, scrollHeight: 500, clientHeight: CLIENT, anchorTop: null, isSending: false }).mode).toBe("hold")
        // 짧은 답: 끝 meta 로 길이가 생기면 질문을 위로 맞추고 끝낸다.
        expect(resolveReadingScroll({ mode: "anchor", scrollTop: 0, scrollHeight: 820, clientHeight: CLIENT, anchorTop: 221, isSending: false })).toEqual({
            scrollTop: 209,
            mode: "hold",
        })
    })

    it("hold 는 맨 아래 문턱 안이어도 움직이지 않는다(맞춘 뒤 조각마다 맨 아래로 끌려가던 결함)", () => {
        const decision = resolveReadingScroll({ mode: "hold", scrollTop: 488, scrollHeight: 1000, clientHeight: CLIENT, anchorTop: 12, isSending: true })
        expect(1000 - 488 - CLIENT).toBeLessThanOrEqual(CHAT_NEAR_BOTTOM_THRESHOLD_PX)
        expect(decision).toEqual({ scrollTop: null, mode: "hold" })
    })

    it("긴 답을 흘려도 질문 머리는 12px 에 머물고, 끝 meta 가 붙어도 움직이지 않는다", () => {
        // 질문 머리 글 위치 600, 질문 60px, 답은 조각마다 24px 씩 자라 900px 까지, 끝에 meta 390px.
        const questionY = 600
        const base = questionY + 60 + 16
        let mode: ReadingScrollMode = "follow"
        let scrollTop = Math.max(0, base + 40 - CLIENT)
        const qTops: number[] = []
        for (let answer = 24; answer <= 900; answer += 24) {
            if (answer === 24) mode = "anchor"
            const scrollHeight = base + answer + 16
            const decision = resolveReadingScroll({ mode, scrollTop, scrollHeight, clientHeight: CLIENT, anchorTop: questionY - scrollTop, isSending: true })
            mode = decision.mode
            if (decision.scrollTop !== null) scrollTop = decision.scrollTop
            qTops.push(questionY - scrollTop)
        }
        const final = resolveReadingScroll({ mode, scrollTop, scrollHeight: base + 900 + 390 + 16, clientHeight: CLIENT, anchorTop: questionY - scrollTop, isSending: false })
        if (final.scrollTop !== null) scrollTop = final.scrollTop
        const reachedAt = qTops.indexOf(ANSWER_SCROLL_TOP_OFFSET_PX)
        expect(reachedAt).toBeGreaterThan(0)
        // 맞춘 뒤로는 그대로이고, 맞추기 전에도 질문 머리는 목록 안에 있다.
        expect(new Set(qTops.slice(reachedAt))).toEqual(new Set([ANSWER_SCROLL_TOP_OFFSET_PX]))
        expect(Math.min(...qTops)).toBe(ANSWER_SCROLL_TOP_OFFSET_PX)
        expect(questionY - scrollTop).toBe(ANSWER_SCROLL_TOP_OFFSET_PX)
        expect(final.mode).toBe("hold")
    })
})

describe("pickAnchorTarget — 질문이 길면 답 머리를 맞춘다", () => {
    it("목록 높이 절반까지는 질문, 넘거나 질문이 없으면 답", () => {
        expect(pickAnchorTarget(120, CLIENT)).toBe("question")
        expect(pickAnchorTarget(CLIENT / 2, CLIENT)).toBe("question")
        expect(pickAnchorTarget(CLIENT / 2 + 1, CLIENT)).toBe("answer")
        expect(pickAnchorTarget(null, CLIENT)).toBe("answer")
    })
})

describe("resolveModeAfterUserScroll — 사용자가 움직인 자리를 존중한다", () => {
    it("맞추는 중에 사용자가 움직이면 맞춤을 멈춘다", () => {
        expect(resolveModeAfterUserScroll({ mode: "anchor", delta: -30, nearBottom: true, isSending: true })).toBe("hold")
        expect(resolveModeAfterUserScroll({ mode: "anchor", delta: 40, nearBottom: false, isSending: true })).toBe("hold")
    })

    it("따라가는 중에 조금이라도 위로 올리면(문턱 안이어도) 멈춘다 — 손가락으로 천천히 끌 때 다시 끌려 내려가지 않게", () => {
        expect(resolveModeAfterUserScroll({ mode: "follow", delta: -12, nearBottom: true, isSending: true })).toBe("hold")
    })

    it("받는 중에 맨 아래 문턱 안으로 내려와도 따라가지 않는다 — 짧게 한 번 내린 것만으로 흐르는 글 끝을 따라가 답 머리가 밀려 나가던 결함", () => {
        expect(resolveModeAfterUserScroll({ mode: "hold", delta: 300, nearBottom: true, isSending: true })).toBe("hold")
        expect(resolveModeAfterUserScroll({ mode: "hold", delta: 24, nearBottom: true, isSending: true })).toBe("hold")
        expect(resolveModeAfterUserScroll({ mode: "anchor", delta: 60, nearBottom: true, isSending: true })).toBe("hold")
        expect(resolveModeAfterUserScroll({ mode: "hold", delta: 300, nearBottom: true, isSending: false })).toBe("hold")
        expect(resolveModeAfterUserScroll({ mode: "hold", delta: 0, nearBottom: true, isSending: true })).toBe("hold")
    })

    it("셸이 켠 따라가기(보낸 뒤 답 머리 전)는 맨 아래에 머무는 동안만 잇는다", () => {
        expect(resolveModeAfterUserScroll({ mode: "follow", delta: 0, nearBottom: true, isSending: true })).toBe("follow")
        expect(resolveModeAfterUserScroll({ mode: "follow", delta: 20, nearBottom: true, isSending: true })).toBe("follow")
        expect(resolveModeAfterUserScroll({ mode: "follow", delta: 20, nearBottom: false, isSending: true })).toBe("hold")
        expect(resolveModeAfterUserScroll({ mode: "follow", delta: 0, nearBottom: true, isSending: false })).toBe("hold")
    })

    it("사용자가 맨 아래로 내린 뒤 긴 답이 계속 흘러도 목록은 그 자리다(흉내)", () => {
        // 질문 머리를 12px 에 맞춘 뒤(hold) 사용자가 맨 아래까지 내렸다. 그 뒤 조각마다 24px 씩 자란다.
        let mode: ReadingScrollMode = "hold"
        let scrollTop = 600
        let scrollHeight = scrollTop + CLIENT + 30
        mode = resolveModeAfterUserScroll({ mode, delta: 380, nearBottom: true, isSending: true })
        const tops: number[] = []
        for (let i = 0; i < 30; i += 1) {
            scrollHeight += 24
            const decision = resolveReadingScroll({ mode, scrollTop, scrollHeight, clientHeight: CLIENT, anchorTop: 12 - scrollTop + 200, isSending: true })
            mode = decision.mode
            if (decision.scrollTop !== null) scrollTop = decision.scrollTop
            tops.push(scrollTop)
        }
        expect(new Set(tops)).toEqual(new Set([600]))
        expect(mode).toBe("hold")
    })
})

describe("resolveReadingRoomMinHeight — 목록 아래 읽을 자리", () => {
    it("맞출 scrollTop 까지 내려갈 수 있게 말풍선 묶음의 최소 높이를 정한다(위아래 여백은 뺀다)", () => {
        // 질문 머리를 12px 에 두려면 scrollTop 209 까지 내려가야 한다: 최소 높이 = 209 + 478 - 32.
        expect(resolveReadingRoomMinHeight({ roomTop: 209, clientHeight: CLIENT, paddingY: 32 })).toBe(209 + CLIENT - 32)
        expect(resolveReadingRoomMinHeight({ roomTop: 208.4, clientHeight: CLIENT, paddingY: 32 })).toBe(655)
    })

    it("맞출 자리가 없거나 목록이 보이지 않으면 최소 높이를 지운다", () => {
        expect(resolveReadingRoomMinHeight({ roomTop: 0, clientHeight: CLIENT, paddingY: 32 })).toBeNull()
        expect(resolveReadingRoomMinHeight({ roomTop: 209, clientHeight: 0, paddingY: 32 })).toBeNull()
        expect(resolveReadingRoomMinHeight({ roomTop: Number.NaN, clientHeight: CLIENT, paddingY: 32 })).toBeNull()
    })

    it("짧은 답: 읽을 자리를 두면 답 머리가 생긴 순간 12px 에 맞고, 끝 meta 가 붙어도 목록이 움직이지 않는다", () => {
        // 앞 내용 끝(질문 머리) 221px, 질문 66px. 읽을 자리 없이는 맞출 자리가 없어 meta 가 붙을 때 209px 미끄러졌다.
        const padY = 32
        const questionY = 221
        const contentBefore = questionY + 66 + 16
        let scrollTop = 0
        const roomTop = scrollTop + (questionY - scrollTop) - ANSWER_SCROLL_TOP_OFFSET_PX
        const minHeight = resolveReadingRoomMinHeight({ roomTop, clientHeight: CLIENT, paddingY: padY }) ?? 0
        const tops: number[] = []
        let mode: ReadingScrollMode = "anchor"
        for (const content of [contentBefore + 24, contentBefore + 48, contentBefore + 48 + 230]) {
            const scrollHeight = Math.max(content, minHeight) + padY
            const decision = resolveReadingScroll({ mode, scrollTop, scrollHeight, clientHeight: CLIENT, anchorTop: questionY - scrollTop, isSending: true })
            mode = decision.mode
            if (decision.scrollTop !== null) scrollTop = decision.scrollTop
            tops.push(questionY - scrollTop)
        }
        expect(tops).toEqual([12, 12, 12])
        expect(mode).toBe("hold")
    })
})

describe("shouldShowContinueHint — 아래에 이어지는 글 표시", () => {
    const base = { hasUserMessages: true, jumpToLatestShown: false, following: false, remainingBelow: 400, lastHeadAboveFold: true }

    it("지금 읽는 답이 아래로 이어지면 보인다", () => {
        expect(shouldShowContinueHint(base)).toBe(true)
    })

    it("맨 아래 문턱 안·'새 답변' 버튼이 뜬 때·따라가는 중·지난 대화를 올려 보는 때·환영만 있을 때는 숨긴다", () => {
        expect(shouldShowContinueHint({ ...base, remainingBelow: CHAT_NEAR_BOTTOM_THRESHOLD_PX })).toBe(false)
        expect(shouldShowContinueHint({ ...base, jumpToLatestShown: true })).toBe(false)
        expect(shouldShowContinueHint({ ...base, following: true })).toBe(false)
        expect(shouldShowContinueHint({ ...base, lastHeadAboveFold: false })).toBe(false)
        expect(shouldShowContinueHint({ ...base, hasUserMessages: false })).toBe(false)
    })
})

describe("resolveReopenScroll — 다시 열 때 자리", () => {
    it("질문이 없으면 환영 말풍선 머리부터(맨 위)", () => {
        expect(resolveReopenScroll({ hasUserMessages: false, saved: { top: 300, signature: "a" }, signature: "a" })).toEqual({ kind: "top" })
    })

    it("대화가 그대로면 읽던 자리로 돌아간다", () => {
        expect(resolveReopenScroll({ hasUserMessages: true, saved: { top: 209, signature: "3:a1:712" }, signature: "3:a1:712" })).toEqual({ kind: "restore", top: 209 })
    })

    it("닫힌 동안 대화가 바뀌었거나 읽던 자리가 없으면 마지막 질문을 맞춘다", () => {
        expect(resolveReopenScroll({ hasUserMessages: true, saved: { top: 209, signature: "3:a1:300" }, signature: "3:a1:712" })).toEqual({ kind: "anchor-last-question" })
        expect(resolveReopenScroll({ hasUserMessages: true, saved: null, signature: "3:a1:712" })).toEqual({ kind: "anchor-last-question" })
    })
})

describe("셸 배선(FloatingChatbot)", () => {
    const shell = readFileSync(join(process.cwd(), "components/ui/FloatingChatbot.tsx"), "utf8")

    it("목록 자리는 reading-scroll 의 판단으로만 정하고, '맨 아래 근처면 따라가기' 상태는 남지 않는다", () => {
        expect(shell).toContain("resolveReadingScroll({")
        expect(shell).toContain("resolveModeAfterUserScroll({")
        expect(shell).toContain("resolveReopenScroll({")
        expect(shell).toContain("resolveReadingRoomMinHeight({")
        expect(shell).not.toMatch(/isAtBottom/)
    })

    it("'새 답변'은 따라가기로 바꾸지 않고 지금 턴의 질문을 맞추며, 되돌리기는 다시 열 때와 같은 자리 규칙을 쓴다", () => {
        const jump = shell.slice(shell.indexOf("const jumpToLatest = () => {"), shell.indexOf("const shouldStickListToBottom"))
        expect(jump).not.toContain('"follow"')
        expect(jump).toContain("latestTurnAnchorId(container)")
        const undo = shell.slice(shell.indexOf("const handleUndoNewChat = () => {"), shell.indexOf("const closeAfterInChatNavigation"))
        expect(undo).toContain("placeListForConversation(")
        expect(undo).not.toContain("container.scrollTop = container.scrollHeight")
    })

    it("기다림 말풍선은 AnimatePresence 밖에 있어 답 말풍선이 생기는 렌더에서 바로 빠진다(질문과 답 사이 빈 자리 92px 가 남지 않게)", () => {
        const list = readFileSync(join(process.cwd(), "components/ui/chatbot/MessageList.tsx"), "utf8")
        const presenceEnd = list.lastIndexOf("</AnimatePresence>")
        expect(presenceEnd).toBeGreaterThan(0)
        expect(list.indexOf("<ThinkingIndicator")).toBeGreaterThan(presenceEnd)
        expect(shell).toContain("<div ref={readingRoomRef} data-chat-reading-room=\"\">")
    })

    it("'아래로 이어서 읽기' 표시는 이름·누름 영역 44px 를 갖고, 입력창은 맞춰 둔 동안 목록을 맨 아래에 붙이지 않는다", () => {
        expect(shell).toContain('aria-label="아래로 이어서 읽기"')
        expect(shell).toMatch(/data-chat-continue-hint[\s\S]{0,600}CHATBOT_HIT_AREA_CLASS/)
        expect(shell).toContain("shouldStickListToBottom={shouldStickListToBottom}")
    })
})
