/**
 * 챗봇 대화창 안 링크(출처 가이드·문의폼)를 눌렀을 때 대화창을 닫을지 판정한다. DOM 을 만지지 않는 순수 계산만 둔다.
 *
 * - 휴대폰(< 48rem)에서는 대화창과 딤이 화면을 덮어 이동한 페이지가 보이지 않으므로 닫는다.
 *   데스크톱(≥ 48rem)은 대화창이 옆에 떠 있어 목적지를 가리지 않으니 지금처럼 열어 둔다.
 * - 새 탭 열기(⌘·Ctrl·Shift·Alt 조합, 가운데·오른쪽 클릭)는 이 페이지가 바뀌지 않으니 닫지 않는다.
 * - 다른 처리가 이동을 막았으면(defaultPrevented, 예: 요약 보관 실패) 닫지 않는다.
 * - React MouseEvent 가 그대로 들어오도록 구조 타입으로 받는다.
 */

// DESIGN.md 5-C '모바일 < 48rem' 과 Tailwind `md:` 경계가 같다.
export const CHATBOT_DESKTOP_MEDIA_QUERY = "(min-width: 48rem)"

export type ChatLinkClick = {
    button: number
    metaKey: boolean
    ctrlKey: boolean
    shiftKey: boolean
    altKey: boolean
    defaultPrevented: boolean
}

export function shouldCloseChatbotAfterLinkClick(click: ChatLinkClick, isDesktop: boolean): boolean {
    if (isDesktop) return false
    if (click.button !== 0) return false
    if (click.metaKey || click.ctrlKey || click.shiftKey || click.altKey) return false
    return !click.defaultPrevented
}
