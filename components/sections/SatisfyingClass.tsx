"use client"

import { motion } from "framer-motion"

const cardShadow = "0 24px 60px rgba(17,17,16,0.08), 0 8px 20px rgba(17,17,16,0.05)"

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
                            className="text-5xl md:text-6xl font-black text-[#111110] mb-6 leading-[1.1] break-keep"
                            style={{ letterSpacing: '-1.5px' }}
                        >
                            더 수월하게, <br />
                            더 만족감 있는 수업
                        </motion.h2>

                        <motion.p
                            initial={{ opacity: 0, x: -20 }}
                            whileInView={{ opacity: 1, x: 0 }}
                            viewport={{ once: true }}
                            transition={{ delay: 0.1 }}
                            className="text-lg text-[#615D59] font-medium leading-relaxed mb-6 break-keep"
                        >
                            Classin은 강사들의 에너지를 서류나 채점에 낭비하지 않도록 돕습니다. AI 채점 요약, 성취도 분석, 자동 녹화와 학부모 리포트까지 수업 전후 운영을 하나의 흐름으로 연결하고, 필요한 인터랙티브 자료는 한 번의 클릭으로 바로 세팅합니다.
                        </motion.p>

                        <motion.div
                            initial={{ opacity: 0, x: -20 }}
                            whileInView={{ opacity: 1, x: 0 }}
                            viewport={{ once: true }}
                            transition={{ delay: 0.2 }}
                            className="flex flex-col gap-1"
                        >
                            <span className="font-extrabold text-[#111110] break-keep">핵심 목표:</span>
                            <span className="text-[#615D59] font-semibold break-keep">강사의 행정 시간 70% 단축, 온전한 티칭 몰입.</span>
                        </motion.div>
                    </div>

                    {/* Right illustrative area (stacked UI cards) */}
                    <div className="w-full lg:w-3/5 h-[460px] sm:h-[520px] md:h-[590px] relative pointer-events-none mt-10 lg:mt-0 flex justify-center items-center">
                        <div className="relative h-full w-full max-w-[44rem]">
                            <div className="absolute left-[10%] top-[7%] h-44 w-44 rounded-full bg-[#D9F4E7] opacity-70 blur-[76px]" />
                            <div className="absolute right-[6%] bottom-[10%] h-48 w-48 rounded-full bg-[#EDE7DC] opacity-70 blur-[90px]" />

                            <motion.div
                                initial={{ opacity: 0, scale: 0.94, x: 58, y: -28, rotate: 10 }}
                                whileInView={{ opacity: 1, scale: 1, x: 0, y: 0, rotate: 5 }}
                                viewport={{ once: true }}
                                transition={{ duration: 0.82, delay: 0.08, type: "spring", bounce: 0.22 }}
                                className="absolute right-[1%] top-[1%] z-10 w-[44%] min-w-[12rem] max-w-[18.5rem] rounded-[2rem] border border-[rgba(17,17,16,0.08)] bg-white p-5 md:p-6"
                                style={{ boxShadow: cardShadow }}
                            >
                                <div className="mb-5 flex items-center justify-between gap-3">
                                    <span className="text-base font-black text-[#111110] md:text-lg">AI 채점 요약</span>
                                    <span className="rounded-full bg-[#ECFDF5] px-3 py-1 text-[10px] font-extrabold text-[#084734] md:text-[11px]">첨삭완료</span>
                                </div>
                                <div className="space-y-3">
                                    <div>
                                        <div className="mb-1.5 flex items-center justify-between text-[11px] font-semibold text-[#615D59]">
                                            <span>객관식 정확도</span>
                                            <span>92%</span>
                                        </div>
                                        <div className="h-2 overflow-hidden rounded-full bg-[#F6F5F4]">
                                            <div className="h-full w-[84%] rounded-full bg-[#0E5B42]" />
                                        </div>
                                    </div>
                                    <div>
                                        <div className="mb-1.5 flex items-center justify-between text-[11px] font-semibold text-[#615D59]">
                                            <span>서술형 재검토</span>
                                            <span>4건</span>
                                        </div>
                                        <div className="h-2 overflow-hidden rounded-full bg-[#F6F5F4]">
                                            <div className="h-full w-[58%] rounded-full bg-[#A39E98]" />
                                        </div>
                                    </div>
                                    <div>
                                        <div className="mb-1.5 flex items-center justify-between text-[11px] font-semibold text-[#615D59]">
                                            <span>오답 개념 정리</span>
                                            <span>자동</span>
                                        </div>
                                        <div className="h-2 overflow-hidden rounded-full bg-[#F6F5F4]">
                                            <div className="h-full w-[40%] rounded-full bg-[#D6D2CC]" />
                                        </div>
                                    </div>
                                </div>
                            </motion.div>

                            <motion.div
                                initial={{ opacity: 0, scale: 0.95, x: -64, y: -24, rotate: -16 }}
                                whileInView={{ opacity: 1, scale: 1, x: 0, y: 0, rotate: -10 }}
                                viewport={{ once: true }}
                                transition={{ duration: 0.82, delay: 0.14, type: "spring", bounce: 0.22 }}
                                className="absolute left-[0%] top-[15%] z-20 w-[40%] min-w-[11rem] max-w-[16rem] rounded-[2.2rem] border border-[rgba(255,255,255,0.08)] bg-[#084734] p-5 text-white md:p-6"
                                style={{ boxShadow: cardShadow }}
                            >
                                <div className="mb-2 text-[11px] font-bold uppercase tracking-[0.22em] text-white/55">Today&apos;s Analytics</div>
                                <div className="text-lg font-black leading-tight md:text-[1.75rem]">학습 성취도 분석</div>
                                <div className="mt-5 flex h-24 items-end gap-2">
                                    <div className="flex-1 rounded-t-xl bg-white/40" style={{ height: "38%" }} />
                                    <div className="flex-1 rounded-t-xl bg-white/45" style={{ height: "56%" }} />
                                    <div className="flex-1 rounded-t-xl bg-white/32" style={{ height: "44%" }} />
                                    <div className="flex-1 rounded-t-xl bg-white" style={{ height: "86%" }} />
                                </div>
                                <div className="mt-3 grid grid-cols-4 text-[10px] font-bold tracking-[0.18em] text-white/55">
                                    <span>기초</span>
                                    <span>응용</span>
                                    <span>서술</span>
                                    <span>복습</span>
                                </div>
                            </motion.div>

                            <motion.div
                                initial={{ opacity: 0, scale: 0.94, x: -34, y: 52, rotate: -2 }}
                                whileInView={{ opacity: 1, scale: 1, x: 0, y: 0, rotate: 4 }}
                                viewport={{ once: true }}
                                transition={{ duration: 0.82, delay: 0.18, type: "spring", bounce: 0.2 }}
                                className="absolute bottom-[2%] left-[0%] z-10 w-[40%] min-w-[11rem] max-w-[16rem] rounded-[2rem] border border-[rgba(8,71,52,0.1)] bg-[#EAF5EF] p-5 md:p-6"
                                style={{ boxShadow: cardShadow }}
                            >
                                <div className="mb-4 flex items-center justify-between gap-3">
                                    <span className="text-sm font-black text-[#084734] md:text-base">주간 리포트 자동 발송</span>
                                    <span className="rounded-full bg-white/85 px-2.5 py-1 text-[10px] font-extrabold text-[#084734]">매주 금</span>
                                </div>
                                <div className="mb-4 flex flex-wrap gap-2">
                                    <span className="rounded-full bg-white px-2.5 py-1 text-[10px] font-bold text-[#084734]">출결</span>
                                    <span className="rounded-full bg-white px-2.5 py-1 text-[10px] font-bold text-[#084734]">과제</span>
                                    <span className="rounded-full bg-white px-2.5 py-1 text-[10px] font-bold text-[#084734]">참여도</span>
                                </div>
                                <div className="space-y-2.5">
                                    <div className="h-2 rounded-full bg-white/80" />
                                    <div className="h-2 w-[82%] rounded-full bg-white/80" />
                                    <div className="h-2 w-[60%] rounded-full bg-white/80" />
                                </div>
                            </motion.div>

                            <motion.div
                                initial={{ opacity: 0, scale: 0.94, x: 56, y: 30, rotate: 14 }}
                                whileInView={{ opacity: 1, scale: 1, x: 0, y: 0, rotate: 8 }}
                                viewport={{ once: true }}
                                transition={{ duration: 0.82, delay: 0.24, type: "spring", bounce: 0.2 }}
                                className="absolute bottom-[8%] right-[0%] z-20 w-[37%] min-w-[10.5rem] max-w-[14.5rem] rounded-[2rem] border border-[rgba(17,17,16,0.08)] bg-[#F4F1EC] p-5 md:p-6"
                                style={{ boxShadow: cardShadow }}
                            >
                                <div className="mb-3 flex items-center gap-2 text-[11px] font-extrabold uppercase tracking-[0.18em] text-[#B85C33]">
                                    <span className="h-2.5 w-2.5 rounded-full bg-[#E05024]" />
                                    Auto Recording
                                </div>
                                <div className="text-base font-black leading-tight text-[#111110] md:text-lg">자동 녹화 수업</div>
                                <p className="mt-2 text-sm font-medium leading-relaxed text-[#615D59]">
                                    수업 종료 후 클라우드 저장, 다시보기 링크까지 자동 정리
                                </p>
                                <div className="mt-4 flex flex-wrap gap-2">
                                    <span className="rounded-full bg-white px-2.5 py-1 text-[10px] font-bold text-[#615D59]">복습 링크</span>
                                    <span className="rounded-full bg-white px-2.5 py-1 text-[10px] font-bold text-[#615D59]">결석생 공유</span>
                                </div>
                            </motion.div>

                            <motion.div
                                initial={{ opacity: 0, scale: 0.96, x: 28, y: 86, rotate: 3 }}
                                whileInView={{ opacity: 1, scale: 1, x: 0, y: 0, rotate: -2 }}
                                viewport={{ once: true }}
                                transition={{ duration: 0.88, delay: 0.3, type: "spring", bounce: 0.18 }}
                                className="absolute left-[19%] top-[32%] z-30 w-[72%] min-w-[17rem] max-w-[25.75rem] rounded-[2.75rem] border border-[rgba(255,255,255,0.08)] bg-[#111110] p-7 md:left-[21%] md:w-[66%] md:min-w-[18.5rem] md:p-8"
                                style={{ boxShadow: "0 32px 80px rgba(17,17,16,0.18), 0 12px 28px rgba(17,17,16,0.12)" }}
                            >
                                <div className="mb-6 flex items-center gap-3">
                                    <div className="h-3 w-3 rounded-full bg-[#B85C33]" />
                                    <div className="h-3 w-3 rounded-full bg-amber-400" />
                                    <div className="h-3 w-3 rounded-full bg-[#6EE7B7]" />
                                </div>
                                <div className="text-white">
                                    <span className="mb-2.5 block text-[12px] font-bold uppercase tracking-[0.3em] text-[#ECFDF5]/70">Interactive Canvas</span>
                                    <h3 className="text-2xl font-bold leading-snug md:text-3xl">
                                        One-Click <br />화이트보드 실행
                                    </h3>
                                    <p className="mt-4 max-w-xs text-sm font-medium leading-relaxed text-white/58 md:text-[15px]">
                                        판서, 퀴즈, 자료 공유까지 수업 시작 전에 한 번에 준비
                                    </p>
                                    <div className="mt-8 flex gap-4">
                                        <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-white/5 bg-white/10">
                                            <div className="h-6 w-6 rounded-full border border-[#ECFDF5]" />
                                        </div>
                                        <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-white/5 bg-white/10">
                                            <div className="h-6 w-6 rounded-sm bg-[#084734]" />
                                        </div>
                                        <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-white/5 bg-white/10">
                                            <div className="h-1 w-6 border-y-2 border-white/60" />
                                        </div>
                                    </div>
                                </div>
                            </motion.div>
                        </div>
                    </div>
                </div>
            </div>
        </section>
    )
}
