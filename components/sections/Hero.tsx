"use client"

import { Button } from "@/components/ui/button"
import Link from "next/link"
import { DemoModal } from "./DemoModal"
import { motion, useScroll, useTransform } from "framer-motion"
import { trackEvent } from "@/lib/analytics"
import Image from "next/image"
import { useRef } from "react"
import { HeroVideoBackdrop } from "@/components/media/HeroVideoBackdrop"

const HERO_VIDEO_MEDIA_QUERY = "(min-width: 768px) and (prefers-reduced-motion: no-preference)"

export function Hero() {
    const heroRef = useRef<HTMLElement>(null)
    const dashboardRef = useRef<HTMLElement>(null)
    const { scrollYProgress } = useScroll({
        target: heroRef,
        offset: ["start start", "end start"],
    })
    const { scrollYProgress: dashboardScrollYProgress } = useScroll({
        target: dashboardRef,
        offset: ["start end", "end start"],
    })
    const videoY = useTransform(scrollYProgress, [0, 1], ["0px", "112px"])
    const empoweringY = useTransform(dashboardScrollYProgress, [0, 1], ["48px", "-48px"])
    const empoweringOpacity = useTransform(dashboardScrollYProgress, [0, 0.35, 0.8], [0.34, 0.64, 0.28])

    return (
        <div className="relative bg-[#FAFAF8] pt-[76px] md:pt-20">
            <section
                ref={heroRef}
                className="sticky top-[76px] z-0 isolate h-[calc(100svh-76px)] overflow-hidden bg-[#0A1511] md:top-20 md:h-[calc(100svh-5rem)]"
            >
                <motion.div
                    className="absolute inset-0 z-0 hidden h-[calc(100%+120px)] md:block pointer-events-none overflow-hidden"
                    style={{ y: videoY }}
                >
                    <HeroVideoBackdrop
                        src="/video/home-hero.mp4"
                        posterSrc="/images/hero-dashboard.webp"
                        className="h-full w-full"
                        imageClassName="saturate-[0.98] contrast-[1.08] brightness-[0.84]"
                        videoClassName="saturate-[0.98] contrast-[1.08] brightness-[0.84]"
                        priority
                        loadStrategy="idle"
                        mediaQuery={HERO_VIDEO_MEDIA_QUERY}
                    />
                </motion.div>

                <div className="absolute inset-0 z-[1] bg-[rgba(3,13,10,0.42)] md:bg-[rgba(3,13,10,0.36)]" />
                <div className="absolute inset-0 z-[2] bg-[radial-gradient(circle_at_50%_36%,rgba(255,255,255,0.16),transparent_34%),linear-gradient(to_bottom,rgba(3,13,10,0.18),rgba(3,13,10,0.26)_55%,rgba(3,13,10,0.58))]" />

                <div className="absolute inset-x-0 top-0 z-[3] h-full overflow-hidden pointer-events-none">
                    <svg className="absolute w-[120%] h-[120%] -top-[10%] -left-[10%] opacity-20 filter blur-[100px]" style={{ willChange: 'transform', contain: 'layout style' }} xmlns="http://www.w3.org/2000/svg">
                        <defs>
                            <radialGradient id="orb1" cx="50%" cy="50%" r="50%">
                                <stop offset="0%" stopColor="rgba(8, 71, 52, 0.2)" />
                                <stop offset="100%" stopColor="rgba(8, 71, 52, 0)" />
                            </radialGradient>
                            <radialGradient id="orb2" cx="50%" cy="50%" r="50%">
                                <stop offset="0%" stopColor="rgba(6, 92, 65, 0.14)" />
                                <stop offset="100%" stopColor="rgba(6, 92, 65, 0)" />
                            </radialGradient>
                            <radialGradient id="orb3" cx="50%" cy="50%" r="50%">
                                <stop offset="0%" stopColor="rgba(236, 253, 245, 0.34)" />
                                <stop offset="100%" stopColor="rgba(236, 253, 245, 0)" />
                            </radialGradient>
                        </defs>
                        <g className="animate-blob1 origin-center">
                            <circle cx="30%" cy="40%" r="35%" fill="url(#orb1)" />
                        </g>
                        <g className="animate-blob2 origin-center">
                            <circle cx="70%" cy="50%" r="40%" fill="url(#orb2)" />
                        </g>
                        <g className="animate-blob3 origin-center">
                            <circle cx="45%" cy="70%" r="45%" fill="url(#orb3)" />
                        </g>
                    </svg>
                </div>

                <div className="relative z-10 flex h-full items-center py-16 md:py-20">
                    <div className="container mx-auto px-4">
                        <div className="flex flex-col items-center text-center max-w-5xl mx-auto">
                            <motion.div
                                initial={{ opacity: 0, scale: 0.9, y: 10 }}
                                animate={{ opacity: 1, scale: 1, y: 0 }}
                                transition={{ duration: 0.6, ease: "easeOut" }}
                            >
                                <span className="inline-flex items-center gap-2.5 py-2 px-5 rounded-full bg-[#ECFDF5]/12 backdrop-blur-md border border-white/18 text-white text-sm md:text-base font-semibold mb-8 shadow-[0_12px_34px_rgba(0,0,0,0.18)]">
                                    <span className="relative flex h-2 w-2">
                                        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#CEF17B]/45" />
                                        <span className="relative inline-flex h-2 w-2 rounded-full bg-[#CEF17B]" />
                                    </span>
                                    <span className="tracking-[0.02em] drop-shadow-[0_1px_8px_rgba(0,0,0,0.45)]">기술 × 교육 — 새로운 시대의 학원 운영</span>
                                </span>
                            </motion.div>

                            <motion.h1
                                initial={{ opacity: 0, y: 30 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ duration: 0.7, delay: 0.1, ease: [0.21, 0.47, 0.32, 0.98] }}
                                className="text-5xl md:text-7xl lg:text-[5.5rem] font-extrabold text-white mb-8 leading-[1.05] break-keep drop-shadow-[0_6px_28px_rgba(0,0,0,0.48)]"
                                style={{ letterSpacing: '-2.125px' }}
                            >
                                수업은 더욱 <span className="font-black animate-text-gradient inline-block pb-2">퀄리티</span> 있게<br className="hidden sm:block" />{" "}
                                관리는 더욱 <span className="font-black animate-text-gradient inline-block pb-2">쉽고 편하게</span>
                            </motion.h1>

                            <motion.p
                                initial={{ opacity: 0, y: 20 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ duration: 0.7, delay: 0.2, ease: "easeOut" }}
                                className="text-lg md:text-xl lg:text-2xl text-white/82 mb-12 max-w-3xl mx-auto leading-relaxed font-light break-keep drop-shadow-[0_3px_16px_rgba(0,0,0,0.42)]"
                            >
                                수업을 시스템으로 만들면, 강사가 바뀌어도 품질이 유지됩니다. <br className="hidden md:block" />
                                수업 준비부터 복습 관리까지, 하나의 플랫폼으로 완성하세요.
                            </motion.p>

                            <motion.div
                                initial={{ opacity: 0, y: 20 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ duration: 0.7, delay: 0.3, ease: "easeOut" }}
                                className="flex flex-col sm:flex-row items-center gap-4 sm:gap-5 justify-center w-full px-4 sm:px-0 flex-wrap"
                            >
                                <DemoModal trackingButton="hero_demo">
                                    <Button size="lg" className="h-[3.5rem] px-8 text-[1.05rem] font-bold bg-[#084734] hover:bg-[#065c41] text-white rounded-2xl w-full sm:w-auto transition-all duration-300 hover:scale-[1.03] active:scale-[0.97]" style={{ boxShadow: 'rgba(8,71,52,0.2) 0px 4px 18px, rgba(8,71,52,0.1) 0px 2px 7px' }}>
                                        <span className="relative z-10">내 학원 시스템 설계받기 →</span>
                                    </Button>
                                </DemoModal>
                                <Button asChild variant="outline" className="h-12 px-7 text-base font-semibold bg-white/82 hover:bg-white text-[#111110] hover:text-[#111110] border border-white/60 rounded-2xl w-full sm:w-auto transition-all duration-300 shadow-[0_10px_26px_rgba(0,0,0,0.18)]">
                                    <Link href="/product/sw" onClick={() => trackEvent("click_cta", { button: "hero_product_tour" })}>
                                        <span className="relative z-10">제품 둘러보기</span>
                                    </Link>
                                </Button>
                            </motion.div>
                        </div>
                    </div>
                </div>
            </section>

            <section
                ref={dashboardRef}
                className="relative z-20 isolate overflow-hidden rounded-tl-[1.75rem] rounded-tr-[1.75rem] bg-[#FAFAF8] pt-20 pb-20 shadow-[0_-18px_50px_rgba(0,0,0,0.16),0_-1px_0_rgba(255,255,255,0.8)] md:rounded-tl-[2rem] md:rounded-tr-[2rem] md:pt-28 md:pb-32"
            >
                <div className="pointer-events-none absolute inset-x-0 top-0 z-0 h-16 bg-gradient-to-b from-white/75 to-transparent" />
                <div className="pointer-events-none absolute inset-x-0 top-0 z-0 h-px bg-white/90" />
                <motion.div
                    className="pointer-events-none relative z-0 mx-auto mb-16 hidden justify-center px-6 md:flex md:mb-24 lg:mb-28"
                    style={{ y: empoweringY, opacity: empoweringOpacity }}
                    aria-hidden="true"
                >
                    <h2 className="text-center text-[clamp(3rem,7.8vw,7.5rem)] font-black uppercase leading-[0.9] tracking-[0.12em] select-none text-[#8F8B85]">
                        <span className="block">Empower</span>
                        <span className="block">Education Online</span>
                    </h2>
                </motion.div>

                <div className="container relative z-10 mx-auto px-4">
                    <motion.div
                        initial={{ opacity: 0, y: 60, rotateX: 10 }}
                        whileInView={{ opacity: 1, y: 0, rotateX: 0 }}
                        viewport={{ once: true, amount: 0.25 }}
                        transition={{ duration: 1, delay: 0.05, type: "spring", bounce: 0.15 }}
                        style={{ perspective: 1000, boxShadow: 'rgba(0,0,0,0.04) 0px 4px 18px, rgba(0,0,0,0.027) 0px 2px 7.8px, rgba(0,0,0,0.02) 0px 0.8px 2.9px, rgba(0,0,0,0.01) 0px 0.175px 1px' }}
                        className="relative mx-auto max-w-6xl rounded-2xl border border-[rgba(0,0,0,0.08)] bg-white p-2 lg:rounded-[2rem] lg:p-4 group"
                    >
                        <div className="relative rounded-xl overflow-hidden bg-[#111110] border border-[rgba(0,0,0,0.08)] flex items-center justify-center group-hover:shadow-[0_0_60px_rgba(8,71,52,0.12)] transition-shadow duration-700">
                            <Image
                                src="/images/hero-dashboard.webp"
                                alt="Classin Education Dashboard"
                                width={1200}
                                height={675}
                                priority
                                className="w-full h-auto object-cover rounded-xl relative z-10"
                            />
                            <div className="absolute inset-0 bg-gradient-to-t from-[#111110] via-transparent to-transparent opacity-60 z-20 pointer-events-none" />
                        </div>
                    </motion.div>
                </div>

                <div className="absolute bottom-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-[#084734]/30 to-transparent" />
            </section>
        </div>
    )
}
