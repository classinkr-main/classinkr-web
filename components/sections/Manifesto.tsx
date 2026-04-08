"use client"

import { motion } from "framer-motion"

const lines = [
    { text: "수업은", delay: 0 },
    { text: "선생님 개인기가", delay: 0.15 },
    { text: "아닙니다.", delay: 0.3, accent: true },
]

export function Manifesto() {
    return (
        <section className="relative py-28 md:py-40 bg-[#111110] overflow-hidden">
            {/* Subtle green ambient */}
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-[#084734]/8 rounded-full blur-[120px] pointer-events-none" />

            <div className="container mx-auto relative z-10 px-4 text-center">
                {/* Big statement */}
                <div className="mb-16 md:mb-20">
                    {lines.map((line, i) => (
                        <motion.div
                            key={i}
                            initial={{ opacity: 0, y: 24 }}
                            whileInView={{ opacity: 1, y: 0 }}
                            viewport={{ once: true }}
                            transition={{ duration: 0.8, delay: line.delay, ease: [0.21, 0.47, 0.32, 0.98] }}
                        >
                            <span
                                className={`block text-5xl md:text-7xl lg:text-8xl font-black leading-[1.1] break-keep ${
                                    line.accent
                                        ? "text-transparent bg-clip-text bg-gradient-to-r from-[#6EE7B7] to-[#34d399]"
                                        : "text-white"
                                }`}
                                style={{ letterSpacing: '-2.125px' }}
                            >
                                {line.text}
                            </span>
                        </motion.div>
                    ))}
                </div>

                {/* Bridge sentence */}
                <motion.p
                    initial={{ opacity: 0, y: 20 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    transition={{ duration: 0.7, delay: 0.55 }}
                    className="text-xl md:text-2xl text-white/50 max-w-2xl mx-auto leading-relaxed font-light break-keep"
                >
                    에이스 강사의 수업 방식을 시스템으로 만들어,<br className="hidden md:block" />
                    모든 반, 모든 지점에 그대로 적용합니다.
                </motion.p>

                {/* Divider dots */}
                <motion.div
                    initial={{ opacity: 0 }}
                    whileInView={{ opacity: 1 }}
                    viewport={{ once: true }}
                    transition={{ duration: 0.6, delay: 0.8 }}
                    className="flex items-center justify-center gap-3 mt-16"
                >
                    {[0, 1, 2].map((i) => (
                        <div
                            key={i}
                            className="w-1.5 h-1.5 rounded-full bg-[#084734]"
                            style={{ opacity: 1 - i * 0.25 }}
                        />
                    ))}
                </motion.div>
            </div>
        </section>
    )
}
