"use client"

import { motion } from "framer-motion"

const shifts = [
    {
        before: "경험 많은 강사의 노하우",
        after: "누구나 쓸 수 있는 시스템으로",
        keyword: "표준화",
    },
    {
        before: "수업 후 쌓이는 채점·리포트",
        after: "AI가 처리하는 자동화로",
        keyword: "자동화",
    },
    {
        before: "감으로 운영하던 학원",
        after: "데이터로 결정하는 운영으로",
        keyword: "데이터화",
    },
]

export function EraVision() {
    return (
        <section className="relative py-20 md:py-32 bg-[#FAFAF8] overflow-hidden">
            {/* Subtle grid */}
            <div
                className="absolute inset-0 opacity-[0.025] pointer-events-none"
                style={{
                    backgroundImage:
                        "linear-gradient(rgba(8,71,52,0.5) 1px, transparent 1px), linear-gradient(90deg, rgba(8,71,52,0.5) 1px, transparent 1px)",
                    backgroundSize: "80px 80px",
                }}
            />

            <div className="container mx-auto px-4 relative z-10">
                {/* Top label */}
                <motion.div
                    initial={{ opacity: 0, y: 16 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    transition={{ duration: 0.6 }}
                    className="flex items-center justify-center gap-3 mb-10"
                >
                    <div className="h-px w-12 bg-[#084734]/30" />
                    <span className="text-sm font-bold text-[#084734] uppercase tracking-[0.2em]">
                        New Era of Education
                    </span>
                    <div className="h-px w-12 bg-[#084734]/30" />
                </motion.div>

                {/* Main statement */}
                <div className="text-center max-w-5xl mx-auto mb-20">
                    <motion.h2
                        initial={{ opacity: 0, y: 24 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true }}
                        transition={{ duration: 0.8, delay: 0.05, ease: [0.21, 0.47, 0.32, 0.98] }}
                        className="text-4xl md:text-6xl lg:text-7xl font-black text-[#111110] leading-[1.08] break-keep mb-6"
                        style={{ letterSpacing: '-2.125px' }}
                    >
                        기술과 교육이 만나는<br />
                        <span className="text-[#084734]">새로운 시대</span>가 열렸습니다.
                    </motion.h2>

                    <motion.p
                        initial={{ opacity: 0, y: 16 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true }}
                        transition={{ duration: 0.7, delay: 0.2 }}
                        className="text-lg md:text-xl text-[#615D59] max-w-2xl mx-auto leading-relaxed break-keep"
                    >
                        AI·클라우드·데이터가 모든 산업을 재편한 것처럼,
                        교육도 예외가 아닙니다.<br className="hidden md:block" />
                        이제 학원은 기술을 써야만 살아남는 시대입니다.
                    </motion.p>
                </div>

                {/* Three shifts */}
                <div className="grid md:grid-cols-3 gap-px bg-[rgba(0,0,0,0.06)] rounded-2xl overflow-hidden border border-[rgba(0,0,0,0.06)]">
                    {shifts.map((shift, i) => (
                        <motion.div
                            key={i}
                            initial={{ opacity: 0, y: 20 }}
                            whileInView={{ opacity: 1, y: 0 }}
                            viewport={{ once: true }}
                            transition={{ duration: 0.6, delay: i * 0.1 }}
                            className="bg-white px-8 py-10 flex flex-col gap-5 group hover:bg-[#ECFDF5]/40 transition-colors duration-300"
                        >
                            {/* Keyword badge */}
                            <span className="self-start text-xs font-bold text-[#084734] bg-[#ECFDF5] px-3 py-1 rounded-full tracking-wide">
                                {shift.keyword}
                            </span>

                            {/* Arrow flow */}
                            <div className="space-y-2">
                                <p className="text-[#A39E98] text-base font-medium line-through decoration-[#A39E98]/50 break-keep">
                                    {shift.before}
                                </p>
                                <div className="flex items-center gap-2 text-[#084734]">
                                    <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 16 16">
                                        <path d="M8 3v10M3 8l5 5 5-5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                                    </svg>
                                    <p className="text-[#111110] text-base font-bold break-keep">{shift.after}</p>
                                </div>
                            </div>
                        </motion.div>
                    ))}
                </div>

                {/* Bottom callout */}
                <motion.p
                    initial={{ opacity: 0 }}
                    whileInView={{ opacity: 1 }}
                    viewport={{ once: true }}
                    transition={{ duration: 0.7, delay: 0.4 }}
                    className="text-center text-sm text-[#A39E98] font-medium mt-10 break-keep"
                >
                    Classin은 글로벌 수업 기술을 한국 학원 현장에 맞게 이식합니다.
                </motion.p>
            </div>
        </section>
    )
}
