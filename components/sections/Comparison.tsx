"use client"

import { motion } from "framer-motion"
import { Check, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { DemoModal } from "./DemoModal"

const rows = [
    {
        feature: "제품을 보는 기준",
        traditional: "화상회의, 전자칠판, LMS를 각각 따로 비교",
        eduscale: "수업 전·중·후 운영 흐름을 하나의 시스템으로 설계",
    },
    {
        feature: "수업 자료와 판서",
        traditional: "자료를 매번 열고, 판서는 별도로 저장하거나 정리",
        eduscale: "EDB 교안으로 판서·이미지·텍스트를 다시 불러와 활용",
    },
    {
        feature: "전자칠판 활용",
        traditional: "안드로이드 보드, 외장 PC, HDMI, 별도 녹화 프로그램 조합",
        eduscale: "윈도우 기반 OPS와 Classin 소프트웨어가 같은 수업 환경에서 작동",
    },
    {
        feature: "수업 후 관리",
        traditional: "녹화, 과제, 복습 배포, 학생 관리가 도구별로 분리",
        eduscale: "녹화, LMS, 복습 자료, 관리자 데이터가 수업 기준으로 연결",
    },
    {
        feature: "관리자 관점",
        traditional: "선생님 보고와 감에 의존해 수업 상태를 파악",
        eduscale: "권한, 수업 시간, 특이사항, 네트워크 상태 등 운영 데이터를 확인",
    },
    {
        feature: "한계와 연동",
        traditional: "한 제품이 모든 학원 업무를 해결한다고 기대",
        eduscale: "결제·오프라인 출석·고급 리포트는 필요 시 API/외부 시스템으로 분리",
    },
]

export function Comparison() {
    return (
        <section className="py-16 md:py-24 bg-white">
            <div className="container mx-auto px-4 md:px-6">
                <div className="text-center max-w-3xl mx-auto mb-14">
                    <span className="inline-flex items-center gap-2 py-1.5 px-4 rounded-full bg-gradient-to-r from-[#ECFDF5] to-[#D1FAE5]/60 text-[#084734] text-[13px] font-semibold mb-4 border border-[#084734]/8 shadow-[0_2px_8px_rgba(8,71,52,0.06)] tracking-[0.02em]">
                        <span className="w-1 h-1 rounded-full bg-[#084734]/60" />
                        Zoom·전자칠판·LMS와 무엇이 다른가요?
                    </span>
                    <h2 className="text-3xl font-bold text-[#111110] sm:text-4xl mb-4 break-keep" style={{ letterSpacing: '-1px' }}>
                        한 기능의 대체재가 아니라, 수업 시스템 OS
                    </h2>
                    <p className="text-lg text-[#615D59] break-keep">
                        Classin은 화상수업이나 전자칠판 하나만 바꾸는 제품이 아니라 수업 준비, 진행, 녹화, 복습, 관리 데이터를 연결하는 구조입니다.
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
