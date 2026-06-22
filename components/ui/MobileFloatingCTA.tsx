"use client"

import { useState, useEffect, useRef } from "react"
import { usePathname } from "next/navigation"
import { motion, AnimatePresence, useReducedMotion } from "framer-motion"
import { MessageSquare, X } from "lucide-react"
import { TrackedLink } from "@/components/TrackedLink"

export function MobileFloatingCTA() {
    const pathname = usePathname()
    const shouldReduceMotion = useReducedMotion()
    const [visible, setVisible] = useState(false)
    const [dismissed, setDismissed] = useState(false)
    const visibleRef = useRef(false)

    useEffect(() => {
        // 아래로 스크롤(콘텐츠 읽는 중)에는 숨기고, 위로 스크롤할 때만 표시 —
        // 챗봇 버블과 함께 하단을 점유해 콘텐츠를 가리는 혼잡을 줄인다
        let lastY = window.scrollY
        let frame = 0

        const updateVisible = (nextVisible: boolean) => {
            if (visibleRef.current === nextVisible) return
            visibleRef.current = nextVisible
            setVisible(nextVisible)
        }

        const handleScroll = () => {
            if (frame) return
            frame = window.requestAnimationFrame(() => {
                frame = 0
                const currentY = window.scrollY
                const scrollingUp = currentY < lastY - 4
                const scrollingDown = currentY > lastY + 4
                lastY = currentY

                if (currentY <= 300) {
                    updateVisible(false)
                } else if (scrollingUp && !dismissed) {
                    updateVisible(true)
                } else if (scrollingDown) {
                    updateVisible(false)
                }
            })
        }

        window.addEventListener("scroll", handleScroll, { passive: true })
        return () => {
            window.removeEventListener("scroll", handleScroll)
            if (frame) window.cancelAnimationFrame(frame)
        }
    }, [dismissed])

    if (
        pathname.startsWith("/admin") ||
        pathname.startsWith("/checkout") ||
        pathname.startsWith("/contact") ||
        pathname.startsWith("/pricing") ||
        pathname.startsWith("/receipt")
    ) {
        return null
    }

    return (
        <div className="md:hidden">
            <AnimatePresence>
                {visible && !dismissed && (
                    <motion.div
                        initial={{ y: 80, opacity: 0 }}
                        animate={{ y: 0, opacity: 1 }}
                        exit={{ y: 80, opacity: 0 }}
                        transition={{ type: "spring", stiffness: 320, damping: 28 }}
                        className="fixed bottom-[calc(env(safe-area-inset-bottom)+1rem)] left-1/2 z-40 w-[calc(100vw-2rem)] max-w-sm -translate-x-1/2"
                    >
                        <div className="relative flex items-center justify-center">
                            {!shouldReduceMotion ? (
                                <span className="absolute inset-0 animate-ping rounded-full bg-primary opacity-20" />
                            ) : null}

                            <motion.div
                                animate={shouldReduceMotion ? undefined : { y: [0, -4, 0] }}
                                transition={
                                    shouldReduceMotion
                                        ? undefined
                                        : {
                                            repeat: Infinity,
                                            duration: 2.8,
                                            ease: "easeInOut",
                                        }
                                }
                                className="w-full"
                            >
                                <TrackedLink
                                    href="/contact"
                                    ctaId="mobile_floating_contact"
                                    className="flex w-full items-center justify-center gap-2 rounded-full bg-primary px-5 py-3 text-sm font-bold text-white shadow-[0_8px_24px_rgba(16,185,129,0.35)] transition-all duration-200 hover:bg-primary/90 active:scale-95"
                                >
                                    <MessageSquare className="h-4 w-4 shrink-0" />
                                    도입 문의하기
                                </TrackedLink>
                            </motion.div>

                            <button
                                onClick={() => {
                                    visibleRef.current = false
                                    setVisible(false)
                                    setDismissed(true)
                                }}
                                className="absolute right-1 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-white/20 transition-colors hover:bg-white/30"
                                aria-label="닫기"
                            >
                                <X className="h-4 w-4 text-white" />
                            </button>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    )
}
