"use client"

import { useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { BookOpen, Video, CheckSquare, BarChart, MessageCircle } from "lucide-react"
import { cn } from "@/lib/utils"

const steps = [
    {
        id: 1,
        title: "기획 (Plan)",
        icon: BookOpen,
        desc: "커리큘럼을 중앙화하세요. 모든 강사가 접근 가능한 표준 수업 계획을 만드세요.",
    },
    {
        id: 2,
        title: "수업 (Teach)",
        icon: Video,
        desc: "화이트보드와 참여 도구가 내장된 라이브/하이브리드 수업을 진행하세요.",
    },
    {
        id: 3,
        title: "평가 (Assess)",
        icon: CheckSquare,
        desc: "과제와 퀴즈를 자동으로 배정하고, AI가 즉시 채점합니다.",
    },
    {
        id: 4,
        title: "분석 (Analyze)",
        icon: BarChart,
        desc: "모든 학생, 반, 지점의 성과 대시보드를 실시간으로 확인하세요.",
    },
    {
        id: 5,
        title: "코칭 (Coach)",
        icon: MessageCircle,
        desc: "학생과 학부모에게 데이터 기반의 피드백을 제공하세요. 결과가 자동으로 전달됩니다.",
    },
]

export function SolutionOverview() {
    const [activeStep, setActiveStep] = useState(0)

    return (
        <section id="solution" className="py-24 bg-white">
            <div className="container mx-auto">
                <div className="text-center max-w-3xl mx-auto mb-20">
                    <h2 className="text-3xl font-extrabold tracking-tight text-slate-900 sm:text-4xl mb-4">
                        모든 학원 업무를 하나의 흐름으로
                    </h2>
                    <p className="text-lg text-muted-foreground">
                        수업 준비부터 학부모 리포트까지, 전체 라이프사이클을 효율화합니다.
                    </p>
                </div>

                <div className="flex flex-col lg:flex-row gap-12 items-center justify-center">
                    {/* Steps Pipeline */}
                    <div className="flex flex-col md:flex-row lg:flex-col gap-4 relative w-full lg:w-1/3">
                        <div className="absolute left-8 top-8 bottom-8 w-0.5 bg-slate-100 hidden lg:block" />
                        <div className="absolute top-8 left-8 right-8 h-0.5 bg-slate-100 hidden md:block lg:hidden" />

                        {steps.map((step, index) => (
                            <button
                                key={index}
                                onClick={() => setActiveStep(index)}
                                className={cn(
                                    "relative flex items-center gap-4 p-4 rounded-xl text-left transition-all duration-300 border-2",
                                    activeStep === index
                                        ? "bg-white border-primary shadow-lg scale-105 z-10"
                                        : "bg-transparent border-transparent hover:bg-slate-50 opacity-70 hover:opacity-100"
                                )}
                            >
                                <div
                                    className={cn(
                                        "w-12 h-12 rounded-full flex items-center justify-center shrink-0 transition-colors",
                                        activeStep === index
                                            ? "bg-primary text-primary-foreground"
                                            : "bg-slate-100 text-slate-500"
                                    )}
                                >
                                    <step.icon className="w-5 h-5" />
                                </div>
                                <div>
                                    <h3 className={cn("font-bold text-lg", activeStep === index ? "text-primary" : "text-slate-700")}>
                                        {step.title}
                                    </h3>
                                </div>
                            </button>
                        ))}
                    </div>

                    {/* Active Step Showcase */}
                    <div className="w-full lg:w-1/2 aspect-video relative rounded-2xl border bg-slate-900 overflow-hidden shadow-2xl p-8 flex items-center justify-center">
                        <AnimatePresence mode="wait">
                            <motion.div
                                key={activeStep}
                                initial={{ opacity: 0, x: 20 }}
                                animate={{ opacity: 1, x: 0 }}
                                exit={{ opacity: 0, x: -20 }}
                                transition={{ duration: 0.3 }}
                                className="text-center"
                            >
                                <div className="w-20 h-20 mx-auto bg-slate-800 rounded-full flex items-center justify-center mb-6 text-[#CEF17B]">
                                    {(() => {
                                        const Icon = steps[activeStep].icon
                                        return <Icon className="w-10 h-10" />
                                    })()}
                                </div>
                                <h3 className="text-2xl font-bold text-white mb-4">{steps[activeStep].title}</h3>
                                <p className="text-slate-300 text-lg leading-relaxed max-w-md mx-auto">
                                    {steps[activeStep].desc}
                                </p>
                            </motion.div>
                        </AnimatePresence>

                        {/* Background Effects */}
                        <div className="absolute inset-0 bg-gradient-to-br from-blue-500/10 via-transparent to-transparent pointer-events-none" />
                    </div>
                </div>
            </div>
        </section>
    )
}
