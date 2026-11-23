/**
 * 챗봇 입력창 높이·대화 목록 맨 아래 판정. DOM 을 직접 만지지 않는 순수 계산만 둔다.
 *
 * - 입력창은 한 줄(44px, min-h-11)에서 시작해 내용에 맞춰 늘고, 112px(max-h-28)에서 멈춘 뒤
 *   안쪽 스크롤로 바뀐다. 공개 화면 보증(site-base.css ②)으로 글자 16px·leading-6 이라
 *   한 줄이 24px, 위아래 여백 20px 이다(1줄 44 · 2줄 68 · 3줄 92 · 4줄부터 112).
 * - 한계는 호출하는 쪽이 computed min/max-height 를 넘겨 CSS 와 같게 맞춘다(글꼴 확대 상태 포함).
 *   값이 깨져 있으면(NaN·0 이하) 기본값을 쓴다.
 */

export const CHAT_INPUT_MIN_HEIGHT_PX = 44
export const CHAT_INPUT_MAX_HEIGHT_PX = 112
export const CHAT_NEAR_BOTTOM_THRESHOLD_PX = 45

export type ChatInputHeight = {
    height: number
    overflowY: "hidden" | "auto"
}

function isUsableLength(value: number): boolean {
    return Number.isFinite(value) && value > 0
}

export function resolveChatInputHeight(
    scrollHeight: number,
    minHeight: number = CHAT_INPUT_MIN_HEIGHT_PX,
    maxHeight: number = CHAT_INPUT_MAX_HEIGHT_PX,
): ChatInputHeight {
    const min = isUsableLength(minHeight) ? minHeight : CHAT_INPUT_MIN_HEIGHT_PX
    const max = isUsableLength(maxHeight) ? maxHeight : CHAT_INPUT_MAX_HEIGHT_PX

    if (!isUsableLength(scrollHeight)) {
        return { height: min, overflowY: "hidden" }
    }

    const height = Math.min(Math.max(Math.ceil(scrollHeight), min), max)
    return { height, overflowY: scrollHeight > max ? "auto" : "hidden" }
}

export type ScrollMetrics = {
    scrollHeight: number
    scrollTop: number
    clientHeight: number
}

export function isNearBottom(
    metrics: ScrollMetrics,
    threshold: number = CHAT_NEAR_BOTTOM_THRESHOLD_PX,
): boolean {
    return metrics.scrollHeight - metrics.scrollTop - metrics.clientHeight <= threshold
}

export type ListScrollAfterInputResize = {
    /** 입력창 높이가 바뀌었는지 */
    heightChanged: boolean
    /** 높이를 재기 전에 대화 목록이 맨 아래 근처였는지 */
    wasNearBottom: boolean
    /** 높이를 재기 전 목록 scrollTop */
    prevScrollTop: number
    /** 높이를 다시 정한 뒤 목록 scrollTop */
    scrollTop: number
    /** 높이를 다시 정한 뒤 목록 scrollHeight */
    scrollHeight: number
}

/**
 * 입력창 높이를 다시 정한 뒤 대화 목록 scrollTop 을 어디에 둘지 정한다. null 이면 건드리지 않는다.
 *
 * 높이를 재려고 입력창을 잠깐 auto(한 줄)로 줄이면 목록이 그만큼 커지고, 브라우저가 scrollTop 을 그때의
 * 최댓값으로 깎는다. Chromium·Firefox 는 스크롤 앵커링이 높이를 되돌릴 때 이를 되돌리지만, 앵커링이 없는
 * Safari 는 깎인 값이 남는다. 그래서 높이가 그대로여도(여러 줄에서 글자만 칠 때) 목록이 (높이 − 44)px 위로
 * 밀린다. 높이가 바뀌었고 맨 아래를 보고 있었으면 맨 아래로, 그 밖에 재는 동안 위치가 바뀌었으면 원래대로 둔다.
 */
export function resolveListScrollTopAfterInputResize(state: ListScrollAfterInputResize): number | null {
    if (state.heightChanged && state.wasNearBottom) return state.scrollHeight
    if (state.scrollTop !== state.prevScrollTop) return state.prevScrollTop
    return null
}
