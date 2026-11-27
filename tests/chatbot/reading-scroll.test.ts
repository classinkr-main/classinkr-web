import { readFileSync } from "node:fs"
import { join } from "node:path"

import { describe, expect, it } from "vitest"

import { CHAT_NEAR_BOTTOM_THRESHOLD_PX } from "@/components/ui/chatbot-input-autosize"
import {
    ANSWER_SCROLL_TOP_OFFSET_PX,
    pickAnchorTarget,
    resolveModeAfterUserScroll,
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

    it("받는 중에 스스로 맨 아래까지 내려오면 따라간다. 다 받은 뒤에는 따라가지 않는다", () => {
        expect(resolveModeAfterUserScroll({ mode: "hold", delta: 300, nearBottom: true, isSending: true })).toBe("follow")
        expect(resolveModeAfterUserScroll({ mode: "follow", delta: 0, nearBottom: true, isSending: true })).toBe("follow")
        expect(resolveModeAfterUserScroll({ mode: "hold", delta: 300, nearBottom: true, isSending: false })).toBe("hold")
        expect(resolveModeAfterUserScroll({ mode: "hold", delta: 0, nearBottom: true, isSending: true })).toBe("hold")
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
        expect(shell).not.toMatch(/isAtBottom/)
    })

    it("'아래로 이어서 읽기' 표시는 이름·누름 영역 44px 를 갖고, 입력창은 맞춰 둔 동안 목록을 맨 아래에 붙이지 않는다", () => {
        expect(shell).toContain('aria-label="아래로 이어서 읽기"')
        expect(shell).toMatch(/data-chat-continue-hint[\s\S]{0,600}CHATBOT_HIT_AREA_CLASS/)
        expect(shell).toContain("shouldStickListToBottom={shouldStickListToBottom}")
    })
})
