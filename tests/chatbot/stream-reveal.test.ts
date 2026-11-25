import { describe, expect, it } from "vitest"

import { CHATBOT_MOTION } from "@/lib/chatbot/motion"
import { advanceReveal, continuesShownText } from "@/lib/chatbot/stream-reveal"

const pacing = CHATBOT_MOTION.streamReveal
const FRAME_MS = 1000 / 60

/** 60fps 로 흘렸을 때 걸리는 시간(ms)과 보여준 길이 순서. */
function simulate(text: string) {
    let shown = 0
    let elapsed = 0
    let accumulated = 0
    let pausedUntil = 0
    const lengths: number[] = []
    const pauses: number[] = []
    while (shown < text.length) {
        elapsed += FRAME_MS
        if (elapsed < pausedUntil) continue
        accumulated += FRAME_MS
        const step = advanceReveal(text, shown, accumulated)
        expect(step.shown).toBeGreaterThanOrEqual(shown)
        expect(step.shown).toBeLessThanOrEqual(text.length)
        if (step.shown > shown) {
            shown = step.shown
            lengths.push(shown)
            accumulated = 0
            if (step.pauseMs > 0) {
                pauses.push(step.pauseMs)
                pausedUntil = elapsed + step.pauseMs
            }
        }
        if (elapsed > 60_000) throw new Error("did not converge")
    }
    return { elapsed, lengths, pauses }
}

describe("advanceReveal", () => {
    it("reveals whole words, never cutting a Korean word in half", () => {
        const text = "도입 상담은 담당자가 운영 방식과 인원을 확인한 뒤 안내드려요."
        const { lengths } = simulate(text)
        for (const length of lengths) {
            const cut = text.slice(0, length)
            // 끝이 공백, 문장 부호, 혹은 텍스트 끝이어야 한다(단어 중간에서 끊기지 않음)
            expect(length === text.length || /\s$/.test(cut)).toBe(true)
        }
        expect(lengths.length).toBeGreaterThan(5)
    })

    it("waits until enough time has passed for the next word", () => {
        const text = "안녕하세요 반갑습니다"
        expect(advanceReveal(text, 0, 1).shown).toBe(0)
        expect(advanceReveal(text, 0, 1000).shown).toBe(text.length)
    })

    it("pauses briefly after a sentence and longer after a line break", () => {
        const text = "첫 문장입니다. 둘째 문장이에요\n\n다음 문단입니다."
        const first = advanceReveal(text, 0, 10_000)
        expect(text.slice(0, first.shown)).toBe("첫 문장입니다. ")
        expect(first.pauseMs).toBeGreaterThan(0)
        const second = advanceReveal(text, first.shown, 10_000)
        expect(text.slice(0, second.shown)).toBe("첫 문장입니다. 둘째 문장이에요\n\n")
        expect(second.pauseMs).toBeGreaterThan(first.pauseMs)
    })

    it("speaks a typical answer over a few seconds and caps long answers", () => {
        const typical = "네, 담당자 상담으로 이어 드릴게요. 아래 버튼으로 연락받을 방법을 남기시면 담당자가 연락드립니다. ".repeat(2)
        const long = "전자칠판 설치와 수업 운영 방법을 순서대로 안내드립니다. ".repeat(40)
        const t = simulate(typical).elapsed
        const l = simulate(long).elapsed
        expect(t).toBeGreaterThan(1000)
        expect(t).toBeLessThan(4500)
        expect(l).toBeLessThan((pacing.maxCatchUpSeconds + 2) * 1000)
    })

    it("splits very long tokens like URLs and keeps surrogate pairs whole", () => {
        const url = "https://classin.kr/docs/" + "a".repeat(60)
        const { lengths } = simulate(url)
        expect(lengths.length).toBeGreaterThan(3)
        const emoji = "좋아요😀😀😀😀😀😀😀😀😀😀 감사합니다"
        for (const length of simulate(emoji).lengths) {
            const code = emoji.charCodeAt(length - 1)
            expect(code >= 0xd800 && code <= 0xdbff).toBe(false)
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
        expect(continuesShownText("도입 상담 안내", "도입 상담 절차", 5)).toBe(true)
    })
})

describe("advanceReveal limits", () => {
    it("never shows more than a few words at once, even after a long wait", () => {
        const text = "하나 둘 셋 넷 다섯 여섯 일곱 여덟 아홉 열"
        const step = advanceReveal(text, 0, 60_000)
        expect(text.slice(0, step.shown).trim().split(/\s+/).length).toBeLessThanOrEqual(pacing.maxWordsPerStep)
    })

    it("still reveals a word longer than one frame's worth of time", () => {
        const text = "(/contact)나 쇼룸 예약(/showroom)에서도 바로 신청할 수 있어요."
        expect(advanceReveal(text, 0, 1000).shown).toBeGreaterThan(0)
        const { lengths } = simulate(text)
        expect(lengths[lengths.length - 1]).toBe(text.length)
    })
})
