// 챗봇 위젯 모듈 여럿이 함께 쓰는 상수와 진입 모션 variants.
import { CHATBOT_MOTION, m } from "@/lib/chatbot/motion"

export const STARTER_SUGGESTION_LIMIT = 4
export const FOLLOW_UP_SUGGESTION_LIMIT = 3

export const EASING_SOFT_ENTER = [0.22, 1, 0.36, 1] as const

export const DEEP_CONSULTATION_ICON_SRC = "/images/chatbot/ai-deep-consultation.webp"

// 다이얼로그 및 자식 요소들의 Staggered 진입 Variants
export const containerVariants = {
    initial: {
        opacity: 0,
        y: 16,
        scale: 0.93,
        filter: "blur(6px)",
    },
    animate: (shouldReduceMotion: boolean | null) => ({
        opacity: 1,
        y: 0,
        scale: 1,
        filter: "blur(0px)",
        transition: m({
            ...CHATBOT_MOTION.surfaceSpring,
            staggerChildren: 0.04,
            delayChildren: 0.03,
        }, shouldReduceMotion),
    }),
    exit: (shouldReduceMotion: boolean | null) => ({
        opacity: 0,
        y: 12,
        scale: 0.95,
        filter: "blur(6px)",
        transition: m(CHATBOT_MOTION.exit, shouldReduceMotion),
    }),
}

export const itemVariants = {
    initial: { opacity: 0, y: 10 },
    animate: (shouldReduceMotion: boolean | null) => ({
        opacity: 1,
        y: 0,
        transition: m(CHATBOT_MOTION.enter, shouldReduceMotion),
    }),
    exit: (shouldReduceMotion: boolean | null) => ({
        opacity: 0,
        y: -6,
        transition: m(CHATBOT_MOTION.exit, shouldReduceMotion),
    }),
}
