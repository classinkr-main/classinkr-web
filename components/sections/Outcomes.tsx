"use client"

import { motion } from "framer-motion"
import { Check, X } from "lucide-react"

const comparisons = [
    {
        role: "관리자 (Admins)",
        before: "강사 품질과 학생 이탈 위험에 대한 데이터 부재.",
        after: "자동화된 주간 리포트와 알림으로 모든 지표를 한눈에 파악.",
    },
    {
        role: "강사 (Teachers)",
        before: "채점, 수업 준비, 학부모 상담 문자에 파묻힘.",
        after: "채점과 행정은 AI에 맡기고, 오직 수업과 학생 케어에 100% 집중.",
    },
    {
        role: "학생 (Students)",
        before: "과제 피드백이 늦어져 학습 의욕 저하.",
        after: "즉각적인 피드백 루프로 몰입도 높은 인터랙티브 수업.",
    },
    {
        role: "학부모 (Parents)",
        before: "성적표가 나올 때까지 아이의 상태를 알 수 없음.",
        after: "실시간 업데이트로 아이의 성장 과정을 투명하게 확인.",
    },
]

export function Outcomes() {
    return (
        <section id="outcomes" className="py-16 md:py-24 bg-white">
            <div className="container mx-auto">
                <div className="flex flex-col md:flex-row gap-12 items-center">
                    <div className="w-full md:w-1/3">
                        <h2 className="text-3xl lg:text-4xl font-extrabold tracking-tight mb-6 text-slate-900 break-keep">
                            단순한 관리 도구가 아닙니다.<br />
                            <span className="text-emerald-600">성장 엔진입니다.</span>
                        </h2>
                        <p className="text-slate-500 text-lg mb-8 break-keep">
                            주먹구구식 운영에서 벗어나, 데이터 기반의 확장 가능한 교육 기업으로 성장하세요.
                        </p>
                        <div className="p-6 bg-emerald-50 rounded-xl border border-emerald-100 inline-block">
                            <div className="text-sm text-slate-500 uppercase tracking-wider font-semibold mb-2">평균 절감 시간</div>
                            <div className="text-5xl font-bold text-emerald-600">15시간</div>
                            <div className="text-sm text-slate-500 mt-2">강사 1인당 / 주</div>
                        </div>
                    </div>

                    <div className="w-full md:w-2/3 flex flex-col gap-6">
                        {/* Desktop Table Header */}
                        <div className="hidden md:grid md:grid-cols-2 px-8">
                            <div className="flex items-center gap-3">
                                <div className="p-2 rounded-full bg-slate-100 border border-slate-200">
                                    <X className="w-6 h-6 text-red-400" />
                                </div>
                                <span className="font-extrabold text-2xl text-slate-400 tracking-tight">Before</span>
                            </div>
                            <div className="flex items-center gap-3">
                                <div className="p-2 rounded-full bg-emerald-50 border border-emerald-200">
                                    <Check className="w-6 h-6 text-emerald-600" />
                                </div>
                                <span className="font-extrabold text-2xl text-emerald-600 tracking-tight">After</span>
                            </div>
                        </div>

                        <div className="grid grid-cols-1 gap-5">
                            {comparisons.map((item, index) => (
                                <motion.div
                                    key={index}
                                    initial={{ opacity: 0, y: 20 }}
                                    whileInView={{ opacity: 1, y: 0 }}
                                    transition={{ delay: index * 0.1 }}
                                    viewport={{ once: true }}
                                    className="grid md:grid-cols-2 rounded-2xl overflow-hidden border border-slate-200 bg-white shadow-md"
                                >
                                    {/* Before Card */}
                                    <div className="p-6 md:p-8 flex flex-col justify-center border-b md:border-b-0 md:border-r border-slate-100 hover:bg-slate-50 transition-colors">
                                        <div className="md:hidden flex items-center gap-2 mb-4">
                                            <X className="w-5 h-5 text-red-400" />
                                            <span className="font-bold text-lg text-slate-400 tracking-tight">Before</span>
                                        </div>
                                        <span className="text-slate-400 font-bold text-sm mb-3 uppercase tracking-wider">{item.role}</span>
                                        <p className="text-slate-600 text-lg leading-relaxed break-keep">{item.before}</p>
                                    </div>

                                    {/* After Card */}
                                    <div className="p-6 md:p-8 flex flex-col justify-center relative overflow-hidden bg-gradient-to-br from-emerald-50 to-emerald-50/30 hover:from-emerald-50 hover:to-emerald-100/50 transition-colors">
                                        <div className="absolute left-0 top-0 bottom-0 w-1.5 bg-emerald-500" />
                                        <div className="md:hidden flex items-center gap-2 mb-4">
                                            <Check className="w-5 h-5 text-emerald-600" />
                                            <span className="font-bold text-lg text-emerald-600 tracking-tight">After</span>
                                        </div>
                                        <span className="text-emerald-600 font-bold text-sm mb-3 uppercase tracking-wider">{item.role}</span>
                                        <p className="text-slate-800 text-lg font-medium leading-relaxed break-keep">{item.after}</p>
                                    </div>
                                </motion.div>
                            ))}
                        </div>
                    </div>
                </div>
            </div>
        </section>
    )
}
