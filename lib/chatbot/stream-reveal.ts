/**
 * 챗봇 답변을 "말하듯" 흘려 보여주는 속도 계산 — 순수 함수(UI 전용, 답변 로직과 무관).
 *
 * 네트워크 청크는 몰려서 오거나 replace 한 번에 통째로 온다. 받은 그대로 그리면 글자가 툭툭 끊겨
 * 보이므로, 화면에 보이는 길이를 시간에 따라 조금씩 늘린다.
 *  - 어절(띄어쓰기 단위)로 나타난다 — 단어가 중간에 잘린 채 보이지 않는다.
 *  - 문장 끝(. ? ! 등)과 줄바꿈 뒤에서 잠깐 멈춰 말하는 리듬을 만든다.
 *  - 기본 속도는 초당 charsPerSecond 자. 답변 전체가 길면 대략 maxCatchUpSeconds 안에 끝나도록
 *    처음부터 같은 비율로 빨라지고(끝에서 느려지지 않음), 빨라진 만큼 멈춤도 짧아진다.
 *  - 서로게이트 쌍(이모지 등) 중간에서 자르지 않는다.
 * 글자 하나하나를 애니메이션하지 않는다(chatbot-top1pct-redesign §8 "글자별 애니 금지").
 */

import { CHATBOT_MOTION } from "@/lib/chatbot/motion"

export interface StreamRevealPacing {
    /** 기본 흐름 속도(초당 글자 수). */
    charsPerSecond: number
    /** 답변 전체를 대략 이 시간(초) 안에 보여준다 — 긴 답변에서 속도를 올린다. */
    maxCatchUpSeconds: number
    /** 문장 끝 뒤 멈춤(ms). */
    sentencePauseMs: number
    /** 줄바꿈·문단 뒤 멈춤(ms). */
    lineBreakPauseMs: number
    /** 공백이 없는 긴 토큰(URL 등)은 이 길이마다 끊어서 보여준다. */
    maxWordLength: number
    /** 한 번에 보여줄 최대 어절 수 — 시간이 밀려도 여러 어절이 한꺼번에 쏟아지지 않는다. */
    maxWordsPerStep: number
}

export interface RevealAdvance {
    /** 새로 보여줄 길이(현재 이상, text.length 이하). */
    shown: number
    /** 이번에 보여준 끝이 문장·줄 끝이면 다음 진행 전 멈출 시간(ms). */
    pauseMs: number
}

const SENTENCE_END = /[.?!。…~]/

function isHighSurrogate(code: number) {
    return code >= 0xd800 && code <= 0xdbff
}

/** shown 위치에서 다음 어절이 끝나는 위치(뒤따르는 공백 포함). */
function nextWordEnd(text: string, from: number, maxWordLength: number): number {
    let index = from
    // 앞쪽 공백은 그대로 붙여서 보여준다.
    while (index < text.length && /\s/.test(text[index]) && text[index] !== "\n") index += 1
    if (index < text.length && text[index] === "\n") {
        while (index < text.length && text[index] === "\n") index += 1
        return index
    }
    const wordStart = index
    while (index < text.length && !/\s/.test(text[index])) {
        index += 1
        if (index - wordStart >= maxWordLength) break
    }
    // 단어 뒤 공백 하나까지 함께(줄바꿈은 다음 단계에서 멈춤과 함께 처리)
    if (index < text.length && text[index] === " ") index += 1
    if (index < text.length && isHighSurrogate(text.charCodeAt(index - 1))) index += 1
    return Math.min(index, text.length)
}

function pauseAfter(text: string, end: number, pacing: StreamRevealPacing): number {
    if (end <= 0) return 0
    const before = text.slice(0, end).replace(/ +$/, "")
    if (before.endsWith("\n")) return pacing.lineBreakPauseMs
    const last = before.slice(-1)
    if (SENTENCE_END.test(last)) return pacing.sentencePauseMs
    return 0
}

/**
 * elapsedMs 동안 쌓인 시간만큼 어절 단위로 앞으로 나아간다. 다음 어절을 보여줄 만큼 시간이 안 쌓였으면
 * shown 그대로(호출 쪽이 시간을 계속 쌓는다). 문장·줄 끝에 닿으면 거기서 멈추고 pauseMs 를 돌려준다.
 */
export function advanceReveal(
    text: string,
    current: number,
    elapsedMs: number,
    pacing: StreamRevealPacing = CHATBOT_MOTION.streamReveal
): RevealAdvance {
    const target = text.length
    let shown = Math.max(0, Math.min(current, target))
    if (shown >= target) return { shown: target, pauseMs: 0 }

    const charsPerSecond = Math.max(pacing.charsPerSecond, target / pacing.maxCatchUpSeconds)
    const speedUp = charsPerSecond / pacing.charsPerSecond
    let budget = (Math.max(0, elapsedMs) / 1000) * charsPerSecond
    let words = 0

    while (shown < target && words < pacing.maxWordsPerStep) {
        const end = nextWordEnd(text, shown, pacing.maxWordLength)
        const cost = end - shown
        if (cost > budget) break
        budget -= cost
        shown = end
        words += 1
        const pause = pauseAfter(text, shown, pacing)
        if (pause > 0 && shown < target) {
            return { shown, pauseMs: Math.round(pause / speedUp) }
        }
    }
    return { shown, pauseMs: 0 }
}

/** 새 텍스트가 지금까지 보여준 앞부분을 그대로 잇는지 — 아니면 답변이 다시 쓰인 것(크로스페이드 대상). */
export function continuesShownText(previous: string, next: string, shownLength: number): boolean {
    return next.startsWith(previous.slice(0, Math.max(0, shownLength)))
}
