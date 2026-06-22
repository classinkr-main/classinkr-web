"use client"

import { useEffect, useRef, useState } from "react"
import { motion, AnimatePresence, useInView } from "framer-motion"
import { BookOpen, Zap, RefreshCw } from "lucide-react"
import { cn } from "@/lib/utils"

const steps = [
    {
        id: 1,
        phase: "수업 전",
        title: "EDB 교안 표준화",
        icon: BookOpen,
        headline: "우수 강사의 판서와 자료를 다시 쓰는 수업 파일로",
        desc: "EDB는 판서, 이미지, 텍스트가 살아 있는 Classin 칠판 파일입니다. 최대 50페이지 칠판과 함께 쓰면 매번 지우고 다시 띄우는 대신 교안을 불러와 바로 수업을 시작할 수 있습니다.",
        points: ["EDB 교안 템플릿", "수업 자료와 판서 흐름 재사용", "신규 강사 온보딩 기준"],
    },
    {
        id: 2,
        phase: "수업 중",
        title: "보드와 수업 연결",
        icon: Zap,
        headline: "전자칠판, 카메라, OPS, 소프트웨어가 따로 놀지 않게",
        desc: "일반 전자칠판처럼 화면과 판서만 보는 것이 아니라, Classin Board의 OPS와 수업 소프트웨어가 같은 환경에서 돌아갑니다. 판서, 수업 진행, 학생 참여, 녹화 흐름을 한 교실 안에서 이어갑니다.",
        points: ["윈도우 기반 OPS", "전자칠판과 Classin 수업 연동", "수업 녹화와 참여 도구"],
    },
    {
        id: 3,
        phase: "수업 후",
        title: "녹화와 관리자 데이터",
        icon: RefreshCw,
        headline: "수업이 끝난 뒤에도 기록과 관리가 남습니다",
        desc: "녹화, 복습 자료, LMS 과제, 관리자 대시보드가 연결되면 선생님 기억과 수작업에만 의존하지 않아도 됩니다. 수업 시간, 특이사항, 네트워크 상태, 권한과 데이터 흐름을 기준으로 운영을 점검합니다.",
        points: ["자동 녹화와 복습 운영", "LMS 숙제·시험 루틴", "관리자 대시보드와 권한 관리"],
    },
]

const AUTO_SLIDE_DELAY_MS = 2600

