"use client"

import { motion, useReducedMotion } from "framer-motion"
import { X } from "lucide-react"
import { CHATBOT_MOTION, m } from "@/lib/chatbot/motion"

export function ChatbotTeaser({
    text,
    onOpen,
    onDismiss,
}: {
    text: string
    onOpen: () => void
    onDismiss: () => void
}) {
    const shouldReduceMotion = useReducedMotion()
    if (!text) return null

    return (
        <motion.div
            initial={m({ opacity: 0, y: 8 }, shouldReduceMotion)}
            animate={m({ opacity: 1, y: 0 }, shouldReduceMotion)}
            exit={m({ opacity: 0, y: 6 }, shouldReduceMotion)}
            transition={m(CHATBOT_MOTION.micro, shouldReduceMotion)}
            className="mb-3 flex max-w-[244px] items-center gap-2 rounded-[14px] border border-black/[0.08] bg-white/90 px-3 py-2.5 shadow-[0_10px_24px_rgba(49,48,46,0.10)] backdrop-blur-xl"
        >
            <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[#084734]" aria-hidden />
            <button
                type="button"
                onClick={onOpen}
                className="flex-1 rounded-[8px] text-left text-[12.5px] font-medium leading-snug text-[#3B3835] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#084734]/25"
            >
                {text}
            </button>
            <button
                type="button"
                onClick={onDismiss}
                aria-label="알림 닫기"
                className="shrink-0 text-[#A39E98] transition-colors hover:text-[#615D59] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#084734]/25"
            >
                <X className="h-3.5 w-3.5" />
            </button>
        </motion.div>
    )
}
