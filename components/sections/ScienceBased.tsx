"use client"

import { Clock, Users } from "lucide-react"
import { motion } from "framer-motion"
import Image from "next/image"

export function ScienceBased() {
    return (
        <section className="py-16 md:py-24 bg-[#111110] overflow-hidden relative">
            {/* Background Texture */}
            <div className="absolute inset-0 bg-[url('/images/noise-texture.svg')] opacity-10 mix-blend-overlay pointer-events-none" />
            <div className="absolute top-1/4 left-0 w-96 h-96 bg-[#084734]/20 blur-[100px] rounded-full pointer-events-none" />
            <div className="absolute bottom-1/4 right-0 w-96 h-96 bg-[#084734]/15 blur-[100px] rounded-full pointer-events-none" />

            <div className="container mx-auto px-6 max-w-6xl relative z-10">
                <motion.div
                    initial={{ opacity: 0, y: 30 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true, margin: "-100px" }}
                    transition={{ duration: 0.6 }}
                    className="text-center mb-24"
                >
                    <h2 className="text-4xl md:text-5xl font-extrabold text-white mb-6 font-sans break-keep" style={{ letterSpacing: '-1.5px' }}>
                        교육적 이론에 최적화된 <br className="md:hidden" />
                        학습 솔루션
                    </h2>
                    <p className="text-xl text-[#A39E98] font-medium break-keep">
                        학습과 수업 참여에 관한 연구를 살펴보고, 현장에 맞는 수업 방식을 고민합니다.
                    </p>
                </motion.div>

                <div className="space-y-20 md:space-y-32">
                    {/* Ebbinghaus Section */}
                    <div className="flex flex-col lg:flex-row items-center gap-8 md:gap-16 lg:gap-24">
                        <motion.div
                            initial={{ opacity: 0, y: 100 }}
                            whileInView={{ opacity: 1, y: 0 }}
                            viewport={{ once: true, margin: "-50px" }}
                            transition={{ duration: 0.8, type: "spring", bounce: 0.2 }}
                            className="w-full lg:w-1/2 relative"
                        >
                            <div className="relative w-full h-72 md:h-[40rem] mx-auto overflow-hidden flex items-end justify-center">
                                <Image
                                    src="/images/ebbinghaus.png"
                                    alt="Hermann Ebbinghaus"
                                    fill
                                    className="object-contain object-bottom scale-100 md:scale-110"
                                />
                                <div className="absolute bottom-0 inset-x-0 h-1/3 bg-gradient-to-t from-[#111110] via-[#111110]/60 to-transparent z-0" />

                                <motion.div
                                    initial={{ opacity: 0, y: 20 }}
                                    whileInView={{ opacity: 1, y: 0 }}
                                    viewport={{ once: true, margin: "-50px" }}
                                    transition={{ duration: 0.8, delay: 0.3 }}
                                    className="absolute bottom-6 left-6 z-10"
                                >
                                    <div className="font-extrabold text-2xl md:text-3xl text-white drop-shadow-xl">Hermann Ebbinghaus</div>
                                    <div className="text-[12px] font-bold text-[#6EE7B7]/80 tracking-[0.3em] mt-1.5 uppercase drop-shadow-md">Memory & Psychology</div>
                                </motion.div>
                            </div>
                        </motion.div>

                        <motion.div
                            initial={{ opacity: 0, x: 50 }}
                            whileInView={{ opacity: 1, x: 0 }}
                            viewport={{ once: true, margin: "-100px" }}
                            transition={{ duration: 0.8, delay: 0.2, type: "spring", bounce: 0.2 }}
                            className="w-full lg:w-1/2 space-y-8"
                        >
                            <div className="flex items-center gap-3">
                                <div className="w-12 h-12 rounded-full bg-[#ECFDF5]/10 flex items-center justify-center text-[#6EE7B7] ring-1 ring-[#6EE7B7]/30">
                                    <Clock className="w-6 h-6" />
                                </div>
                                <h3 className="text-3xl font-bold text-white" style={{ letterSpacing: '-1px' }}>에빙하우스의 망각 곡선</h3>
                            </div>

                            <blockquote className="border-l-4 border-[#6EE7B7]/40 pl-6 py-2 text-xl text-white/70 italic font-medium leading-relaxed bg-gradient-to-r from-[#084734]/10 to-transparent break-keep">
                                망각 곡선 연구는 시간이 지나며 학습한 내용을 다시 익히는 데 드는 노력이 달라지는 과정을 살펴봅니다. 실험 조건을 모든 수업에 그대로 적용할 수는 없습니다.
                            </blockquote>
                            <a href="https://doi.org/10.1371/journal.pone.0120644" target="_blank" rel="noopener noreferrer" className="inline-block text-sm text-[#6EE7B7] underline underline-offset-4">망각 곡선 재현 연구 보기</a>

                            <div className="space-y-4">
                                <h4 className="font-bold text-lg text-white break-keep">
                                    Classin 활용: <span className="text-[#6EE7B7]">수업 녹화와 복습</span>
                                </h4>
                                <p className="text-[#A39E98] leading-relaxed text-lg break-keep">
                                    수업 녹화와 자료를 활용해 학생이 놓친 내용을 다시 살펴볼 수 있습니다. 녹화와 공유 가능 범위는 계정과 수업 설정에 따라 확인해 주세요.
                                </p>
                            </div>

                            <div className="flex gap-3">
                                <span className="px-4 py-1.5 bg-gradient-to-r from-[#2a2925] to-[#2a2925]/80 border border-white/[0.06] text-white/60 text-[13px] font-semibold rounded-full backdrop-blur-sm shadow-[0_1px_6px_rgba(0,0,0,0.2),inset_0_1px_0_rgba(255,255,255,0.04)] tracking-[0.01em]">#즉시복습</span>
                                <span className="px-4 py-1.5 bg-gradient-to-r from-[#2a2925] to-[#2a2925]/80 border border-white/[0.06] text-white/60 text-[13px] font-semibold rounded-full backdrop-blur-sm shadow-[0_1px_6px_rgba(0,0,0,0.2),inset_0_1px_0_rgba(255,255,255,0.04)] tracking-[0.01em]">#장기기억</span>
                            </div>
                        </motion.div>
                    </div>

                    {/* Scott Freeman Section */}
                    <div className="flex flex-col lg:flex-row-reverse items-center gap-8 md:gap-16 lg:gap-24">
                        <motion.div
                            initial={{ opacity: 0, y: 100 }}
                            whileInView={{ opacity: 1, y: 0 }}
                            viewport={{ once: true, margin: "-50px" }}
                            transition={{ duration: 0.8, type: "spring", bounce: 0.2 }}
                            className="w-full lg:w-1/2 relative"
                        >
                            <div className="relative w-full h-72 md:h-[40rem] mx-auto overflow-hidden flex items-end justify-center">
                                <Image
                                    src="/images/scott-freeman.png"
                                    alt="Scott Freeman"
                                    fill
                                    className="object-contain object-bottom scale-100 md:scale-110 translate-y-4"
                                />
                                <div className="absolute bottom-0 inset-x-0 h-1/3 bg-gradient-to-t from-[#111110] via-[#111110]/60 to-transparent z-0" />

                                <motion.div
                                    initial={{ opacity: 0, y: 20 }}
                                    whileInView={{ opacity: 1, y: 0 }}
                                    viewport={{ once: true, margin: "-50px" }}
                                    transition={{ duration: 0.8, delay: 0.3 }}
                                    className="absolute bottom-6 right-6 z-10 text-right"
                                >
                                    <div className="font-extrabold text-2xl md:text-3xl text-white drop-shadow-xl">Scott Freeman</div>
                                    <div className="text-[12px] font-bold text-[#6EE7B7]/80 tracking-[0.3em] mt-1.5 uppercase drop-shadow-md">Biology Education</div>
                                </motion.div>
                            </div>
                        </motion.div>

                        <motion.div
                            initial={{ opacity: 0, x: -50 }}
                            whileInView={{ opacity: 1, x: 0 }}
                            viewport={{ once: true, margin: "-100px" }}
                            transition={{ duration: 0.8, delay: 0.2, type: "spring", bounce: 0.2 }}
                            className="w-full lg:w-1/2 space-y-8"
                        >
                            <div className="flex items-center gap-3">
                                <div className="w-12 h-12 rounded-full bg-[#084734]/10 flex items-center justify-center text-[#6EE7B7] ring-1 ring-[#084734]/30">
                                    <Users className="w-6 h-6" />
                                </div>
                                <h3 className="text-3xl font-bold text-white" style={{ letterSpacing: '-1px' }}>고구조화된 능동적 학습</h3>
                            </div>

                            <blockquote className="border-l-4 border-[#084734]/50 pl-6 py-2 text-xl text-white/70 italic font-medium leading-relaxed bg-gradient-to-r from-[#084734]/5 to-transparent break-keep">
                                대학 과학·기술·공학·수학 수업 연구를 종합한 결과, 전통 강의의 낙제 위험은 능동 학습 수업보다 약 1.5배 높았습니다. 이 연구는 Classin 자체의 효과를 측정한 것은 아닙니다.
                            </blockquote>
                            <a href="https://doi.org/10.1073/pnas.1319030111" target="_blank" rel="noopener noreferrer" className="inline-block text-sm text-[#6EE7B7] underline underline-offset-4">Freeman 등 연구 원문 보기</a>

                            <div className="space-y-4">
                                <h4 className="font-bold text-lg text-white break-keep">
                                    Classin의 솔루션: <span className="text-[#6EE7B7]">참여형 인터랙티브 클래스</span>
                                </h4>
                                <p className="text-[#A39E98] leading-relaxed text-lg break-keep">
                                    발표와 판서 공유 등 수업 도구를 활용해 학생의 참여 기회를 마련할 수 있습니다. 실제 학습 효과는 수업 방식과 환경에 따라 달라집니다.
                                </p>
                            </div>

                            <div className="flex gap-3">
                                <span className="px-4 py-1.5 bg-gradient-to-r from-[#2a2925] to-[#2a2925]/80 border border-white/[0.06] text-white/60 text-[13px] font-semibold rounded-full backdrop-blur-sm shadow-[0_1px_6px_rgba(0,0,0,0.2),inset_0_1px_0_rgba(255,255,255,0.04)] tracking-[0.01em]">#ActiveLearning</span>
                                <span className="px-4 py-1.5 bg-gradient-to-r from-[#2a2925] to-[#2a2925]/80 border border-white/[0.06] text-white/60 text-[13px] font-semibold rounded-full backdrop-blur-sm shadow-[0_1px_6px_rgba(0,0,0,0.2),inset_0_1px_0_rgba(255,255,255,0.04)] tracking-[0.01em]">#참여수업</span>
                            </div>
                        </motion.div>
                    </div>
                </div>
            </div>
        </section>
    )
}
