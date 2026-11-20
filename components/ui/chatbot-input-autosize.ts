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
