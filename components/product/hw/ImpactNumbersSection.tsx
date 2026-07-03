"use client"

import { m, useInView } from "framer-motion"
import { useRef } from "react"

/* ── Section: Impact Numbers (Full-width dark) ───────────────────── */
export default function ImpactNumbersSection() {
    const ref = useRef(null)
    const inView = useInView(ref, { once: true, margin: "-50px" })

    const stats = [
        { value: "1,200+", label: "도입 학교·기관", sub: "국내외 교육 현장" },
        { value: "35,000+", label: "활성 교사", sub: "매일 수업에 활용 중" },
        { value: "12개국", label: "글로벌 교육 시장", sub: "아시아·유럽·미주" },
    ]

    return (
        <section ref={ref} className="bg-[#0d1a12] relative overflow-hidden">
            <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_60%_at_50%_50%,_rgba(34,163,102,0.13)_0%,_transparent_100%)]" />
            <div className="container mx-auto px-4 lg:px-8 py-20 md:py-28 relative">
                <div className="grid md:grid-cols-3 divide-y md:divide-y-0 md:divide-x divide-white/8">
                    {stats.map((s, i) => (
                        <m.div
                            key={i}
                            initial={{ opacity: 0, y: 24 }}
                            animate={inView ? { opacity: 1, y: 0 } : {}}
                            transition={{ duration: 0.6, delay: i * 0.15 }}
                            className="py-12 md:py-0 md:px-16 text-center"
                        >
                            <div className="text-5xl md:text-6xl lg:text-7xl font-sans font-bold tabular-nums tracking-tight text-white leading-none mb-3">
                                {s.value}
                            </div>
                            <div className="text-xs font-bold text-[#22A366] uppercase tracking-[0.2em] mb-2">{s.label}</div>
                            <div className="text-sm text-white/35">{s.sub}</div>
                        </m.div>
                    ))}
                </div>
            </div>
        </section>
    )
}
