/**
 * 챗봇 스트리밍 답변을 화면에 "흘려" 보여주는 속도 계산 — 순수 함수(UI 전용, 답변 로직과 무관).
 *
 * 네트워크 청크는 몰려서 오거나 replace 한 번에 통째로 온다. 받은 그대로 그리면 글자가 툭툭 끊겨
 * 보이므로, 화면에 보이는 길이를 프레임마다 목표 길이 쪽으로 조금씩 따라가게 한다.
 *  - 밀린 글자(backlog)가 많을수록 빠르게, 적을수록 천천히(최소·최대 프레임당 글자 수 안에서).
 *  - 스트림이 끝났으면(flush) 더 빠른 비율로 남은 글자를 마저 보여준다.
 *  - 서로게이트 쌍(이모지 등) 중간에서 자르지 않는다.
 * 글자 하나하나를 애니메이션하지 않는다(chatbot-top1pct-redesign §8 "글자별 애니 금지").
 */

import { CHATBOT_MOTION } from "@/lib/chatbot/motion"

export interface StreamRevealPacing {
    minCharsPerFrame: number
    maxCharsPerFrame: number
    /** 스트리밍 중 backlog 대비 프레임당 따라잡는 비율. */
    followRate: number
    /** 스트림 종료 후 남은 글자를 비우는 비율. */
    flushRate: number
}

function isHighSurrogate(code: number) {
    return code >= 0xd800 && code <= 0xdbff
}

/** 다음 프레임에 보여줄 글자 수. 항상 current 이상, text.length 이하. */
export function nextRevealLength(
    text: string,
    current: number,
    streaming: boolean,
    pacing: StreamRevealPacing = CHATBOT_MOTION.streamReveal
): number {
    const target = text.length
    const shown = Math.max(0, Math.min(current, target))
    const backlog = target - shown
    if (backlog <= 0) return target

    const rate = streaming ? pacing.followRate : pacing.flushRate
    const step = Math.min(
        pacing.maxCharsPerFrame,
        Math.max(pacing.minCharsPerFrame, Math.ceil(backlog * rate))
    )
    let next = Math.min(target, shown + step)
    if (next < target && isHighSurrogate(text.charCodeAt(next - 1))) next += 1
    return next
}

/** 새 텍스트가 지금까지 보여준 앞부분을 그대로 잇는지 — 아니면 답변이 다시 쓰인 것(크로스페이드 대상). */
export function continuesShownText(previous: string, next: string, shownLength: number): boolean {
    return next.startsWith(previous.slice(0, Math.max(0, shownLength)))
}
