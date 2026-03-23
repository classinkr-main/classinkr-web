"use client"

import { motion } from "framer-motion"

export function SatisfyingClass() {
    return (
        <section className="py-16 md:py-32 bg-[#F9F8F4] overflow-hidden">
            <div className="container mx-auto px-6 max-w-7xl relative">
                <div className="flex flex-col lg:flex-row items-center justify-between gap-16">
                    {/* Left text area */}
                    <div className="w-full lg:w-2/5 z-10">
                        <motion.h2
                            initial={{ opacity: 0, x: -20 }}
                            whileInView={{ opacity: 1, x: 0 }}
                            viewport={{ once: true }}
                            className="text-5xl md:text-6xl font-black tracking-tighter text-slate-900 mb-6 leading-[1.1] break-keep"
                        >
                            더 수월하게, <br />
                            더 만족감 있는 수업
                        </motion.h2>

                        <motion.p
                            initial={{ opacity: 0, x: -20 }}
                            whileInView={{ opacity: 1, x: 0 }}
                            viewport={{ once: true }}
                            transition={{ delay: 0.1 }}
                            className="text-lg text-slate-700 font-medium leading-relaxed mb-6 break-keep"
                        >
                            Classin은 강사들의 에너지를 서류나 채점에 낭비하지 않도록 돕습니다. 자동화된 AI 보조 교사가 학생별 수준을 분석하고, 수업에 필요한 모든 인터랙티브 자료를 한 번의 클릭으로 세팅합니다.
                        </motion.p>

                        <motion.div
                            initial={{ opacity: 0, x: -20 }}
                            whileInView={{ opacity: 1, x: 0 }}
                            viewport={{ once: true }}
                            transition={{ delay: 0.2 }}
                            className="flex flex-col gap-1"
                        >
                            <span className="font-extrabold text-slate-900 break-keep">핵심 목표:</span>
                            <span className="text-slate-600 font-semibold tracking-tight break-keep">강사의 행정 시간 70% 단축, 온전한 티칭 몰입.</span>
                        </motion.div>
                    </div>

                    {/* Right illustrative area (UI Cards stacked) */}
                    <div className="w-full lg:w-3/5 h-[400px] md:h-[500px] relative pointer-events-none mt-10 lg:mt-0 flex justify-center items-center">

                        {/* AI Grading Card */}
                        <motion.div
                            initial={{ opacity: 0, scale: 0.9, x: 50, rotate: 10 }}
                            whileInView={{ opacity: 1, scale: 1, x: 0, rotate: 6 }}
                            viewport={{ once: true }}
                            transition={{ duration: 0.8, delay: 0.1, type: "spring", bounce: 0.4 }}
                            className="absolute right-[5%] top-[5%] md:top-0 w-60 md:w-72 bg-white rounded-3xl shadow-[0_20px_50px_rgba(0,0,0,0.1)] p-6 border border-slate-100 z-10"
                        >
                            <div className="flex justify-between items-center mb-6">
                                <span className="font-bold text-slate-800 text-lg">AI 채점 요약</span>
                                <span className="bg-red-100 text-red-600 px-3 py-1 rounded-full text-xs font-bold">진행완료</span>
                            </div>
                            <div className="space-y-3">
                                <div className="h-2 bg-slate-100 rounded-full w-full overflow-hidden">
                                    <div className="h-full bg-red-400 w-[85%] rounded-full" />
                                </div>
                                <div className="h-2 bg-slate-100 rounded-full w-full overflow-hidden">
                                    <div className="h-full bg-slate-300 w-[60%] rounded-full" />
                                </div>
                                <div className="h-2 bg-slate-100 rounded-full w-full overflow-hidden">
                                    <div className="h-full bg-slate-300 w-[40%] rounded-full" />
                                </div>
                            </div>
                        </motion.div>

                        {/* Auto Analytics Report Card */}
                        <motion.div
                            initial={{ opacity: 0, y: -50, rotate: -20 }}
                            whileInView={{ opacity: 1, y: 0, rotate: -12 }}
                            viewport={{ once: true }}
                            transition={{ duration: 0.8, delay: 0.2, type: "spring", bounce: 0.4 }}
                            className="absolute left-[5%] top-1/4 w-56 md:w-64 bg-amber-400 rounded-3xl shadow-[0_20px_40px_rgba(251,191,36,0.3)] p-6 border border-amber-300 z-20 text-yellow-950"
                        >
                            <div className="font-black text-xl mb-4">학습 성취도 분석</div>
                            <div className="flex items-end gap-2 h-24 mt-4">
                                <div className="w-1/4 bg-amber-500 rounded-t-lg h-[40%]" />
                                <div className="w-1/4 bg-amber-500 rounded-t-lg h-[60%]" />
                                <div className="w-1/4 bg-amber-500 rounded-t-lg h-[30%]" />
                                <div className="w-1/4 bg-amber-600 rounded-t-lg h-[90%]" />
                            </div>
                        </motion.div>

                        {/* Interactive Whiteboard Card */}
                        <motion.div
                            initial={{ opacity: 0, y: 100, rotate: 5 }}
                            whileInView={{ opacity: 1, y: 0, rotate: -2 }}
                            viewport={{ once: true }}
                            transition={{ duration: 0.8, delay: 0.3, type: "spring", bounce: 0.3 }}
                            className="absolute right-[10%] bottom-0 md:-bottom-10 w-[85%] md:w-[28rem] bg-[#1A1F2C] rounded-[2.5rem] shadow-2xl p-8 border border-slate-700 z-30"
                        >
                            <div className="flex items-center gap-3 mb-6">
                                <div className="w-3 h-3 rounded-full bg-red-400" />
                                <div className="w-3 h-3 rounded-full bg-amber-400" />
                                <div className="w-3 h-3 rounded-full bg-emerald-400" />
                            </div>
                            <div className="text-white">
                                <span className="text-emerald-400 block text-sm tracking-widest uppercase font-extrabold mb-2">Interactive Canvas</span>
                                <h3 className="font-bold text-2xl md:text-3xl leading-snug">
                                    One-Click <br />화이트보드 실행
                                </h3>
                                <div className="mt-8 flex gap-4">
                                    <div className="w-12 h-12 rounded-2xl bg-white/10 border border-white/5 flex items-center justify-center">
                                        <div className="w-6 h-6 border-2 border-emerald-400 rounded-full" />
                                    </div>
                                    <div className="w-12 h-12 rounded-2xl bg-white/10 border border-white/5 flex items-center justify-center">
                                        <div className="w-6 h-6 bg-blue-400 rounded-sm" />
                                    </div>
                                    <div className="w-12 h-12 rounded-2xl bg-white/10 border border-white/5 flex items-center justify-center">
                                        <div className="w-6 h-1 border-t-2 border-b-2 border-amber-400" />
                                    </div>
                                </div>
                            </div>
                        </motion.div>
                    </div>
                </div>
            </div>
        </section>
    )
}
