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
        title: "일관성 없는 수업 품질",
        desc: "강사가 바뀌거나 지점이 늘어날 때마다 수업 품질이 떨어지나요?",
        countTarget: 20,
        countSuffix: "%",
        countLabel: "재등록률 하락",
    },
    {
        icon: Clock,
        title: "과도한 행정 업무",
        desc: "강사들이 수업보다 채점과 리포트 작성에 더 많은 시간을 쓰고 있나요?",
        countTarget: 1200,
        countSuffix: "만원",
        countLabel: "강사 1인당 연간 낭비",
    },
    {
        icon: AlertTriangle,
        title: "느린 강사 적응 속도",
        desc: "신규 강사가 커리큘럼에 적응하는 데 몇 달이 걸리나요?",
        countTarget: 3,
        countSuffix: "개월",
        countLabel: "적응 기간 소요",
    },
]

export function ProblemCost() {
    return (
        <section className="relative py-24 md:py-32 bg-slate-950 overflow-hidden">
            {/* Grid pattern */}
            <div className="absolute inset-0 opacity-[0.03]"
                style={{ backgroundImage: 'linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)', backgroundSize: '60px 60px' }} />

            {/* Red/Orange ambient glow blobs */}
            <div className="absolute top-1/4 left-1/4 w-[500px] h-[500px] bg-red-500/[0.08] rounded-full blur-[60px] animate-blob1" />
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
                    <span className="inline-flex items-center gap-2 py-1.5 px-4 rounded-full bg-red-500/10 border border-red-500/20 text-red-400 text-sm font-semibold mb-6 backdrop-blur-sm">
                        <span className="w-2 h-2 rounded-full bg-red-400 animate-pulse" />
                        주의가 필요합니다
                    </span>
                    <h2 className="text-4xl font-black tracking-tight text-white sm:text-5xl md:text-[3.5rem] mb-6 leading-tight">
                        전통적인 학원 운영의 <br className="md:hidden" />
                        <span className="text-transparent bg-clip-text bg-gradient-to-r from-red-400 to-orange-400">숨겨진 비용</span>
                    </h2>
                    <p className="text-lg text-slate-400">
                        표준화된 시스템 없이는 규모가 커질수록 수익이 아닌 혼란만 늘어납니다.
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
                            <div className="relative h-full md:min-h-[440px] rounded-3xl overflow-hidden group bg-slate-900/60 backdrop-blur-xl border border-slate-800/60 hover:border-red-500/30 transition-all duration-500 shadow-[0_0_0_1px_rgba(255,255,255,0.03)] hover:shadow-[0_0_40px_rgba(239,68,68,0.1)]">
                                {/* Top accent line */}
                                <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-red-500/50 to-transparent group-hover:via-red-400 group-hover:h-0.5 transition-all duration-500" />

                                <div className="pt-10 p-8 flex flex-col items-center text-center h-full">
                                    {/* Icon */}
                                    <div className="relative mb-8">
                                        <div className="absolute inset-0 rounded-full bg-red-500/20 blur-xl opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                                        <div className="relative p-5 rounded-2xl bg-gradient-to-br from-red-500/15 to-orange-500/10 border border-red-500/20 text-red-400 group-hover:from-red-500/25 group-hover:to-orange-500/20 group-hover:text-red-300 group-hover:scale-110 transition-all duration-500">
                                            <pain.icon className="w-10 h-10" strokeWidth={1.5} />
                                        </div>
                                    </div>

                                    <h3 className="text-2xl font-extrabold mb-4 text-white tracking-tight">{pain.title}</h3>
                                    <p className="text-slate-400 mb-8 flex-grow text-lg leading-relaxed">{pain.desc}</p>

                                    {/* Cost footer with counter */}
                                    <div className="w-full pt-6 border-t border-slate-800 mt-auto">
                                        <p className="text-xs font-bold text-red-400/70 uppercase tracking-[0.2em] mb-2">예상 손실</p>
                                        <p className="text-2xl font-black text-transparent bg-clip-text bg-gradient-to-r from-red-400 to-orange-400">
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
                    <div className="bg-slate-900/80 backdrop-blur-xl p-8 md:p-10 rounded-3xl border border-slate-800/60 shadow-[0_0_80px_rgba(239,68,68,0.06)]">
                        {/* Header */}
                        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-8">
                            <div>
                                <h3 className="font-bold text-white text-xl mb-1">운영 리스크 대시보드</h3>
                                <p className="text-slate-500 text-sm">시스템 미도입 학원 평균 데이터</p>
                            </div>
                            <span className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-red-500/15 border border-red-500/30">
                                <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                                <span className="font-bold text-red-400 text-sm">즉시 개선 필요</span>
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
                                    className="relative p-5 rounded-2xl bg-slate-800/50 border border-slate-700/50 group hover:border-slate-600/50 transition-all duration-300"
                                >
                                    <div className="flex items-center justify-between mb-3">
                                        <span className="text-slate-400 text-sm font-medium">{metric.label}</span>
                                        <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                                            metric.color === "red" ? "bg-red-500/15 text-red-400" :
                                            metric.color === "orange" ? "bg-orange-500/15 text-orange-400" :
                                            "bg-yellow-500/15 text-yellow-400"
                                        }`}>
                                            위험
                                        </span>
                                    </div>
                                    <div className="flex items-end gap-1 mb-3">
                                        <span className={`text-4xl font-black ${
                                            metric.color === "red" ? "text-red-400" :
                                            metric.color === "orange" ? "text-orange-400" :
                                            "text-yellow-400"
                                        }`}>
                                            <CountUp target={metric.value} suffix="" />
                                        </span>
                                        <span className="text-slate-500 text-lg font-bold mb-1">%</span>
                                    </div>
                                    {/* Mini bar */}
                                    <div className="h-1.5 bg-slate-700/50 rounded-full overflow-hidden">
                                        <motion.div
                                            initial={{ width: "0%" }}
                                            whileInView={{ width: `${metric.value}%` }}
                                            viewport={{ once: true }}
                                            transition={{ duration: 1.5, delay: 0.8 + i * 0.2, ease: [0.16, 1, 0.3, 1] }}
                                            className={`h-full rounded-full ${
                                                metric.color === "red" ? "bg-gradient-to-r from-red-500 to-red-400" :
                                                metric.color === "orange" ? "bg-gradient-to-r from-orange-500 to-orange-400" :
                                                "bg-gradient-to-r from-yellow-500 to-yellow-400"
                                            }`}
                                        />
                                    </div>
                                    <p className="text-slate-500 text-xs mt-2">{metric.desc}</p>
                                </motion.div>
                            ))}
                        </div>

                        {/* Overall Risk Bar */}
                        <div className="p-5 rounded-2xl bg-slate-800/30 border border-slate-700/30">
                            <div className="flex items-center justify-between mb-3">
                                <span className="text-slate-300 font-semibold text-sm">종합 운영 비효율 지수</span>
                                <span className="text-red-400 font-black text-lg"><CountUp target={85} suffix="%" /></span>
                            </div>
                            <div className="relative h-3 bg-slate-800 rounded-full overflow-hidden">
                                <motion.div
                                    initial={{ width: "0%" }}
                                    whileInView={{ width: "85%" }}
                                    transition={{ duration: 2, ease: [0.16, 1, 0.3, 1] }}
                                    viewport={{ once: true }}
                                    className="h-full bg-gradient-to-r from-yellow-500 via-orange-500 to-red-500 rounded-full relative"
                                >
                                    <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent animate-shimmer bg-[length:200%_100%]" />
                                </motion.div>
                            </div>
                            <p className="text-xs text-slate-500 mt-3 text-center">
                                멀티 지점 학원의 85%가 표준화 시스템 부재로 운영 비효율을 겪고 있습니다
                            </p>
                        </div>
                    </div>
                </motion.div>
            </div>

            {/* Bottom edge line */}
            <div className="absolute bottom-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-red-500/30 to-transparent" />
        </section>
    )
}
