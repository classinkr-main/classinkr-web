"use client"

import { m } from "framer-motion"
import { ArrowRight, BarChart3, FileText, Video } from "lucide-react"

import { fadeUp, stagger } from "@/components/motion/presets"

export default function AnalyticsSection() {
    return (
        <>
            {/* ================================================================
                관리 & 분석 (multiple charts, animated progress, floating tags)
            ================================================================ */}
            <section className="py-24 md:py-32">
                <div className="container mx-auto px-4 lg:px-8">
                    <div className="flex flex-col lg:flex-row items-center gap-16 lg:gap-20 max-w-7xl mx-auto">
                        <div className="flex-1 max-w-xl">
                            <m.div {...fadeUp}>
                                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#084734]/5 text-[#084734] text-sm font-bold mb-6"><BarChart3 className="w-4 h-4" />데이터 & LMS</div>
                                <h2 className="text-3xl md:text-5xl font-sans text-[#1a1a19] mb-6 leading-tight">수업이 끝나도<br /><span className="text-[#084734]">학습은 계속됩니다</span></h2>
                                <p className="text-lg text-slate-500 leading-relaxed font-medium mb-10">자동 녹화, 학습 데이터 분석, 숙제·출결·평가까지. 수업 전후의 모든 학사 행정을 하나의 플랫폼에서.</p>
                            </m.div>
                            <div className="space-y-5">
                                {[
                                    { icon: <Video className="w-5 h-5" />, label: "자동 녹화 · 복습", detail: "수업 종료 후 클라우드에 자동 저장. 학생이 언제든 다시 볼 수 있습니다." },
                                    { icon: <BarChart3 className="w-5 h-5" />, label: "학습 데이터 리포트", detail: "집중도, 발언 횟수, 참여 시간을 데이터로. 학부모 상담이 객관적으로 바뀝니다." },
                                    { icon: <FileText className="w-5 h-5" />, label: "LMS 올인원", detail: "숙제 제출, 평가, 출결 관리 — 별도 LMS 없이 Classin 안에서 모두 해결." },
                                ].map((f, i) => (
                                    <m.div key={i} {...stagger(i)} className="flex items-center gap-4 bg-white border border-[rgba(0,0,0,0.06)] rounded-xl p-4 shadow-[0_1px_4px_rgba(0,0,0,0.04)] hover:shadow-[0_4px_18px_rgba(0,0,0,0.07)] hover:border-[rgba(8,71,52,0.15)] transition-all group">
                                        <div className="w-11 h-11 rounded-xl bg-[#ECFDF5] border border-[rgba(34,163,102,0.15)] text-[#084734] flex items-center justify-center shrink-0">{f.icon}</div>
                                        <div className="flex-1 min-w-0"><h4 className="font-bold text-slate-900 mb-0.5 text-sm">{f.label}</h4><p className="text-xs text-slate-500 leading-relaxed">{f.detail}</p></div>
                                        <ArrowRight className="w-4 h-4 text-slate-200 group-hover:text-[#22A366]/40 shrink-0 transition-colors" />
                                    </m.div>
                                ))}
                            </div>
                        </div>

                        {/* Analytics mockup — enhanced */}
                        <div className="flex-1 w-full max-w-lg relative">
                            <m.div {...fadeUp}>
                                <div className="bg-[#1a1a19] p-6 sm:p-10 rounded-[2rem] shadow-2xl relative overflow-hidden">
                                    <div className="flex justify-between items-end mb-8">
                                        <div>
                                            <div className="text-slate-400 text-sm font-medium mb-1">이번 달 종합 성취도</div>
                                            <div className="text-white text-3xl font-sans font-bold tabular-nums">상위 15%</div>
                                        </div>
                                    </div>

                                    {/* Bar chart */}
                                    <div className="h-44 flex items-end justify-between gap-3 border-b border-slate-700/50 pb-4 mb-4 relative">
                                        <div className="absolute w-full border-b border-dashed border-slate-700/30 top-1/2 -translate-y-1/2"></div>
                                        {[30, 45, 60, 50, 75, 90, 85].map((h, i) => (
                                            <m.div key={i} initial={{ height: 0 }} whileInView={{ height: `${h}%` }} viewport={{ once: true }} transition={{ delay: 0.3 + i * 0.1, duration: 0.8, type: "spring" }} className="w-full bg-gradient-to-t from-[#084734]/20 to-[#6EE7B7] rounded-t-md relative z-10 group">
                                                <div className="absolute -top-6 left-1/2 -translate-x-1/2 text-[9px] font-sans tabular-nums text-[#6EE7B7] opacity-0 group-hover:opacity-100 transition-opacity">{h}%</div>
                                            </m.div>
                                        ))}
                                    </div>
                                    <div className="flex justify-between text-slate-500 text-[10px] font-sans tabular-nums px-1 mb-6">
                                        <span>W1</span><span>W2</span><span>W3</span><span>W4</span><span>W5</span><span>W6</span><span>W7</span>
                                    </div>

                                    {/* Mini stat row */}
                                    <div className="grid grid-cols-3 gap-3">
                                        {[
                                            { label: "집중도", value: "87%", color: "text-green-400" },
                                            { label: "발언", value: "12회", color: "text-[#6EE7B7]" },
                                            { label: "참여 시간", value: "48분", color: "text-[#084734]" },
                                        ].map((s, i) => (
                                            <div key={i} className="bg-white/5 rounded-xl p-3 text-center">
                                                <div className={`text-lg font-sans font-bold tabular-nums ${s.color}`}>{s.value}</div>
                                                <div className="text-[10px] text-slate-500">{s.label}</div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </m.div>

                            {/* Floating A+ badge with animated circle */}
                            <m.div animate={{ y: [0, 12, 0] }} transition={{ repeat: Infinity, duration: 5 }} className="absolute -left-4 md:-left-8 -bottom-6 w-24 h-24 bg-white rounded-3xl shadow-xl flex items-center justify-center border border-slate-100 p-3 z-20">
                                <div className="relative w-full h-full flex items-center justify-center">
                                    <svg className="absolute w-full h-full transform -rotate-90" viewBox="0 0 100 100">
                                        <circle cx="50" cy="50" r="40" stroke="#e2e8f0" strokeWidth="4" fill="none" />
                                        <m.circle cx="50" cy="50" r="40" stroke="#2563EB" strokeWidth="4" fill="none" strokeLinecap="round" strokeDasharray="251" initial={{ strokeDashoffset: 251 }} whileInView={{ strokeDashoffset: 63 }} viewport={{ once: true }} transition={{ duration: 1.5, delay: 0.5, ease: "easeOut" }} />
                                    </svg>
                                    <div className="font-bold text-slate-800 text-xl">A+</div>
                                </div>
                            </m.div>

                            {/* Floating data tags */}
                            <m.div initial={{ opacity: 0 }} whileInView={{ opacity: 1 }} viewport={{ once: true }} transition={{ delay: 1 }} className="absolute -right-2 md:-right-6 top-8 bg-white rounded-xl shadow-lg border border-slate-100 px-3 py-2 z-20 animate-float-tag">
                                <div className="text-[10px] text-slate-400">집중도</div>
                                <div className="text-sm font-sans font-bold tabular-nums text-green-500">87%</div>
                            </m.div>
                        </div>
                    </div>
                </div>
            </section>
        </>
    )
}
