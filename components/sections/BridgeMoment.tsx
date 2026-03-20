"use client"

import { useEffect, useRef, useState } from "react"
import { motion, useInView } from "framer-motion"
import { ArrowRight } from "lucide-react"

function CountUp({ target, suffix = "", prefix = "", decimals = 0 }: { target: number; suffix?: string; prefix?: string; decimals?: number }) {
    const ref = useRef<HTMLSpanElement>(null)
    const isInView = useInView(ref, { once: true })
    const [count, setCount] = useState(0)

    useEffect(() => {
        if (!isInView) return
        const duration = 2000
        const startTime = performance.now()
        const multiplier = Math.pow(10, decimals)
        const scaledTarget = Math.round(target * multiplier)
        let lastValue = 0
        const step = (currentTime: number) => {
            const elapsed = currentTime - startTime
            const progress = Math.min(elapsed / duration, 1)
            const eased = 1 - Math.pow(1 - progress, 3)
            const newValue = Math.floor(eased * scaledTarget)
            if (newValue !== lastValue) {
                lastValue = newValue
                setCount(newValue)
            }
            if (progress < 1) requestAnimationFrame(step)
        }
        requestAnimationFrame(step)
    }, [isInView, target, decimals])

    const displayValue = decimals > 0 ? (count / Math.pow(10, decimals)).toFixed(decimals) : count

    return <span ref={ref}>{prefix}{displayValue}{suffix}</span>
}

const stats = [
    { value: 38, suffix: "%", prefix: "+", label: "매출 성장", decimals: 0 },
    { value: 15, suffix: "시간", prefix: "", label: "주당 절감 시간", decimals: 0 },
    { value: 4.8, suffix: "점", prefix: "", label: "학부모 만족도", decimals: 1 },
]

export function BridgeMoment() {
    return (
        <section className="relative py-20 md:py-28 bg-gradient-to-b from-emerald-50/60 via-white to-emerald-50/40 overflow-hidden">
            {/* Radial glow */}
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[600px] bg-emerald-100/40 rounded-full blur-[150px]" />

            {/* Dot pattern */}
            <div className="absolute inset-0 opacity-[0.06]"
                style={{ backgroundImage: 'radial-gradient(#064e3b 1px, transparent 1px)', backgroundSize: '32px 32px' }} />

            <div className="container mx-auto px-4 md:px-6 relative z-10">
                <motion.div
                    initial={{ opacity: 0, y: 40, scale: 0.97 }}
                    whileInView={{ opacity: 1, y: 0, scale: 1 }}
                    transition={{ duration: 0.8, ease: [0.21, 0.47, 0.32, 0.98] }}
                    viewport={{ once: true }}
                    className="relative max-w-5xl mx-auto"
                >
                    {/* Outer glow ring */}
                    <div className="absolute -inset-px rounded-3xl bg-gradient-to-r from-emerald-200/50 via-emerald-300/30 to-emerald-200/50 blur-sm" />

                    <div className="relative rounded-3xl overflow-hidden bg-white/80 backdrop-blur-2xl border border-emerald-100 shadow-[0_8px_60px_rgba(16,185,129,0.08)]">
                        {/* Inner glow at top */}
                        <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-emerald-400/40 to-transparent" />

                        <div className="relative z-10 p-8 md:p-16">
                            {/* Top section: Question + Answer */}
                            <div className="flex flex-col md:flex-row items-center gap-8 md:gap-12">
                                {/* Left: Question */}
                                <div className="flex-1 text-center md:text-left min-w-0">
                                    <motion.p
                                        initial={{ opacity: 0, y: 10 }}
                                        whileInView={{ opacity: 1, y: 0 }}
                                        viewport={{ once: true }}
                                        transition={{ delay: 0.2 }}
                                        className="text-emerald-600/70 text-sm font-semibold uppercase tracking-[0.25em] mb-4"
                                    >
                                        상상해 보세요
                                    </motion.p>

                                    <motion.h2
                                        initial={{ opacity: 0, y: 15 }}
                                        whileInView={{ opacity: 1, y: 0 }}
                                        viewport={{ once: true }}
                                        transition={{ delay: 0.3, duration: 0.7 }}
                                        className="text-3xl md:text-4xl lg:text-[2.75rem] font-black text-slate-900 leading-[1.3] tracking-tight"
                                    >
                                        <span className="text-emerald-600">10개 지점</span> 관리가<br />
                                        <span className="text-emerald-600">1개 지점</span>처럼 느껴진다면?
                                    </motion.h2>
                                </div>

                                {/* Divider - animated arrow */}
                                <div className="hidden md:flex items-center shrink-0">
                                    <motion.div
                                        animate={{ x: [0, 8, 0] }}
                                        transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
                                    >
                                        <ArrowRight className="w-10 h-10 text-emerald-300" />
                                    </motion.div>
                                </div>

                                {/* Right: Answer */}
                                <div className="flex-1 text-center md:text-left min-w-0">
                                    <motion.p
                                        initial={{ opacity: 0, y: 15 }}
                                        whileInView={{ opacity: 1, y: 0 }}
                                        viewport={{ once: true }}
                                        transition={{ delay: 0.4 }}
                                        className="text-slate-600 text-lg md:text-xl leading-relaxed"
                                    >
                                        하나의 플랫폼, 하나의 기준으로<br className="hidden md:block" />
                                        모든 지점이 최고 효율로 운영됩니다.
                                    </motion.p>
                                </div>
                            </div>

                            {/* Divider line */}
                            <div className="my-8 md:my-10 h-px bg-gradient-to-r from-transparent via-emerald-200 to-transparent" />

                            {/* Bottom: Stats */}
                            <motion.div
                                initial={{ opacity: 0, y: 20 }}
                                whileInView={{ opacity: 1, y: 0 }}
                                viewport={{ once: true }}
                                transition={{ delay: 0.5 }}
                                className="grid grid-cols-3 gap-4 md:gap-6"
                            >
                                {stats.map((stat, i) => (
                                    <motion.div
                                        key={i}
                                        initial={{ opacity: 0, y: 20 }}
                                        whileInView={{ opacity: 1, y: 0 }}
                                        viewport={{ once: true }}
                                        transition={{ delay: 0.6 + i * 0.15 }}
                                        className="relative p-5 md:p-6 rounded-2xl bg-emerald-50/60 border border-emerald-100 hover:bg-emerald-50 transition-colors duration-300 text-center"
                                    >
                                        <div className="text-3xl md:text-5xl font-black text-emerald-600 mb-2">
                                            <CountUp target={stat.value} prefix={stat.prefix} suffix={stat.suffix} decimals={stat.decimals} />
                                        </div>
                                        <div className="text-slate-500 text-xs md:text-sm font-medium tracking-wider">{stat.label}</div>
                                    </motion.div>
                                ))}
                            </motion.div>
                        </div>
                    </div>
                </motion.div>
            </div>

            {/* Bottom edge line */}
            <div className="absolute bottom-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-emerald-200 to-transparent" />
        </section>
    )
}
