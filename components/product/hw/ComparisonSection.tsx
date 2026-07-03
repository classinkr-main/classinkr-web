"use client"

import { m, useInView } from "framer-motion"
import { useRef } from "react"

import { fadeUp } from "@/components/motion/presets"

/* ── Section: Comparison ─────────────────────────────────────────── */
export default function ComparisonSection() {
    const ref = useRef(null)
    const inView = useInView(ref, { once: true, margin: "-100px" })

    const items = [
        {
            title: "기존 칠판",
            problems: ["분필 날림, 건강 우려", "지우면 영원히 사라짐", "공유 불가능"],
            bg: "bg-slate-100",
            border: "border-slate-200",
            iconColor: "text-slate-400",
        },
        {
            title: "일반 전자칠판",
            problems: ["필기감 부자연스러움", "소프트웨어 별도 구매", "단순 화면 출력 장치"],
            bg: "bg-slate-50",
            border: "border-slate-200",
            iconColor: "text-slate-400",
        },
        {
            title: "Classin Board",
            problems: ["분필처럼 자연스럽고, 지워도 남는다", "SW 생태계 완전 통합", "시공간을 넘는 교육 연결"],
            bg: "bg-[#F0FFF4]",
            border: "border-[#22A366]/20",
            iconColor: "text-[#22A366]",
            highlight: true,
        },
    ]

    return (
        <section className="py-24 md:py-32 bg-white">
            <div className="container mx-auto px-4 lg:px-8">
                <m.div className="text-center mb-16" {...fadeUp}>
                    <p className="text-sm font-semibold text-[#22A366] tracking-wider uppercase mb-3">Why Classin Board</p>
                    <h2 className="text-3xl md:text-4xl lg:text-5xl text-[#1a1a19] leading-tight">
                        도구를 바꾸는 게 아니라,
                        <br className="hidden sm:block" />{" "}
                        <span className="text-[#22A366]">교육의 방식</span>을 바꿉니다
                    </h2>
                </m.div>

                <div ref={ref} className="grid md:grid-cols-3 gap-6 max-w-5xl mx-auto">
                    {items.map((item, i) => (
                        <m.div
                            key={i}
                            initial={{ opacity: 0, y: 40 }}
                            animate={inView ? { opacity: 1, y: 0 } : {}}
                            transition={{ duration: 0.5, delay: i * 0.15 }}
                            className={`rounded-2xl border ${item.border} ${item.bg} p-6 sm:p-8 ${item.highlight ? "ring-2 ring-[#22A366]/20 shadow-lg shadow-[#22A366]/5 md:scale-[1.02]" : ""}`}
                        >
                            <h3 className={`text-xl font-bold mb-6 ${item.highlight ? "text-[#22A366]" : "text-slate-900"}`}>
                                {item.title}
                            </h3>
                            <ul className="space-y-4">
                                {item.problems.map((p, j) => (
                                    <li key={j} className="flex items-start gap-3">
                                        <div className={`mt-0.5 ${item.iconColor}`}>
                                            {item.highlight ? (
                                                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                                                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                                </svg>
                                            ) : (
                                                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                                    <path strokeLinecap="round" strokeLinejoin="round" d="M18 12H6" />
                                                </svg>
                                            )}
                                        </div>
                                        <span className={`text-sm leading-relaxed ${item.highlight ? "text-slate-700 font-medium" : "text-slate-500"}`}>{p}</span>
                                    </li>
                                ))}
                            </ul>
                        </m.div>
                    ))}
                </div>
            </div>
        </section>
    )
}
