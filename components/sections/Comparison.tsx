"use client"

import { motion } from "framer-motion"
import { Check, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { DemoModal } from "./DemoModal"

const rows = [
    {
        feature: "교사 행정 업무 시간",
        traditional: "교사당 주 10시간 이상",
        eduscale: "2시간 미만 — AI가 처리",
    },
    {
        feature: "성과 가시성",
        traditional: "학기 말 성적표만 제공",
        eduscale: "모든 이해관계자를 위한 실시간 대시보드",
    },
    {
        feature: "신규 지점 확장",
        traditional: "지점당 수개월의 수동 세팅",
        eduscale: "48시간 이내 새 지점 배포",
    },
    {
        feature: "학부모 소통",
        traditional: "수동 이메일, 일관성 부족",
        eduscale: "자동 주간 리포트, 수고 제로",
    },
    {
        feature: "신규 교사 온보딩",
        traditional: "적응 기간 3개월 이상",
        eduscale: "표준화된 플레이북 — 며칠 내 투입",
    },
    {
        feature: "수업 품질 일관성",
        traditional: "개별 교사 역량에 의존",
        eduscale: "전 지점 통합 커리큘럼 적용",
    },
]

export function Comparison() {
    return (
        <section className="py-16 md:py-24 bg-white">
            <div className="container mx-auto px-4 md:px-6">
                <div className="text-center max-w-3xl mx-auto mb-14">
                    <span className="inline-flex items-center gap-2 py-1.5 px-4 rounded-full bg-gradient-to-r from-[#ECFDF5] to-[#D1FAE5]/60 text-[#084734] text-[13px] font-semibold mb-4 border border-[#084734]/8 shadow-[0_2px_8px_rgba(8,71,52,0.06)] tracking-[0.02em]">
                        <span className="w-1 h-1 rounded-full bg-[#084734]/60" />
                        Zoom·구글 클래스룸과 무엇이 다른가요?
                    </span>
                    <h2 className="text-3xl font-bold text-[#111110] sm:text-4xl mb-4 break-keep" style={{ letterSpacing: '-1px' }}>
                        회의 도구가 아닌, 수업 전용 플랫폼
                    </h2>
                    <p className="text-lg text-[#615D59] break-keep">
                        Classin은 처음부터 교실 수업을 위해 설계되었습니다. 차이는 명확합니다.
                    </p>
                </div>

                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.6 }}
                    viewport={{ once: true }}
                    className="max-w-4xl mx-auto overflow-hidden rounded-2xl border border-[rgba(0,0,0,0.08)] bg-white transition-all duration-200 hover:shadow-lg hover:-translate-y-0.5"
                    style={{ boxShadow: 'rgba(0,0,0,0.04) 0px 4px 18px, rgba(0,0,0,0.027) 0px 2px 7.8px, rgba(0,0,0,0.02) 0px 0.8px 2.9px' }}
                >
                    {/* Table Header */}
                    <div className="grid grid-cols-1 md:grid-cols-3 bg-[#111110] text-white text-sm font-semibold">
                        <div className="py-4 px-6 text-[#A39E98] text-xs uppercase tracking-wider">영역</div>
                        <div className="py-4 px-6 md:border-l border-[rgba(255,255,255,0.1)] flex items-center gap-2">
                            <X className="w-4 h-4 text-[#A39E98]" />
                            기존 방식
                        </div>
                        <div className="py-4 px-6 md:border-l border-[rgba(255,255,255,0.1)] flex items-center gap-2 text-[#6EE7B7]">
                            <Check className="w-4 h-4 text-green-400" />
                            Classin 도입 후
                        </div>
                    </div>

                    {/* Table Rows */}
                    {rows.map((row, index) => (
                        <motion.div
                            key={index}
                            initial={{ opacity: 0, x: -10 }}
                            whileInView={{ opacity: 1, x: 0 }}
                            transition={{ delay: index * 0.07, duration: 0.4 }}
                            viewport={{ once: true }}
                            className={`grid grid-cols-1 md:grid-cols-3 text-sm border-t border-[rgba(0,0,0,0.05)] ${index % 2 === 0 ? "bg-white" : "bg-[#F6F5F4]/60"}`}
                        >
                            <div className="py-4 px-6 font-semibold text-[#615D59] flex items-center break-keep">
                                {row.feature}
                            </div>
                            <div className="py-4 px-6 md:border-l border-[rgba(0,0,0,0.05)] text-[#A39E98] flex items-start gap-2 break-keep">
                                <X className="w-3.5 h-3.5 text-[#A39E98] mt-0.5 shrink-0" />
                                {row.traditional}
                            </div>
                            <div className="py-4 px-6 md:border-l border-[rgba(0,0,0,0.05)] text-[#111110] font-medium flex items-start gap-2 break-keep">
                                <Check className="w-3.5 h-3.5 text-green-500 mt-0.5 shrink-0" />
                                {row.eduscale}
                            </div>
                        </motion.div>
                    ))}
                </motion.div>

                {/* Soft CTA */}
                <div className="text-center mt-10">
                    <p className="text-[#A39E98] mb-4 text-sm">전환할 준비가 되셨나요?</p>
                    <DemoModal trackingButton="comparison_demo">
                        <Button size="lg" className="px-8">
                            무료 데모 신청하기
                        </Button>
                    </DemoModal>
                </div>
            </div>
        </section>
    )
}
