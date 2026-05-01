"use client"

import { useState, useEffect } from "react"
import { usePathname } from "next/navigation"
import { motion, AnimatePresence } from "framer-motion"
import Link from "next/link"
import { MessageSquare, X } from "lucide-react"

import { isPartnerPortalPath } from "@/lib/partner-portal/pathname"

export function MobileFloatingCTA() {
    const pathname = usePathname()
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

    if (
        pathname.startsWith("/admin") ||
        pathname.startsWith("/checkout") ||
        pathname.startsWith("/contact") ||
        pathname.startsWith("/partner") ||
        pathname.startsWith("/pricing") ||
        pathname.startsWith("/receipt") ||
        isPartnerPortalPath(pathname)
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
                            <span className="absolute inset-0 animate-ping rounded-full bg-primary opacity-20" />

                            <motion.div
                                animate={{ y: [0, -4, 0] }}
                                transition={{
                                    repeat: Infinity,
                                    duration: 2.8,
                                    ease: "easeInOut",
                                }}
                                className="w-full"
                            >
                                <Link
                                    href="/contact"
                                    className="flex w-full items-center justify-center gap-2 rounded-full bg-primary px-5 py-3 text-sm font-bold text-white shadow-[0_8px_24px_rgba(16,185,129,0.35)] transition-all duration-200 hover:bg-primary/90 active:scale-95"
                                >
                                    <MessageSquare className="h-4 w-4 shrink-0" />
                                    도입 문의하기
                                </Link>
                            </motion.div>

                            <button
                                onClick={() => setDismissed(true)}
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