export function SolutionOverview() {
    const sectionRef = useRef<HTMLElement>(null)
    const isInView = useInView(sectionRef, { amount: 0.35 })
    const [activeStep, setActiveStep] = useState(0)

    useEffect(() => {
        if (!isInView) return

        const timeout = window.setTimeout(() => {
            setActiveStep((currentStep) => (currentStep + 1) % steps.length)
        }, AUTO_SLIDE_DELAY_MS)

        return () => window.clearTimeout(timeout)
    }, [activeStep, isInView])

    return (
        <section ref={sectionRef} id="solution" className="py-16 md:py-24 bg-[#F6F5F4]">
            <div className="container mx-auto">
                <div className="text-center max-w-3xl mx-auto mb-16 px-4">
                    <span className="inline-flex items-center gap-2 py-1.5 px-4 rounded-full bg-gradient-to-r from-[#ECFDF5] to-[#D1FAE5]/60 text-[#084734] text-[13px] font-semibold mb-4 border border-[#084734]/8 shadow-[0_2px_8px_rgba(8,71,52,0.06)] tracking-[0.02em]">
                        <span className="w-1 h-1 rounded-full bg-[#084734]/60" />
                        수업 시스템 OS의 3단계
                    </span>
                    <h2 className="text-3xl md:text-5xl lg:text-[3.5rem] font-black text-[#111110] mb-4 leading-[1.1] break-keep" style={{ letterSpacing: '-1.25px' }}>
                        수업 전 · 중 · 후, 흩어진 도구를 하나의 운영 흐름으로
                    </h2>
                    <p className="text-lg text-[#615D59] break-keep">
                        전자칠판 구매가 끝이 아닙니다. 교안, 녹화, LMS, 관리자 데이터까지 이어져야 실제 운영 리소스가 줄어듭니다.
                    </p>
                </div>

                <div className="flex flex-col lg:flex-row gap-8 items-stretch justify-center px-4">
                    {/* Step selector */}
                    <div className="flex flex-row lg:flex-col gap-3 lg:w-72 shrink-0">
                        {steps.map((step, index) => (
                            <button
                                key={index}
                                onClick={() => setActiveStep(index)}
                                className={cn(
                                    "relative flex-1 lg:flex-none flex flex-col lg:flex-row items-center lg:items-start gap-3 p-4 lg:p-5 rounded-2xl text-left transition-all duration-300 border",
                                    activeStep === index
                                        ? "bg-white border-[#084734] shadow-[0_4px_18px_rgba(8,71,52,0.12)]"
                                        : "bg-transparent border-transparent hover:bg-[#F6F5F4] opacity-60 hover:opacity-90"
                                )}
                            >
                                <div
                                    className={cn(
                                        "w-10 h-10 lg:w-12 lg:h-12 rounded-xl flex items-center justify-center shrink-0 transition-colors",
                                        activeStep === index
                                            ? "bg-[#084734] text-white"
                                            : "bg-[#F6F5F4] text-[#A39E98]"
                                    )}
                                >
                                    <step.icon className="w-5 h-5" />
                                </div>
                                <div className="hidden lg:block">
                                    <p className={cn("text-xs font-semibold mb-0.5", activeStep === index ? "text-[#084734]" : "text-[#A39E98]")}>
                                        {step.phase}
                                    </p>
                                    <h3 className={cn("font-bold text-base leading-tight", activeStep === index ? "text-[#111110]" : "text-[#615D59]")}>
                                        {step.title}
                                    </h3>
                                </div>
                                <p className="lg:hidden text-xs font-bold text-center" style={{ color: activeStep === index ? '#084734' : '#A39E98' }}>
                                    {step.phase}
                                </p>
                            </button>
                        ))}
                    </div>

                    {/* Active step detail */}
                    <div className="flex-1 rounded-2xl border border-[rgba(0,0,0,0.08)] bg-[#111110] overflow-hidden" style={{ boxShadow: 'rgba(0,0,0,0.04) 0px 4px 18px, rgba(0,0,0,0.027) 0px 2px 7.8px, rgba(0,0,0,0.02) 0px 0.8px 2.9px' }}>
                        <AnimatePresence mode="wait">
                            <motion.div
                                key={activeStep}
                                initial={{ opacity: 0, x: 16 }}
                                animate={{ opacity: 1, x: 0 }}
                                exit={{ opacity: 0, x: -16 }}
                                transition={{ duration: 0.28 }}
                                className="p-8 md:p-10 h-full flex flex-col justify-center"
                            >
                                <span className="inline-flex items-center gap-2 text-[11px] font-bold text-[#6EE7B7] uppercase tracking-[0.2em] mb-4">
                                    <span className="w-4 h-px bg-[#6EE7B7]/40" />
                                    {steps[activeStep].phase}
                                </span>
                                <h3 className="text-2xl md:text-3xl font-extrabold text-white mb-3 break-keep" style={{ letterSpacing: '-0.625px' }}>
                                    {steps[activeStep].headline}
                                </h3>
                                <p className="text-[#A39E98] text-base md:text-lg leading-relaxed mb-8 break-keep">
                                    {steps[activeStep].desc}
                                </p>
                                <ul className="space-y-3">
                                    {steps[activeStep].points.map((point, i) => (
                                        <motion.li
                                            key={i}
                                            initial={{ opacity: 0, x: 10 }}
                                            animate={{ opacity: 1, x: 0 }}
                                            transition={{ delay: 0.1 + i * 0.08 }}
                                            className="flex items-center gap-3 text-white/80 text-sm"
                                        >
                                            <span className="w-5 h-5 rounded-full bg-[#084734] flex items-center justify-center shrink-0">
                                                <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 12 12">
                                                    <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                                                </svg>
                                            </span>
                                            {point}
                                        </motion.li>
                                    ))}
                                </ul>
                            </motion.div>
                        </AnimatePresence>
                    </div>
                </div>
            </div>
        </section>
    )
}
