"use client"

import { motion } from "framer-motion"
import { GraduationCap, MessageCircle, Ruler, Wrench } from "lucide-react"
import type { LucideIcon } from "lucide-react"

const fadeUp = {
    initial: { opacity: 0, y: 30 },
    whileInView: { opacity: 1, y: 0 },
    viewport: { once: true },
    transition: { duration: 0.6 },
}

type Step = {
    num: string
    duration: string
    title: string
    desc: string
    Icon: LucideIcon
}

const steps: Step[] = [
    {
        num: "01",
        duration: "당일 상담",
        title: "문의 · 상담",
        desc: "공간 규모와 목적을 알려주시면 최적 모델과 구성을 제안합니다",
        Icon: MessageCircle,
    },
    {
        num: "02",
        duration: "현장 방문",
        title: "현장 실측 · 견적",
        desc: "전문 설치팀이 방문하여 공간 실측 후 정확한 맞춤 견적을 드립니다",
        Icon: Ruler,
    },
    {
        num: "03",
        duration: "1일 완료",
        title: "설치 (1일 완료)",
        desc: "하루 안에 설치 완료. 수업 중단을 최소화하고 즉시 사용할 수 있습니다",
        Icon: Wrench,
    },
    {
        num: "04",
        duration: "2시간 교육",
        title: "교사 교육 (2시간)",
        desc: "현장 교육 2시간으로 모든 기능을 즉시 활용할 수 있도록 안내합니다",
        Icon: GraduationCap,
    },
]

export default function OnboardingRoadmap() {
    return (
        <section className="py-24 md:py-32 bg-[#FDFCF8]">
            <div className="container mx-auto px-4 lg:px-8 max-w-5xl">
                <motion.div className="text-center mb-16" {...fadeUp}>
                    <div className="flex items-center gap-3 mb-4 justify-center">
                        <div className="h-px w-5 bg-[#22A366]/40 shrink-0" />
                        <p className="text-[11px] font-bold text-[#22A366] tracking-[0.2em] uppercase whitespace-nowrap">HOW TO START</p>
                        <div className="h-px w-5 bg-[#22A366]/40 shrink-0" />
                    </div>
                    <h2 className="text-3xl md:text-4xl lg:text-5xl text-[#1a1a19] leading-tight">
                        수업의 격을 높이는 차원이 다른 스펙,
                        <br />
                        <span className="text-[#22A366]">가장 먼저 우리 학원에서 만나보세요</span>
                    </h2>
                    <p className="text-lg text-slate-400 mt-4 max-w-xl mx-auto">
                        단순한 기기 도입을 넘어 수업의 격을 바꿉니다.
                        <br className="hidden sm:block" />
                        전문 상담을 통해 학원 규모와 목적에 최적화된 솔루션을 제안해 드립니다.
                    </p>
                </motion.div>

                <div className="relative">
                    {/* Connecting line — desktop only */}
                    <div className="hidden lg:block absolute top-7 left-[12%] right-[12%] h-px pointer-events-none">
                        <div className="absolute inset-0 border-t border-dashed border-[#22A366]/15" />
                        <motion.div
                            className="absolute inset-0 border-t border-[#22A366]/50"
                            style={{ transformOrigin: "left" }}
                            initial={{ scaleX: 0 }}
                            whileInView={{ scaleX: 1 }}
                            viewport={{ once: true, margin: "-100px" }}
                            transition={{ duration: 1.2, ease: "easeOut" }}
                        />
                    </div>

                    <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-8">
                        {steps.map((step, i) => {
                            const { Icon } = step
                            return (
                                <motion.div
                                    key={step.num}
                                    initial={{ opacity: 0, y: 25 }}
                                    whileInView={{ opacity: 1, y: 0 }}
                                    viewport={{ once: true }}
                                    transition={{ delay: i * 0.12, duration: 0.5 }}
                                    className="group flex flex-col items-center text-center"
                                >
                                    <div className="relative mb-5 z-10 shrink-0">
                                        <div className="w-14 h-14 rounded-full bg-white border border-[#22A366]/30 text-[#22A366] flex items-center justify-center transition-all duration-200 ease-out group-hover:scale-105 group-hover:bg-[#22A366] group-hover:border-[#22A366] group-hover:text-white group-hover:shadow-[0_10px_24px_rgba(34,163,102,0.22)]">
                                            <Icon
                                                className="w-6 h-6 transition-transform duration-200 ease-out group-hover:scale-110"
                                                strokeWidth={1.75}
                                            />
                                        </div>
                                        <span className="absolute -top-1 -right-1 w-6 h-6 rounded-full bg-[#22A366] text-white text-[10px] font-bold tabular-nums flex items-center justify-center shadow-sm">
                                            {step.num}
                                        </span>
                                    </div>
                                    <span className="inline-block bg-[#ECFDF5] border border-[rgba(34,163,102,0.2)] text-[#22A366] text-[10px] font-bold px-3 py-1 rounded-full mb-3 tracking-wide">
                                        {step.duration}
                                    </span>
                                    <h3 className="text-base font-bold text-slate-900 mb-2">{step.title}</h3>
                                    <p className="text-sm text-slate-500 leading-relaxed">{step.desc}</p>
                                </motion.div>
                            )
                        })}
                    </div>
                </div>
            </div>
        </section>
    )
}
