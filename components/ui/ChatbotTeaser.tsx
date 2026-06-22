"use client"

import { motion, useReducedMotion } from "framer-motion"
import { X } from "lucide-react"

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
            initial={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, y: 8 }}
            animate={shouldReduceMotion ? { opacity: 1 } : { opacity: 1, y: 0 }}
            exit={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, y: 6 }}
            transition={{ duration: shouldReduceMotion ? 0.01 : 0.22, ease: "easeOut" }}
            className="mb-3 flex max-w-[244px] items-center gap-2 rounded-[14px] border border-black/[0.08] bg-white/90 px-3 py-2.5 shadow-[0_10px_24px_rgba(49,48,46,0.10)] backdrop-blur-xl"
        >
            <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[#084734]" aria-hidden />
            <button
                type="button"
                onClick={onOpen}
                className="flex-1 text-left text-[12.5px] font-medium leading-snug text-[#3B3835] focus-visible:outline-none"
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
