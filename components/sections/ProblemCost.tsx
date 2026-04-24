"use client"

import { useEffect, useRef, useState } from "react"
import { motion, useInView } from "framer-motion"
import { AlertTriangle, Clock, TrendingDown } from "lucide-react"

function CountUp({ target, suffix = "", prefix = "" }: { target: number; suffix?: string; prefix?: string }) {
    const ref = useRef<HTMLSpanElement>(null)
    const isInView = useInView(ref, { once: true })
    const [count, setCount] = useState(0)

    useEffect(() => {
        if (!isInView) return
        const duration = 2000
        const startTime = performance.now()
        let lastValue = 0
        const step = (currentTime: number) => {
            const elapsed = currentTime - startTime
            const progress = Math.min(elapsed / duration, 1)
            const eased = 1 - Math.pow(1 - progress, 3)
            const newValue = Math.floor(eased * target)
            if (newValue !== lastValue) {
                lastValue = newValue
                setCount(newValue)
            }
            if (progress < 1) requestAnimationFrame(step)
        }
        requestAnimationFrame(step)
    }, [isInView, target])

    return <span ref={ref}>{prefix}{count}{suffix}</span>
}

const pains = [
    {
        icon: TrendingDown,
        title: "에이스 강사가 퇴사했습니다.",
        desc: "그 반 학생 20명은요? 커리큘럼은요? 다음 강사가 같은 수준으로 가르칠 수 있을까요?",
        countTarget: 20,
        countSuffix: "%",
        countLabel: "강사 이탈 후 재등록률 하락",
    },
    {
        icon: Clock,
        title: "같은 교재, 같은 시간.",
        desc: "근데 반마다 성적이 다릅니다. 원장님은 어떤 반이 문제인지, 왜 그런지 알고 계신가요?",
        countTarget: 1200,
        countSuffix: "만원",
        countLabel: "수업 품질 편차로 인한 연간 손실",
    },
    {
        icon: AlertTriangle,
        title: "학부모 상담마다 같은 질문.",
        desc: "\"복습은 어떻게 하나요?\" — 이 질문에 매번 직접 답하는 대신, 데이터로 보여줄 수 있다면요?",
        countTarget: 3,
        countSuffix: "개월",
        countLabel: "신규 강사 적응 기간",
    },
]

