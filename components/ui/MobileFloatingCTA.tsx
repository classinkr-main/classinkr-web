"use client"

import { useState, useEffect, useRef } from "react"
import { usePathname } from "next/navigation"
import { motion, AnimatePresence, useReducedMotion } from "framer-motion"
import { MapPin, MessageSquare } from "lucide-react"
import { TrackedLink } from "@/components/TrackedLink"

/**
 * 제품 상세를 보고 있는 사람은 이미 "무엇인지"를 지나 "실물을 보고 판단하는" 단계다.
 * 그 구간에서만 쇼룸 예약으로 보내고, 나머지 경로는 기존 문의를 유지한다.
 */
function resolveCta(pathname: string) {
    if (pathname.startsWith("/product")) {
        return {
            href: "/showroom",
            ctaId: "mobile_floating_showroom",
            label: "쇼룸 예약하기",
            Icon: MapPin,
        } as const
    }

    return {
        href: "/contact",
        ctaId: "mobile_floating_contact",
        label: "도입 문의하기",
        Icon: MessageSquare,
    } as const
}

export function MobileFloatingCTA() {
    const pathname = usePathname()
    const shouldReduceMotion = useReducedMotion()
    const [visible, setVisible] = useState(false)
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
                } else if (scrollingUp) {
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
    }, [])

    if (
        pathname.startsWith("/admin") ||
        pathname.startsWith("/checkout") ||
        pathname.startsWith("/contact") ||
        pathname.startsWith("/pricing") ||
        pathname.startsWith("/receipt") ||
        // 쇼룸은 페이지 자체가 예약 폼을 들고 있다 — 떠 있는 문의 CTA 와 겹치면
        // 같은 화면에서 서로 다른 전환 경로를 두 개 제시하게 된다.
        pathname.startsWith("/showroom")
    ) {
        return null
    }

    const cta = resolveCta(pathname)

    return (
        <div className="md:hidden">
            <AnimatePresence>
                {visible && (
                    // 챗봇 버튼(오른쪽 12px·하단 1rem·56px)과 겹치지 않게 왼쪽에 글자 폭만큼만 둔다.
                    // 높이 44px 를 챗봇 버튼 세로 가운데에 맞춘다(하단 1rem + 6px).
                    <motion.div
                        initial={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, y: 12 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, y: 12 }}
                        transition={{ duration: 0.28, ease: "easeOut" }}
                        className="fixed bottom-[calc(env(safe-area-inset-bottom)+1rem+6px)] left-3 z-40 max-w-[calc(100vw-6.5rem)]"
                    >
                        {/* 은은한 펄스: 알약 테두리에서 바깥으로 옅게 번졌다 사라지는 링, 느린 주기. */}
                        {!shouldReduceMotion ? (
                            <motion.span
                                aria-hidden
                                className="pointer-events-none absolute inset-0 rounded-full"
                                initial={{ boxShadow: "0 0 0 0 rgba(8,71,52,0.16)" }}
                                animate={{ boxShadow: ["0 0 0 0 rgba(8,71,52,0.16)", "0 0 0 10px rgba(8,71,52,0)"] }}
                                transition={{ duration: 2.4, ease: "easeOut", repeat: Infinity, repeatDelay: 1.8 }}
                            />
                        ) : null}
                        <TrackedLink
                            href={cta.href}
                            ctaId={cta.ctaId}
                            className="relative flex h-11 items-center gap-2 rounded-full border border-[#084734]/15 bg-white/85 px-4 text-sm font-semibold text-[#0e5038] shadow-[0_6px_20px_rgba(43,41,38,0.10)] backdrop-blur-md transition-colors active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#084734]/40"
                        >
                            <cta.Icon className="h-4 w-4 shrink-0" aria-hidden />
                            <span className="truncate">{cta.label}</span>
                        </TrackedLink>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    )
}
