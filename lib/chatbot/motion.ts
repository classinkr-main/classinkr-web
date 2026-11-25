/**
 * Classin Chatbot Motion Tokens SSOT
 * Based on chatbot-top1pct-redesign-2026-06-24.md & DESIGN.md
 */

export const CHATBOT_EASING = {
    softEnter: [0.22, 1, 0.36, 1] as [number, number, number, number], // cubic-bezier(0.22, 1, 0.36, 1)
    sharpExit: [0.4, 0, 1, 1] as [number, number, number, number],   // cubic-bezier(0.4, 0, 1, 1)
} as const

export const CHATBOT_MOTION = {
    // 다이얼로그 진입 및 주 진입 모션
    enter: {
        duration: 0.26,
        ease: CHATBOT_EASING.softEnter,
    },
    // 다이얼로그 퇴출
    exit: {
        duration: 0.16,
        ease: CHATBOT_EASING.sharpExit,
    },
    // 다이얼로그 표면 스프링 피드백 (Linear / Apple 스타일의 탄력적이고 빠른 안착)
    surfaceSpring: {
        type: "spring" as const,
        stiffness: 340,
        damping: 28,
        mass: 0.85,
    },
    // 미세 인터랙션 (호버, 전환 등)
    micro: {
        duration: 0.12,
        ease: "easeOut" as const,
    },
    // 탭 클릭 리듀스 스케일
    tap: {
        scale: 0.97,
    },
    // 토큰 페이드인 (글자별 애니 대신 부드러운 덩어리 페이드)
    tokenFade: {
        duration: 0.14,
        ease: "easeOut" as const,
    },
    // 로딩 쉬머 물결 애니메이션 (로딩 상태 한정 반복)
    shimmer: {
        duration: 1.8,
        repeat: Infinity,
        ease: "easeInOut" as const,
    },
    // 말풍선 등장 스프링 — 내 질문은 입력창(오른쪽 아래)에서 튀어 오르듯, 답변은 부드럽게 떠오른다.
    bubbleSpring: {
        type: "spring" as const,
        stiffness: 420,
        damping: 32,
        mass: 0.8,
    },
    // 답변이 말하듯 흐르는 속도(lib/chatbot/stream-reveal.ts): 어절 단위, 문장 끝에서 잠깐 멈춤,
    // 긴 답변은 전체가 대략 2.5초(+짧은 멈춤) 안에 끝나도록 처음부터 빨라진다.
    streamReveal: {
        charsPerSecond: 70,
        maxCatchUpSeconds: 2.5,
        sentencePauseMs: 150,
        lineBreakPauseMs: 230,
        maxWordLength: 14,
        maxWordsPerStep: 3,
    },
    // 답변이 통째로 다시 쓰일 때(preview→final replace) 크로스페이드
    rewriteFade: {
        duration: 0.18,
        ease: "easeOut" as const,
    },
    // 답변이 다 흐른 뒤 출처·추천 질문·버튼이 떠오르는 순서
    settle: {
        duration: 0.32,
        ease: CHATBOT_EASING.softEnter,
        stagger: 0.07,
    },
    // 생각 중 문구 단계 전환 시점(초). 마지막 단계에서 멈춘다(무한 순환 없음).
    thinkingSteps: [0, 1.4, 3.2] as number[],
} as const

/**
 * reducedMotion 활성화 여부에 따라 모션 스펙을 제어하거나 무효화(즉시 0.01초 만에 렌더링)하는 단일 헬퍼 함수 m().
 * 윈도우 접근성(동작 줄이기) 설정을 일관성 있게 존중하고 누락을 막습니다.
 */
export function m<T>(motionSpec: T, shouldReduceMotion: boolean | null): T | { duration: number; type?: never; stiffness?: never; damping?: never; mass?: never; ease?: never } {
    if (shouldReduceMotion) {
        return { duration: 0.01 }
    }
    return motionSpec
}