export function ProblemCost() {
    return (
        <section className="relative py-16 md:py-32 bg-[#111110] overflow-hidden">
            {/* Grid pattern */}
            <div className="absolute inset-0 opacity-[0.03]"
                style={{ backgroundImage: 'linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)', backgroundSize: '60px 60px' }} />

            {/* Amber/terracotta ambient glow blobs */}
            <div className="absolute top-1/4 left-1/4 w-[500px] h-[500px] bg-[#B85C33]/[0.08] rounded-full blur-[60px] animate-blob1" />
            <div className="absolute bottom-1/4 right-1/4 w-[400px] h-[400px] bg-orange-500/[0.06] rounded-full blur-[60px] animate-blob2" />

            {/* Noise texture */}
            <div className="absolute inset-0 bg-[url('/images/noise-texture.svg')] opacity-15 mix-blend-overlay pointer-events-none" />

            <div className="container mx-auto relative z-10">
                {/* Title */}
                <motion.div
                    initial={{ opacity: 0, y: 40 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    transition={{ duration: 0.7 }}
                    className="text-center max-w-3xl mx-auto mb-20 px-4"
                >
                    <span className="inline-flex items-center gap-2 py-1.5 px-4 rounded-full bg-[#B85C33]/10 border border-[#B85C33]/20 text-[#F6D5C5] text-sm font-semibold mb-6 backdrop-blur-sm">
                        <span className="w-2 h-2 rounded-full bg-[#F6D5C5] animate-pulse" />
                        원장님, 이 질문들을 받아본 적 있으신가요
                    </span>
                    <h2 className="text-4xl font-black text-white sm:text-5xl md:text-[3.5rem] mb-6 leading-tight break-keep" style={{ letterSpacing: '-1.5px' }}>
                        강사에 기대는 학원은<br className="md:hidden" />{" "}
                        <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#B85C33] to-[#F6D5C5] break-keep">흔들릴 수 밖에 없습니다</span>
                    </h2>
                    <p className="text-lg text-[#A39E98] break-keep">
                        시스템 없이 사람에만 의존하면, 잘 될 때도 있지만 한 명이 빠지면 학원 전체가 흔들립니다.
                    </p>
                </motion.div>

                {/* Cards */}
                <div className="grid md:grid-cols-3 gap-6 md:gap-8">
                    {pains.map((pain, index) => (
                        <motion.div
                            key={index}
                            initial={{ opacity: 0, y: 50, scale: 0.95 }}
                            whileInView={{ opacity: 1, y: 0, scale: 1 }}
                            transition={{ delay: index * 0.2, duration: 0.7, type: "spring", bounce: 0.15 }}
                            viewport={{ once: true }}
                            className="h-full"
                        >
                            <div className="relative h-full md:min-h-[440px] rounded-3xl overflow-hidden group bg-[#1C1B1A]/60 backdrop-blur-xl border border-white/[0.08] hover:border-[#B85C33]/30 transition-all duration-500 shadow-[0_0_0_1px_rgba(255,255,255,0.03)] hover:shadow-[0_0_40px_rgba(184,92,51,0.1)]">
                                {/* Top accent line */}
                                <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-[#B85C33]/50 to-transparent group-hover:via-[#B85C33] group-hover:h-0.5 transition-all duration-500" />

                                <div className="pt-10 p-8 flex flex-col items-center text-center h-full">
                                    {/* Icon */}
                                    <div className="relative mb-8">
                                        <div className="absolute inset-0 rounded-full bg-[#B85C33]/20 blur-xl opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                                        <div className="relative p-5 rounded-2xl bg-gradient-to-br from-[#B85C33]/15 to-[#9A4A27]/10 border border-[#B85C33]/20 text-[#F6D5C5] group-hover:from-[#B85C33]/25 group-hover:to-[#9A4A27]/20 group-hover:text-white group-hover:scale-110 transition-all duration-500">
                                            <pain.icon className="w-10 h-10" strokeWidth={1.5} />
                                        </div>
                                    </div>

                                    <h3 className="text-2xl font-extrabold mb-4 text-white break-keep" style={{ letterSpacing: '-0.25px' }}>{pain.title}</h3>
                                    <p className="text-[#A39E98] mb-8 flex-grow text-lg leading-relaxed break-keep">{pain.desc}</p>

                                    {/* Cost footer with counter */}
                                    <div className="w-full pt-6 border-t border-white/[0.08] mt-auto">
                                        <p className="text-xs font-bold text-[#F6D5C5]/70 uppercase tracking-[0.2em] mb-2">예상 손실</p>
                                        <p className="text-2xl font-black text-transparent bg-clip-text bg-gradient-to-r from-[#B85C33] to-[#F6D5C5]">
                                            <CountUp target={pain.countTarget} suffix={pain.countSuffix} /> {pain.countLabel}
                                        </p>
                                    </div>
                                </div>
                            </div>
                        </motion.div>
                    ))}
                </div>

                {/* Risk Dashboard */}
                <motion.div
                    initial={{ opacity: 0, y: 30 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    transition={{ delay: 0.5, duration: 0.7 }}
                    className="mt-20 mx-auto max-w-4xl"
                >
                    <div className="bg-[#1C1B1A]/80 backdrop-blur-xl p-8 md:p-10 rounded-3xl border border-white/[0.08] shadow-[0_0_80px_rgba(184,92,51,0.06)]">
                        {/* Header */}
                        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-8">
                            <div>
                                <h3 className="font-bold text-white text-xl mb-1">운영 리스크 대시보드</h3>
                                <p className="text-white/40 text-sm">시스템 미도입 학원 평균 데이터</p>
                            </div>
                            <span className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-[#B85C33]/15 border border-[#B85C33]/30">
                                <span className="w-2 h-2 rounded-full bg-[#B85C33] animate-pulse" />
                                <span className="font-bold text-[#F6D5C5] text-sm">즉시 개선 필요</span>
                            </span>
                        </div>

                        {/* Metric Cards */}
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
                            {[
                                { label: "데이터 파편화", value: 85, color: "red", desc: "지점 간 정보 단절" },
                                { label: "강사 이탈률", value: 42, color: "orange", desc: "연간 평균 퇴사율" },
                                { label: "학부모 불만", value: 67, color: "yellow", desc: "소통 부재 관련" },
                            ].map((metric, i) => (
                                <motion.div
                                    key={i}
                                    initial={{ opacity: 0, scale: 0.9 }}
                                    whileInView={{ opacity: 1, scale: 1 }}
                                    viewport={{ once: true }}
                                    transition={{ delay: 0.6 + i * 0.15 }}
                                    className="relative p-5 rounded-2xl bg-[#2a2925]/50 border border-white/[0.08] group hover:border-white/[0.15] transition-all duration-300"
                                >
                                    <div className="flex items-center justify-between mb-3">
                                        <span className="text-[#A39E98] text-sm font-medium">{metric.label}</span>
                                        <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                                            metric.color === "red" ? "bg-[#B85C33]/15 text-[#F6D5C5]" :
                                            metric.color === "orange" ? "bg-orange-500/15 text-orange-400" :
                                            "bg-yellow-500/15 text-yellow-400"
                                        }`}>
                                            위험
                                        </span>
                                    </div>
                                    <div className="flex items-end gap-1 mb-3">
                                        <span className={`text-4xl font-black ${
                                            metric.color === "red" ? "text-[#F6D5C5]" :
                                            metric.color === "orange" ? "text-orange-400" :
                                            "text-yellow-400"
                                        }`}>
                                            <CountUp target={metric.value} suffix="" />
                                        </span>
                                        <span className="text-white/40 text-lg font-bold mb-1">%</span>
                                    </div>
                                    {/* Mini bar */}
                                    <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
                                        <motion.div
                                            initial={{ width: "0%" }}
                                            whileInView={{ width: `${metric.value}%` }}
                                            viewport={{ once: true }}
                                            transition={{ duration: 1.5, delay: 0.8 + i * 0.2, ease: [0.16, 1, 0.3, 1] }}
                                            className={`h-full rounded-full ${
                                                metric.color === "red" ? "bg-gradient-to-r from-[#B85C33] to-[#F6D5C5]" :
                                                metric.color === "orange" ? "bg-gradient-to-r from-orange-500 to-orange-400" :
                                                "bg-gradient-to-r from-yellow-500 to-yellow-400"
                                            }`}
                                        />
                                    </div>
                                    <p className="text-white/40 text-xs mt-2">{metric.desc}</p>
                                </motion.div>
                            ))}
                        </div>

                        {/* Overall Risk Bar */}
                        <div className="p-5 rounded-2xl bg-[#2a2925]/30 border border-white/[0.08]">
                            <div className="flex items-center justify-between mb-3">
                                <span className="text-white/70 font-semibold text-sm">종합 운영 비효율 지수</span>
                                <span className="text-[#F6D5C5] font-black text-lg"><CountUp target={85} suffix="%" /></span>
                            </div>
                            <div className="relative h-3 bg-white/10 rounded-full overflow-hidden">
                                <motion.div
                                    initial={{ width: "0%" }}
                                    whileInView={{ width: "85%" }}
                                    transition={{ duration: 2, ease: [0.16, 1, 0.3, 1] }}
                                    viewport={{ once: true }}
                                    className="h-full bg-gradient-to-r from-yellow-500 via-orange-500 to-[#B85C33] rounded-full relative"
                                >
                                    <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent animate-shimmer bg-[length:200%_100%]" />
                                </motion.div>
                            </div>
                            <p className="text-xs text-white/40 mt-3 text-center">
                                멀티 지점 학원의 85%가 표준화 시스템 부재로 운영 비효율을 겪고 있습니다
                            </p>
                        </div>
                    </div>
                </motion.div>
            </div>

            {/* Bottom edge line */}
            <div className="absolute bottom-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-[#B85C33]/30 to-transparent" />
        </section>
    )
}
