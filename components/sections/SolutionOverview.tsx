"use client"

import { useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { BookOpen, Zap, RefreshCw } from "lucide-react"
import { cn } from "@/lib/utils"

const steps = [
    {
        id: 1,
        phase: "수업 전",
        title: "커리큘럼 표준화",
        icon: BookOpen,
        headline: "에이스 강사의 수업 방식을 템플릿으로",
        desc: "잘 가르치는 강사의 수업 계획을 그대로 시스템화합니다. 누가 들어와도 같은 품질의 수업이 가능하고, 신규 강사 온보딩이 며칠로 줄어듭니다.",
        points: ["수업 계획 템플릿 라이브러리", "전 지점 커리큘럼 공유", "강사별 수업 표준 편차 추적"],
    },
    {
        id: 2,
        phase: "수업 중",
        title: "양방향 수업",
        icon: Zap,
        headline: "학생이 화면에서 직접 풀고, 선생님이 실시간 확인",
        desc: "단순히 영상만 보는 수업이 아닙니다. 학생이 전자칠판에서 직접 문제를 풀고, 교사는 전체 학생의 이해도를 한눈에 파악합니다.",
        points: ["실시간 학생 화면 모니터링", "인터랙티브 화이트보드", "즉석 퀴즈 및 반응 수집"],
    },
    {
        id: 3,
        phase: "수업 후",
        title: "자동 복습 관리",
        icon: RefreshCw,
        headline: "에빙하우스 망각곡선 기반 자동 복습 발송",
        desc: "수업이 끝난 뒤가 진짜 시작입니다. 복습 콘텐츠가 자동으로 발송되고, 학부모에게는 수업 결과와 복습 완료 여부가 리포트로 전달됩니다.",
        points: ["자동 복습 알림 및 콘텐츠 발송", "학부모 주간 리포트 자동 생성", "학습 정착률 분석 대시보드"],
    },
]

export function SolutionOverview() {
    const [activeStep, setActiveStep] = useState(0)

    return (
        <section id="solution" className="py-16 md:py-24 bg-[#F6F5F4]">
            <div className="container mx-auto">
                <div className="text-center max-w-3xl mx-auto mb-16 px-4">
                    <span className="inline-block py-1 px-3 rounded-full bg-[#ECFDF5] text-[#084734] text-sm font-semibold mb-4">
                        핵심 기능 3가지
                    </span>
                    <h2 className="text-3xl font-extrabold text-[#111110] sm:text-4xl mb-4 break-keep" style={{ letterSpacing: '-1px' }}>
                        수업 전 · 중 · 후, 전 과정을 시스템으로
                    </h2>
                    <p className="text-lg text-[#615D59] break-keep">
                        준비부터 복습 관리까지. 학원 운영의 전체 사이클을 하나로 연결합니다.
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
                                <span className="inline-block text-xs font-bold text-[#6EE7B7] uppercase tracking-[0.15em] mb-4">
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
