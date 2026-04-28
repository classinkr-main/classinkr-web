"use client"

import { motion } from "framer-motion"
import { MessageCircle, Rocket, Sparkles, Users } from "lucide-react"
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
        duration: "당일 회신",
        title: "상담 신청",
        desc: "기관 규모와 수업 방식을 알려주시면, 전담 매니저가 같은 날 맞춤 플랜으로 회신드립니다.",
        Icon: MessageCircle,
    },
    {
        num: "02",
        duration: "2주 무료",
        title: "2주 무료 체험",
        desc: "설치 없이 브라우저에서 바로 시작. 실제 수업 환경에서 모든 기능을 직접 검증해보세요.",
        Icon: Sparkles,
    },
    {
        num: "03",
        duration: "1–3일",
        title: "팀 온보딩",
        desc: "강사 교육부터 LMS 연동·계정 셋업까지. 전담 온보딩 팀이 1~3일 안에 끝냅니다.",
        Icon: Users,
    },
    {
        num: "04",
        duration: "바로 시작",
        title: "수업 시작",
        desc: "준비는 끝. 첫 수업부터 전담 매니저가 실시간으로 함께하며 안정적인 안착을 지원합니다.",
        Icon: Rocket,
    },
]

export default function OnboardingRoadmap() {
    return (
        <section className="py-24 md:py-32 bg-white">
            <div className="container mx-auto px-4 lg:px-8 max-w-5xl">
                <motion.div className="text-center mb-16" {...fadeUp}>
                    <div className="flex items-center gap-3 mb-4 justify-center">
                        <div className="h-px w-5 bg-[#22A366]/40 shrink-0" />
                        <p className="text-[11px] font-bold text-[#22A366] tracking-[0.2em] uppercase whitespace-nowrap">GET STARTED</p>
                        <div className="h-px w-5 bg-[#22A366]/40 shrink-0" />
                    </div>
                    <h2 className="text-3xl md:text-4xl lg:text-5xl font-serif text-[#1a1a19] leading-tight">
                        복잡한 도입은 끝났습니다,
                        <br />
                        <span className="text-[#22A366]">브라우저만 있으면 시작됩니다</span>
                    </h2>
                    <p className="text-lg text-slate-400 mt-4 max-w-xl mx-auto">
                        별도 설치도, 긴 셋업도 없습니다. 상담받은 그 주, 바로 첫 수업을 시작할 수 있습니다.
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
                                        <div className="w-14 h-14 rounded-full bg-white border border-[#22A366]/30 flex items-center justify-center transition-all duration-200 ease-out group-hover:bg-[#22A366]/[0.08] group-hover:border-[#22A366]/60">
                                            <Icon
                                                className="w-6 h-6 text-[#22A366] transition-transform duration-200 ease-out group-hover:scale-110"
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
