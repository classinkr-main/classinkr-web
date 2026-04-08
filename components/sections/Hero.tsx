"use client"

import { Button } from "@/components/ui/button"
import { BROCHURE_URL } from "@/lib/marketing-links"
import Link from "next/link"
import { DemoModal } from "./DemoModal"
import { NewsletterModal } from "./NewsletterModal"
import { motion } from "framer-motion"
import { trackEvent } from "@/lib/analytics"
import Image from "next/image"


export function Hero() {
    return (
        <section className="relative pt-32 pb-20 md:pt-48 md:pb-32 overflow-hidden bg-[#FAFAF8]">
            {/* Green ambient orbs — Classin 브랜드 그린 계열 */}
            <div className="absolute inset-0 z-0 overflow-hidden pointer-events-none">
                <svg className="absolute w-[120%] h-[120%] -top-[10%] -left-[10%] opacity-30 filter blur-[100px]" style={{ willChange: 'transform', contain: 'layout style' }} xmlns="http://www.w3.org/2000/svg">
                    <defs>
                        <radialGradient id="orb1" cx="50%" cy="50%" r="50%">
                            <stop offset="0%" stopColor="rgba(8, 71, 52, 0.18)" />
                            <stop offset="100%" stopColor="rgba(8, 71, 52, 0)" />
                        </radialGradient>
                        <radialGradient id="orb2" cx="50%" cy="50%" r="50%">
                            <stop offset="0%" stopColor="rgba(6, 92, 65, 0.12)" />
                            <stop offset="100%" stopColor="rgba(6, 92, 65, 0)" />
                        </radialGradient>
                        <radialGradient id="orb3" cx="50%" cy="50%" r="50%">
                            <stop offset="0%" stopColor="rgba(236, 253, 245, 0.6)" />
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

            <div className="container mx-auto relative z-10">
                <div className="flex flex-col items-center text-center max-w-5xl mx-auto mb-20">
                    <motion.div
                        initial={{ opacity: 0, scale: 0.9, y: 10 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        transition={{ duration: 0.6, ease: "easeOut" }}
                    >
                        <span className="inline-flex items-center gap-2 py-1.5 px-4 rounded-full bg-[#ECFDF5] border border-[#084734]/20 text-[#084734] text-sm md:text-base font-medium mb-8">
                            <span className="w-2 h-2 rounded-full bg-[#084734] animate-pulse" />
                            전국 500+ 학원, 지금 이 순간도 수업 중
                        </span>
                    </motion.div>

                    <motion.h1
                        initial={{ opacity: 0, y: 30 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.7, delay: 0.1, ease: [0.21, 0.47, 0.32, 0.98] }}
                        className="text-5xl md:text-7xl lg:text-[5.5rem] font-extrabold text-[#111110] mb-8 leading-[1.05] break-keep"
                        style={{ letterSpacing: '-2.125px' }}
                    >
                        에이스 강사 없이도<br className="hidden sm:block" /><span className="font-black animate-text-gradient inline-block pb-2"> 1등 학원</span>이 됩니다.
                    </motion.h1>

                    <motion.p
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.7, delay: 0.2, ease: "easeOut" }}
                        className="text-lg md:text-xl lg:text-2xl text-[#615D59] mb-12 max-w-3xl mx-auto leading-relaxed font-light break-keep"
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
                        <NewsletterModal
                            source="hero_materials"
                            badge="무료 자료"
                            title="서비스 소개서 받아보기"
                            description="이메일을 남겨주시면 Classin 소개서와 도입 포인트를 바로 확인하실 수 있습니다."
                            benefits={[
                                "Classin 주요 기능 한눈에 정리",
                                "도입 사례 및 성과 데이터 포함",
                                "요금제 · 도입 프로세스 안내",
                            ]}
                            successCta={{
                                label: "소개서 지금 바로 열기",
                                href: BROCHURE_URL,
                            }}
                        >
                            <Button variant="outline" size="lg" onClick={() => trackEvent("download_materials")} className="h-[3.5rem] px-8 text-[1.05rem] font-bold bg-[#ECFDF5] hover:bg-[#D1FAE5] text-[#084734] border border-[#084734]/20 hover:border-[#084734]/40 rounded-2xl w-full sm:w-auto transition-all duration-300 hover:scale-[1.03] active:scale-[0.97]">
                                <span className="relative z-10">도입 사례 보기</span>
                            </Button>
                        </NewsletterModal>
                        <Button asChild variant="outline" size="lg" className="h-[3.5rem] px-8 text-[1.05rem] font-bold bg-white hover:bg-[#F6F5F4] text-[#615D59] border border-[rgba(0,0,0,0.08)] hover:border-[rgba(0,0,0,0.14)] rounded-2xl w-full sm:w-auto transition-all duration-300 hover:scale-[1.03] active:scale-[0.97]">
                            <Link href="/product/sw" onClick={() => trackEvent("click_cta", { button: "hero_product_tour" })}>
                                <span className="relative z-10">제품 둘러보기</span>
                            </Link>
                        </Button>
                    </motion.div>

                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ duration: 1, delay: 0.6 }}
                        className="mt-16 sm:mt-20 flex w-full justify-center px-4"
                    >
                        <h2 className="text-2xl md:text-4xl lg:text-5xl xl:text-6xl font-black tracking-[0.2em] uppercase text-center select-none text-[#A39E98]/60">
                            Empowering Education Online
                        </h2>
                    </motion.div>
                </div>

                {/* Dashboard Image Preview */}
                <motion.div
                    initial={{ opacity: 0, y: 60, rotateX: 10 }}
                    animate={{ opacity: 1, y: 0, rotateX: 0 }}
                    transition={{ duration: 1, delay: 0.5, type: "spring", bounce: 0.15 }}
                    style={{ perspective: 1000, boxShadow: 'rgba(0,0,0,0.04) 0px 4px 18px, rgba(0,0,0,0.027) 0px 2px 7.8px, rgba(0,0,0,0.02) 0px 0.8px 2.9px, rgba(0,0,0,0.01) 0px 0.175px 1px' }}
                    className="relative mx-auto max-w-6xl rounded-2xl border border-[rgba(0,0,0,0.08)] bg-white p-2 lg:rounded-[2rem] lg:p-4 group"
                >
                    <div className="relative rounded-xl overflow-hidden bg-[#111110] border border-[rgba(0,0,0,0.08)] flex items-center justify-center group-hover:shadow-[0_0_60px_rgba(8,71,52,0.12)] transition-shadow duration-700">
                        <Image
                            src="/images/hero-dashboard.png"
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

            {/* Bottom fading line */}
            <div className="absolute bottom-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-[#084734]/30 to-transparent" />
        </section>
    )
}
