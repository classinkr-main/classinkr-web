"use client"

import { m, useInView } from "framer-motion"
import { ArrowRight, Play } from "lucide-react"
import Link from "next/link"
import { useRef } from "react"

import { HeroVideoBackdrop } from "@/components/media/HeroVideoBackdrop"
import { Button } from "@/components/ui/button"
import { BROCHURE_URL } from "@/lib/marketing-links"
import { trackEvent } from "@/lib/analytics"

import { CHECKOUT_CTA_LABEL, CHECKOUT_HREF, trackCheckoutClick } from "./sw-checkout"
import { VIDEO_BACKDROP_MEDIA_QUERY } from "./sw-shared"
import { useCountUp } from "./useCountUp"

const HERO_CLASSROOM_VIDEO_SRC = "/video/쿼드러닝 수업_클립1.mp4"

export default function SwHeroSection() {
    const heroMetricRef = useRef(null)
    const heroMetricInView = useInView(heroMetricRef, { once: true })

    const metric30 = useCountUp(30, heroMetricInView)
    const metric10 = useCountUp(10, heroMetricInView)
    const metric150 = useCountUp(150, heroMetricInView)
    const metric2400 = useCountUp(2400, heroMetricInView)

    return (
            <section className="relative min-h-[720px] overflow-hidden bg-[#07110d] text-white sm:min-h-[700px] md:h-[calc(100svh-4rem)] md:min-h-[760px] md:max-h-[840px]">
                <HeroVideoBackdrop
                    src={HERO_CLASSROOM_VIDEO_SRC}
                    posterSrc="/images/product/sw/two-way-blackboard.webp"
                    className="absolute inset-0"
                    priority
                    loadStrategy="immediate"
                    mediaQuery={VIDEO_BACKDROP_MEDIA_QUERY}
                />
                <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(3,10,8,0.70)_0%,rgba(3,10,8,0.42)_42%,rgba(3,10,8,0.78)_100%)] pointer-events-none" />
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(3,10,8,0.10)_0%,rgba(3,10,8,0.50)_78%)] pointer-events-none" />

                <div className="container relative z-10 mx-auto flex min-h-[720px] items-center px-4 py-14 sm:min-h-[700px] lg:px-8 md:h-full md:min-h-0 md:py-20">
                    <div className="max-w-4xl mx-auto text-center">
                        <m.div initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7 }}>
                            <div className="inline-flex items-center gap-2.5 px-5 py-2 rounded-full bg-white/12 border border-white/18 shadow-[0_2px_18px_rgba(0,0,0,0.18)] text-[#6EE7B7] text-xs font-bold mb-8 tracking-widest uppercase backdrop-blur-sm">
                                <span className="w-1.5 h-1.5 rounded-full bg-[#22A366] animate-pulse"></span>
                                교육 전용 플랫폼
                            </div>

                            <h1 className="text-4xl sm:text-5xl lg:text-6xl xl:text-7xl font-sans font-bold leading-[1.1] mb-8 text-white drop-shadow-[0_3px_20px_rgba(0,0,0,0.35)]">
                                수업을, 더{" "}
                                <span className="text-[#6EE7B7]">수업답게</span>
                            </h1>

                            <p className="text-xl md:text-2xl text-white/78 leading-relaxed font-medium max-w-2xl mx-auto mb-8 drop-shadow-[0_2px_14px_rgba(0,0,0,0.35)]">
                                30여 가지 수업 도구와 10가지 수업 활동으로
                                <br className="hidden md:block" />{" "}
                                교사와 학생이 함께 만들어가는 교육 전용 플랫폼.
                            </p>

                            {/* Animated hero metrics */}
                            <div ref={heroMetricRef} className="flex flex-wrap justify-center gap-6 md:gap-12 mb-12">
                                {[
                                    { value: metric30, suffix: "+", label: "수업 도구" },
                                    { value: metric10, suffix: "+", label: "수업 활동" },
                                    { value: metric150, suffix: "+", label: "지원 국가" },
                                    { value: metric2400.toLocaleString(), suffix: "+", label: "도입 학원", raw: true },
                                ].map((metric, i) => (
                                    <m.div key={i} initial={{ opacity: 0, y: 15 }} animate={heroMetricInView ? { opacity: 1, y: 0 } : {}} transition={{ delay: i * 0.1 + 0.3 }} className="min-w-[84px] text-center">
                                        <div className="text-2xl md:text-3xl font-sans font-bold tabular-nums text-[#6EE7B7] drop-shadow-[0_2px_12px_rgba(0,0,0,0.35)]">
                                            {metric.raw ? metric.value : metric.value}{metric.suffix}
                                        </div>
                                        <div className="text-[11px] md:text-xs text-white/62 mt-0.5 font-semibold">{metric.label}</div>
                                    </m.div>
                                ))}
                            </div>

                            <div className="flex flex-col items-stretch justify-center gap-3 sm:flex-row sm:items-center sm:gap-4">
                                <Button asChild className="h-[3.25rem] rounded-full bg-[#009060] px-7 text-base font-bold text-white shadow-[0_8px_20px_rgba(0,144,96,0.24)] transition-all hover:scale-105 hover:bg-[#007A52] hover:shadow-[0_12px_25px_rgba(0,144,96,0.32)] group sm:h-14 sm:px-8">
                                    <Link
                                        href={CHECKOUT_HREF}
                                        onClick={() => trackCheckoutClick("sw_final_checkout")}
                                    >
                                    {CHECKOUT_CTA_LABEL}
                                    <ArrowRight className="w-4 h-4 ml-2 group-hover:translate-x-1 transition-transform" />
                                    </Link>
                                </Button>
                                <Button asChild variant="outline" className="h-[3.25rem] rounded-full border-white/35 bg-white/8 px-7 text-base font-bold text-white backdrop-blur-sm transition-all hover:scale-105 hover:border-white/55 hover:bg-white/16 sm:h-14 sm:px-8">
                                    <a
                                        href={BROCHURE_URL}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        onClick={() => trackEvent("download_materials", { asset_id: "sw_brochure", page: "/product/sw" })}
                                    >
                                    <Play className="w-4 h-4 mr-2" />
                                    서비스 소개서 보기
                                    </a>
                                </Button>
                            </div>
                        </m.div>
                    </div>
                </div>
            </section>
    )
}
