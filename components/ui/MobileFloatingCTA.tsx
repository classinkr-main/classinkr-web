"use client"

import { useState, useEffect } from "react"
import { motion, AnimatePresence } from "framer-motion"
import Link from "next/link"
import { MessageSquare, X } from "lucide-react"

export function MobileFloatingCTA() {
    const [visible, setVisible] = useState(false)
    const [dismissed, setDismissed] = useState(false)

    useEffect(() => {
        const handleScroll = () => {
            if (!dismissed && window.scrollY > 300) {
                setVisible(true)
            } else if (window.scrollY <= 300) {
                setVisible(false)
            }
        }

        window.addEventListener("scroll", handleScroll, { passive: true })
        return () => window.removeEventListener("scroll", handleScroll)
    }, [dismissed])

    return (
        // md 이상에서는 숨김 — 모바일 전용
        <div className="md:hidden">
            <AnimatePresence>
                {visible && !dismissed && (
                    <motion.div
                        initial={{ y: 80, opacity: 0 }}
                        animate={{ y: 0, opacity: 1 }}
                        exit={{ y: 80, opacity: 0 }}
                        transition={{ type: "spring", stiffness: 320, damping: 28 }}
                        className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40"
                    >
                        <div className="relative flex items-center">
                            {/* 펄스 링 */}
                            <span className="absolute inset-0 rounded-full bg-primary opacity-20 animate-ping" />

                            {/* CTA 버튼 */}
                            <motion.div
                                animate={{ y: [0, -4, 0] }}
                                transition={{
                                    repeat: Infinity,
                                    duration: 2.8,
                                    ease: "easeInOut",
                                }}
                            >
                                <Link href="/contact">
                                    <button className="flex items-center gap-2 bg-primary hover:bg-primary/90 active:scale-95 text-white pl-4 pr-10 py-3 rounded-full shadow-[0_8px_24px_rgba(16,185,129,0.35)] text-sm font-bold transition-all duration-200">
                                        <MessageSquare className="w-4 h-4 shrink-0" />
                                        도입 문의하기
                                    </button>
                                </Link>
                            </motion.div>

                            {/* 닫기 버튼 */}
                            <button
                                onClick={() => setDismissed(true)}
                                className="absolute right-1.5 top-1/2 -translate-y-1/2 w-6 h-6 flex items-center justify-center rounded-full bg-white/20 hover:bg-white/30 transition-colors"
                                aria-label="닫기"
                            >
                                <X className="w-3 h-3 text-white" />
                            </button>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    )
}
