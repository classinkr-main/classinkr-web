"use client"

import { Button } from "@/components/ui/button"
import Link from "next/link"
import { DemoModal } from "./DemoModal"
import { trackEvent } from "@/lib/analytics"
import Image from "next/image"
import { HeroVideoBackdrop } from "@/components/media/HeroVideoBackdrop"
import { CLASSIN_POSITIONING } from "@/lib/classin-positioning"

const HERO_VIDEO_MEDIA_QUERY = "(min-width: 1024px) and (prefers-reduced-motion: no-preference)"

export function Hero() {
    return (
        <div className="relative bg-[#FAFAF8] pt-[76px] md:pt-20">
            <section
                className="sticky top-[76px] z-0 isolate h-[calc(100svh-76px)] overflow-hidden bg-[#0A1511] md:top-20 md:h-[calc(100svh-5rem)]"
            >
                <div className="absolute inset-0 z-0 hidden md:block pointer-events-none overflow-hidden">
                    <HeroVideoBackdrop
                        src="/video/home-hero.mp4"
                        posterSrc="/images/hero-dashboard.webp"
                        className="h-full w-full"
                        priority
                        loadStrategy="idle"
                        mediaQuery={HERO_VIDEO_MEDIA_QUERY}
                        preload="none"
                    />
                </div>

                <div className="absolute inset-0 z-[1] bg-[rgba(3,13,10,0.42)] md:bg-[rgba(3,13,10,0.36)]" />
                <div className="absolute inset-0 z-[2] bg-[radial-gradient(circle_at_50%_36%,rgba(255,255,255,0.16),transparent_34%),linear-gradient(to_bottom,rgba(3,13,10,0.18),rgba(3,13,10,0.26)_55%,rgba(3,13,10,0.58))]" />
                <div className="absolute inset-0 z-[3] bg-[radial-gradient(circle_at_22%_72%,rgba(8,71,52,0.20),transparent_38%),radial-gradient(circle_at_72%_26%,rgba(236,253,245,0.10),transparent_34%)] pointer-events-none" />

                <div className="relative z-10 flex h-full items-center py-16 md:py-20">
                    <div className="container mx-auto px-4">
                        <div className="flex flex-col items-center text-center max-w-5xl mx-auto">
                            <div className="hero-soft-enter hero-soft-enter-badge">
                                <span className="inline-flex items-center gap-2.5 py-2 px-5 rounded-full bg-[#ECFDF5]/12 backdrop-blur-md border border-white/18 text-white text-sm md:text-base font-semibold mb-8 shadow-[0_12px_34px_rgba(0,0,0,0.18)]">
                                    <span className="relative flex h-2 w-2">
                                        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#CEF17B]/45" />
                                        <span className="relative inline-flex h-2 w-2 rounded-full bg-[#CEF17B]" />
                                    </span>
                                    <span className="tracking-[0.02em] drop-shadow-[0_1px_8px_rgba(0,0,0,0.45)]">
                                        {CLASSIN_POSITIONING.heroEyebrow}
                                    </span>
                                </span>
                            </div>

                            <h1
                                className="hero-soft-enter hero-soft-enter-title text-5xl md:text-7xl lg:text-[5.5rem] font-extrabold text-white mb-8 leading-[1.05] break-keep drop-shadow-[0_6px_28px_rgba(0,0,0,0.48)]"
                                style={{ letterSpacing: '-2.125px' }}
                            >
                                전자칠판을 넘어<br className="hidden sm:block" />{" "}
                                <span className="font-black animate-text-gradient inline-block pb-2">학원 시스템 OS</span>로
                            </h1>

                            <p
                                className="hero-soft-enter hero-soft-enter-copy text-lg md:text-xl lg:text-2xl text-white/82 mb-12 max-w-3xl mx-auto leading-relaxed font-light break-keep drop-shadow-[0_3px_16px_rgba(0,0,0,0.42)]"
                            >
                                {CLASSIN_POSITIONING.heroBody}
                            </p>

                            <div
                                className="hero-soft-enter hero-soft-enter-actions flex flex-col sm:flex-row items-center gap-4 sm:gap-5 justify-center w-full px-4 sm:px-0 flex-wrap"
                            >
                                <DemoModal trackingButton="hero_demo">
                                    <Button size="lg" className="h-[3.5rem] px-8 text-[1.05rem] font-bold bg-[#084734] hover:bg-[#065c41] text-white rounded-2xl w-full sm:w-auto transition-all duration-300 hover:scale-[1.03] active:scale-[0.97]" style={{ boxShadow: 'rgba(8,71,52,0.2) 0px 4px 18px, rgba(8,71,52,0.1) 0px 2px 7px' }}>
                                        <span className="relative z-10">내 학원 시스템 설계받기 →</span>
                                    </Button>
                                </DemoModal>
                                <Button asChild variant="outline" className="h-12 px-7 text-base font-semibold bg-white/82 hover:bg-white text-[#111110] hover:text-[#111110] border border-white/60 rounded-2xl w-full sm:w-auto transition-all duration-300 shadow-[0_10px_26px_rgba(0,0,0,0.18)]">
                                    <Link href="/product/sw" onClick={() => trackEvent("click_cta", { button: "hero_product_tour" })}>
                                        <span className="relative z-10">시스템 구조 보기</span>
                                    </Link>
                                </Button>
                            </div>
                        </div>
                    </div>
                </div>
            </section>

            <section
                className="relative z-20 isolate overflow-hidden rounded-tl-[1.75rem] rounded-tr-[1.75rem] bg-[#FAFAF8] pt-20 pb-20 shadow-[0_-18px_50px_rgba(0,0,0,0.16),0_-1px_0_rgba(255,255,255,0.8)] md:rounded-tl-[2rem] md:rounded-tr-[2rem] md:pt-28 md:pb-32"
            >
                <div className="pointer-events-none absolute inset-x-0 top-0 z-0 h-16 bg-gradient-to-b from-white/75 to-transparent" />
                <div className="pointer-events-none absolute inset-x-0 top-0 z-0 h-px bg-white/90" />
                <div
                    className="pointer-events-none relative z-0 mx-auto mb-16 hidden justify-center px-6 opacity-40 md:flex md:mb-24 lg:mb-28"
                    aria-hidden="true"
                >
                    <h2 className="text-center text-[clamp(3rem,7.8vw,7.5rem)] font-black uppercase leading-[0.9] tracking-[0.12em] select-none text-[#8F8B85]">
                        <span className="block">Empower</span>
                        <span className="block">Education Online</span>
                    </h2>
                </div>

                <div className="container relative z-10 mx-auto px-4">
                    <div
                        style={{ perspective: 1000, boxShadow: 'rgba(0,0,0,0.04) 0px 4px 18px, rgba(0,0,0,0.027) 0px 2px 7.8px, rgba(0,0,0,0.02) 0px 0.8px 2.9px, rgba(0,0,0,0.01) 0px 0.175px 1px' }}
                        className="relative mx-auto max-w-6xl rounded-2xl border border-[rgba(0,0,0,0.08)] bg-white p-2 lg:rounded-[2rem] lg:p-4 group"
                    >
                        <div className="relative rounded-xl overflow-hidden bg-[#111110] border border-[rgba(0,0,0,0.08)] flex items-center justify-center group-hover:shadow-[0_0_60px_rgba(8,71,52,0.12)] transition-shadow duration-700">
                            <Image
                                src="/images/hero-dashboard.webp"
                                alt="Classin Education Dashboard"
                                width={1200}
                                height={675}
                                className="w-full h-auto object-cover rounded-xl relative z-10"
                            />
                            <div className="absolute inset-0 bg-gradient-to-t from-[#111110] via-transparent to-transparent opacity-60 z-20 pointer-events-none" />
                        </div>
                    </div>
                </div>

                <div className="absolute bottom-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-[#084734]/30 to-transparent" />
            </section>
        </div>
    )
}
