"use client"

import { motion } from "framer-motion"

export function Manifesto() {
    return (
        <section className="relative py-24 md:py-36 bg-[#111110] overflow-hidden">
            {/* Green ambient glow */}
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-[#084734]/10 rounded-full blur-[140px] pointer-events-none" />

            {/* Full-width — no container constraint */}
            <div className="relative z-10 px-6 md:px-12 text-center">

                {/* Line 1 */}
                <motion.div
                    initial={{ opacity: 0, y: 32 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    transition={{ duration: 0.85, ease: [0.21, 0.47, 0.32, 0.98] }}
                >
                    <span
                        className="block font-black text-white leading-[1.05] break-keep"
                        style={{ fontSize: 'clamp(3rem, 8.5vw, 8.5rem)', letterSpacing: '-0.05em' }}
                    >
                        수업은 선생님
                    </span>
                </motion.div>

                {/* Line 2 */}
                <motion.div
                    initial={{ opacity: 0, y: 32 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    transition={{ duration: 0.85, delay: 0.12, ease: [0.21, 0.47, 0.32, 0.98] }}
                >
                    <span
                        className="block font-black text-white leading-[1.05] break-keep"
                        style={{ fontSize: 'clamp(3rem, 8.5vw, 8.5rem)', letterSpacing: '-0.05em' }}
                    >
                        개인기가
                    </span>
                </motion.div>

                {/* Line 3 — accent */}
                <motion.div
                    initial={{ opacity: 0, y: 32 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    transition={{ duration: 0.85, delay: 0.24, ease: [0.21, 0.47, 0.32, 0.98] }}
                    className="mb-16 md:mb-20"
                >
                    <span
                        className="block font-black leading-[1.05] break-keep text-transparent bg-clip-text bg-gradient-to-r from-[#6EE7B7] to-[#34d399]"
                        style={{ fontSize: 'clamp(3rem, 8.5vw, 8.5rem)', letterSpacing: '-0.05em' }}
                    >
                        아닙니다.
                    </span>
                </motion.div>

                {/* Bridge sentence */}
                <motion.p
                    initial={{ opacity: 0, y: 20 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    transition={{ duration: 0.7, delay: 0.45 }}
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
                    transition={{ duration: 0.6, delay: 0.7 }}
                    className="flex items-center justify-center gap-3 mt-14"
                >
                    {[0, 1, 2].map((i) => (
                        <div
                            key={i}
                            className="w-1.5 h-1.5 rounded-full bg-[#6EE7B7]"
                            style={{ opacity: 1 - i * 0.3 }}
                        />
                    ))}
                </motion.div>
            </div>
        </section>
    )
}
