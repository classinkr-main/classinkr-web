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
    // 다이얼로그 표면 스프링 피드백
    surfaceSpring: {
        type: "spring" as const,
        stiffness: 380,
        damping: 32,
        mass: 0.9,
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
    // 외곽 링 펄스 등 주변 앰비언트 모션
    ambient: {
        scale: [0.96, 1.22] as number[],
        opacity: [0.38, 0] as number[],
        duration: 3.8,
        repeatDelay: 1.2,
    }
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
