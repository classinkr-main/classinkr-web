import { describe, expect, it } from "vitest"

import { CHATBOT_MOTION } from "@/lib/chatbot/motion"
import { continuesShownText, nextRevealLength } from "@/lib/chatbot/stream-reveal"

function framesToReveal(text: string, streaming: boolean) {
    let shown = 0
    let frames = 0
    while (shown < text.length) {
        const next = nextRevealLength(text, shown, streaming)
        expect(next).toBeGreaterThan(shown)
        expect(next).toBeLessThanOrEqual(text.length)
        shown = next
        frames += 1
        if (frames > 10_000) throw new Error("did not converge")
    }
    return frames
}

describe("nextRevealLength", () => {
    const pacing = CHATBOT_MOTION.streamReveal

    it("moves forward within the per-frame limits and never past the text", () => {
        const text = "가".repeat(1000)
        const first = nextRevealLength(text, 0, true)
        expect(first).toBe(pacing.maxCharsPerFrame)
        expect(nextRevealLength(text, 998, true)).toBe(1000)
        expect(nextRevealLength(text, 1000, true)).toBe(1000)
        expect(nextRevealLength(text, 5000, true)).toBe(1000)
    })

    it("reveals at least the minimum per frame when little is left", () => {
        const text = "안녕하세요 반갑습니다"
        expect(nextRevealLength(text, 0, true)).toBe(pacing.minCharsPerFrame)
    })

    it("finishes a typical answer in about a second and flushes faster once the stream ends", () => {
        const answer = "Classin 도입 상담은 담당자가 운영 방식과 인원을 확인한 뒤 맞는 구성을 안내드려요. ".repeat(8)
        const streamingFrames = framesToReveal(answer, true)
        const flushFrames = framesToReveal(answer, false)
        expect(streamingFrames).toBeLessThan(90) // ~1.5s at 60fps
        expect(flushFrames).toBeLessThan(streamingFrames)
    })

    it("does not cut a surrogate pair in half", () => {
        const text = "a😀b😀c😀d😀e😀f"
        let shown = 0
        while (shown < text.length) {
            shown = nextRevealLength(text, shown, true, { ...pacing, minCharsPerFrame: 1, maxCharsPerFrame: 1 })
            const last = text.charCodeAt(shown - 1)
            expect(last >= 0xd800 && last <= 0xdbff).toBe(false)
        }
    })
})

describe("continuesShownText", () => {
    it("treats appended deltas as a continuation", () => {
        expect(continuesShownText("도입 상담", "도입 상담을 받고", 5)).toBe(true)
        expect(continuesShownText("", "아무 텍스트", 0)).toBe(true)
    })

    it("detects a rewritten answer that changes what is already on screen", () => {
        expect(continuesShownText("임시 답변입니다", "최종 답변입니다", 4)).toBe(false)
    })

    it("only compares the part that is already visible", () => {
        // 아직 화면에 안 나온 꼬리가 바뀌는 건 크로스페이드 없이 이어서 흘린다.
        expect(continuesShownText("도입 상담 안내", "도입 상담 절차", 5)).toBe(true)
    })
})
