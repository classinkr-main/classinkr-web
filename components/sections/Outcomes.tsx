"use client"

import { motion } from "framer-motion"
import { Check, X } from "lucide-react"

const comparisons = [
    {
        role: "관리자 (Admins)",
        before: "강사 품질과 학생 이탈 위험에 대한 데이터 부재.",
        after: "권한에 맞는 수업 기록과 운영 정보를 확인.",
    },
    {
        role: "강사 (Teachers)",
        before: "채점, 수업 준비, 학부모 상담 문자에 파묻힘.",
        after: "수업 자료와 판서를 다시 활용하고 반복 업무를 정리.",
    },
    {
        role: "학생 (Students)",
        before: "과제 피드백이 늦어져 학습 의욕 저하.",
        after: "과제와 수업 자료를 활용해 복습과 피드백을 이어감.",
    },
    {
        role: "학부모 (Parents)",
        before: "성적표가 나올 때까지 아이의 상태를 알 수 없음.",
        after: "수업과 과제 기록을 바탕으로 상담 자료를 준비.",
    },
]

export function Outcomes() {
    return (
        <section id="outcomes" className="py-16 md:py-24 bg-[#F6F5F4]">
            <div className="container mx-auto">
                <div className="flex flex-col md:flex-row gap-12 items-center">
                    <div className="w-full md:w-1/3">
                        <h2 className="text-3xl lg:text-4xl font-extrabold mb-6 text-[#111110] break-keep" style={{ letterSpacing: '-1px' }}>
                            단순한 관리 도구가 아닙니다.<br />
                            <span className="text-[#084734]">성장 엔진입니다.</span>
                        </h2>
                        <p className="text-[#A39E98] text-lg mb-8 break-keep">
                            주먹구구식 운영에서 벗어나, 데이터 기반의 확장 가능한 교육 기업으로 성장하세요.
                        </p>
                        <p className="text-[#615D59] text-base break-keep">
                            수업 준비와 자료 관리, 복습 안내에서 반복되는 일을 살펴보세요.
                        </p>
                    </div>

                    <div className="w-full md:w-2/3 flex flex-col gap-6">
                        {/* Desktop Table Header */}
                        <div className="hidden md:grid md:grid-cols-2 px-8">
                            <div className="flex items-center gap-3">
                                <div className="p-2 rounded-full bg-[#F6F5F4] border border-[rgba(0,0,0,0.08)]">
                                    <X className="w-6 h-6 text-[#B85C33]" />
                                </div>
                                <span className="font-extrabold text-2xl text-[#A39E98]" style={{ letterSpacing: '-1px' }}>Before</span>
                            </div>
                            <div className="flex items-center gap-3">
                                <div className="p-2 rounded-full bg-[#ECFDF5] border border-[rgba(8,71,52,0.12)]">
                                    <Check className="w-6 h-6 text-[#084734]" />
                                </div>
                                <span className="font-extrabold text-2xl text-[#084734]" style={{ letterSpacing: '-1px' }}>After</span>
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
                                    className="grid md:grid-cols-2 rounded-2xl overflow-hidden border border-[rgba(0,0,0,0.08)] bg-white transition-all duration-200 hover:shadow-lg hover:-translate-y-0.5"
                                    style={{ boxShadow: 'rgba(0,0,0,0.04) 0px 4px 18px, rgba(0,0,0,0.027) 0px 2px 7.8px, rgba(0,0,0,0.02) 0px 0.8px 2.9px' }}
                                >
                                    {/* Before Card */}
                                    <div className="p-6 md:p-8 flex flex-col justify-center border-b md:border-b-0 md:border-r border-[rgba(0,0,0,0.05)] hover:bg-[#F6F5F4] transition-colors">
                                        <div className="md:hidden flex items-center gap-2 mb-4">
                                            <X className="w-5 h-5 text-[#B85C33]" />
                                            <span className="font-bold text-lg text-[#A39E98]">Before</span>
                                        </div>
                                        <span className="text-[#A39E98] font-bold text-sm mb-3 uppercase tracking-wider">{item.role}</span>
                                        <p className="text-[#615D59] text-lg leading-relaxed break-keep">{item.before}</p>
                                    </div>

                                    {/* After Card */}
                                    <div className="p-6 md:p-8 flex flex-col justify-center relative overflow-hidden bg-gradient-to-br from-[#ECFDF5] to-[#ECFDF5]/30 hover:from-[#ECFDF5] hover:to-[#ECFDF5]/50 transition-colors">
                                        <div className="absolute left-0 top-0 bottom-0 w-1.5 bg-[#084734]" />
                                        <div className="md:hidden flex items-center gap-2 mb-4">
                                            <Check className="w-5 h-5 text-[#084734]" />
                                            <span className="font-bold text-lg text-[#084734]">After</span>
                                        </div>
                                        <span className="text-[#084734] font-bold text-sm mb-3 uppercase tracking-wider">{item.role}</span>
                                        <p className="text-[#111110] text-lg font-medium leading-relaxed break-keep">{item.after}</p>
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
