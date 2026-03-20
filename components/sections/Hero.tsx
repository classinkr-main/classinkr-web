"use client"

import { Button } from "@/components/ui/button"
import { DemoModal } from "./DemoModal"
import { motion } from "framer-motion"
import { trackEvent } from "@/lib/analytics"
import Image from "next/image"


export function Hero() {
    return (
        <section className="relative pt-32 pb-20 md:pt-48 md:pb-32 overflow-hidden bg-gradient-to-b from-white via-emerald-50/40 to-white">
            {/* Soft green ambient orbs */}
            <div className="absolute inset-0 z-0 overflow-hidden pointer-events-none">
                <svg className="absolute w-[120%] h-[120%] -top-[10%] -left-[10%] opacity-40 filter blur-[80px]" style={{ willChange: 'transform', contain: 'layout style' }} xmlns="http://www.w3.org/2000/svg">
                    <defs>
                        <radialGradient id="orb1" cx="50%" cy="50%" r="50%">
                            <stop offset="0%" stopColor="rgba(16, 185, 129, 0.2)" />
                            <stop offset="100%" stopColor="rgba(16, 185, 129, 0)" />
                        </radialGradient>
                        <radialGradient id="orb2" cx="50%" cy="50%" r="50%">
                            <stop offset="0%" stopColor="rgba(167, 243, 208, 0.25)" />
                            <stop offset="100%" stopColor="rgba(167, 243, 208, 0)" />
                        </radialGradient>
                        <radialGradient id="orb3" cx="50%" cy="50%" r="50%">
                            <stop offset="0%" stopColor="rgba(206, 241, 123, 0.15)" />
                            <stop offset="100%" stopColor="rgba(206, 241, 123, 0)" />
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
                        <span className="inline-flex items-center gap-2 py-1.5 px-4 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700 text-sm md:text-base font-medium mb-8">
                            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                            500개 이상의 학원이 선택한 혁신 솔루션
                        </span>
                    </motion.div>

                    <motion.h1
                        initial={{ opacity: 0, y: 30 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.7, delay: 0.1, ease: [0.21, 0.47, 0.32, 0.98] }}
                        className="text-5xl md:text-7xl lg:text-[5.5rem] font-extrabold tracking-tight text-slate-900 mb-8 leading-[1.1]"
                    >
                        티칭 퀄리티 <span className="font-black animate-text-gradient inline-block pb-2">상향 표준화</span>, 확실한 학습 성과 보장.
                    </motion.h1>

                    <motion.p
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.7, delay: 0.2, ease: "easeOut" }}
                        className="text-lg md:text-xl lg:text-2xl text-slate-500 mb-12 max-w-3xl mx-auto leading-relaxed font-light"
                    >
                        다지점 학원을 위한 프리미엄 올인원 운영 시스템. <br className="hidden md:block" />
                        수업부터 자동 채점, 성과 분석까지 하나의 플랫폼으로 완성하세요.
                    </motion.p>

                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.7, delay: 0.3, ease: "easeOut" }}
                        className="flex flex-col sm:flex-row items-center gap-4 sm:gap-5 justify-center w-full px-4 sm:px-0 flex-wrap"
                    >
                        <DemoModal>
                            <Button size="lg" onClick={() => trackEvent('click_cta', { button: 'hero_demo' })} className="h-[3.5rem] px-8 text-[1.05rem] font-bold bg-slate-900 hover:bg-slate-800 text-white rounded-2xl shadow-lg hover:shadow-xl w-full sm:w-auto transition-all duration-300 hover:scale-[1.03] active:scale-95">
                                <span className="relative z-10">제품 도입 문의</span>
                            </Button>
                        </DemoModal>
                        <Button variant="outline" size="lg" onClick={() => trackEvent('download_materials')} className="h-[3.5rem] px-8 text-[1.05rem] font-bold bg-emerald-600 hover:bg-emerald-700 text-white border-emerald-600 hover:border-emerald-700 rounded-2xl shadow-lg hover:shadow-xl w-full sm:w-auto transition-all duration-300 hover:scale-[1.03] active:scale-95">
                            <span className="relative z-10">자료 받아보기</span>
                        </Button>
                        <Button variant="outline" size="lg" onClick={() => trackEvent('view_demo_video')} className="h-[3.5rem] px-8 text-[1.05rem] font-bold bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 hover:border-slate-300 rounded-2xl shadow-sm hover:shadow-md w-full sm:w-auto transition-all duration-300 hover:scale-[1.03] active:scale-95">
                            <span className="relative z-10">3분 투어 영상</span>
                        </Button>
                    </motion.div>

                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ duration: 1, delay: 0.6 }}
                        className="mt-16 sm:mt-20 flex w-full justify-center px-4"
                    >
                        <h2 className="text-2xl md:text-4xl lg:text-5xl xl:text-6xl font-black tracking-[0.2em] uppercase text-center select-none text-slate-300">
                            Empowering Education Online
                        </h2>
                    </motion.div>
                </div>

                {/* Dashboard Image Preview with 3D-like animation */}
                <motion.div
                    initial={{ opacity: 0, y: 60, rotateX: 10 }}
                    animate={{ opacity: 1, y: 0, rotateX: 0 }}
                    transition={{ duration: 1, delay: 0.5, type: "spring", bounce: 0.15 }}
                    style={{ perspective: 1000 }}
                    className="relative mx-auto max-w-6xl rounded-2xl border border-slate-200 bg-white p-2 shadow-2xl lg:rounded-[2rem] lg:p-4 group"
                >
                    <div className="relative rounded-xl overflow-hidden bg-slate-900 border border-slate-200 flex items-center justify-center group-hover:shadow-[0_0_60px_rgba(16,185,129,0.15)] transition-shadow duration-700">
                        <Image
                            src="/images/hero-dashboard.png"
                            alt="Classin Education Dashboard"
                            width={1200}
                            height={675}
                            priority
                            className="w-full h-auto object-cover rounded-xl relative z-10"
                        />
                        <div className="absolute inset-0 bg-gradient-to-t from-slate-900 via-transparent to-transparent opacity-60 z-20 pointer-events-none" />
                    </div>
                </motion.div>
            </div>

            {/* Bottom fading line */}
            <div className="absolute bottom-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-emerald-300/50 to-transparent" />
        </section>
    )
}
