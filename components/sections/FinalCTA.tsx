"use client"

import { Button } from "@/components/ui/button"
import { BROCHURE_URL } from "@/lib/marketing-links"
import { DemoModal } from "./DemoModal"
import { NewsletterModal } from "./NewsletterModal"
import { ArrowRight, FileText } from "lucide-react"

export function FinalCTA() {
    return (
        <section className="py-16 md:py-32 relative overflow-hidden bg-[#111110]">
            {/* Background Effects */}
            <div className="absolute inset-0 bg-gradient-to-br from-[#084734] to-[#111110] opacity-90" />
            <div className="absolute inset-0 bg-[url('/images/noise-texture.svg')] opacity-20 mix-blend-overlay pointer-events-none" />
            <div className="absolute top-0 right-0 w-[800px] h-[800px] bg-primary/30 rounded-full blur-[120px] pointer-events-none translate-x-1/2 -translate-y-1/2" />

            <div className="container mx-auto relative z-10 text-center">
                <span className="inline-flex items-center gap-2.5 py-2 px-5 rounded-full bg-white/[0.06] text-[#6EE7B7] text-sm font-semibold mb-6 border border-white/[0.08] backdrop-blur-md shadow-[0_2px_20px_rgba(110,231,183,0.08),inset_0_1px_0_rgba(255,255,255,0.06)]">
                    <span className="relative flex h-2 w-2">
                        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#6EE7B7]/30" />
                        <span className="relative inline-flex h-2 w-2 rounded-full bg-[#6EE7B7]" />
                    </span>
                    <span className="tracking-[0.04em]">무료 컨설팅 제공</span>
                </span>

                <h2 className="text-3xl md:text-5xl lg:text-[3.5rem] font-black text-white mb-6 leading-[1.1] break-keep" style={{ letterSpacing: '-1.25px' }}>
                    강사 의존도에서 벗어날<br className="hidden md:block" /> 준비가 됐다면
                </h2>

                <p className="text-xl md:text-2xl text-white/60 max-w-3xl mx-auto mb-12 font-light leading-relaxed break-keep">
                    15분이면 내 학원에 맞는 시스템 설계를 받을 수 있습니다. <br className="hidden md:block" />
                    전담 매니저가 직접 도입 플랜을 함께 짜드립니다.
                </p>

                <div className="flex flex-col sm:flex-row items-center justify-center gap-6">
                    <DemoModal trackingButton="final_consultation">
                        <Button size="lg" className="h-16 px-10 text-lg font-bold bg-white text-[#111110] hover:bg-[#F6F5F4] hover:scale-105 active:scale-95 transition-all shadow-xl shadow-white/10 w-full sm:w-auto rounded-full">
                            무료 컨설팅 신청하기
                            <ArrowRight className="ml-2 w-5 h-5" />
                        </Button>
                    </DemoModal>

                    <NewsletterModal
                        source="finalcta_download"
                        variant="dark"
                        badge="무료 자료"
                        title="서비스 소개서 받아보기"
                        description="이메일을 남겨주시면 Classin 소개서를 바로 열람하실 수 있습니다."
                        benefits={[
                            "Classin 주요 기능 한눈에 정리",
                            "도입 사례 및 성과 데이터 포함",
                            "요금제 · 도입 프로세스 안내",
                        ]}
                        successCta={{
                            label: "소개서 지금 바로 열기",
                            href: BROCHURE_URL,
                        }}
                    >
                        <Button variant="outline" className="h-16 px-10 text-lg bg-white/5 text-white border-white/20 hover:bg-white/10 hover:text-white transition-all hover:scale-105 active:scale-95 shadow-xl w-full sm:w-auto rounded-full backdrop-blur-md">
                            <FileText className="mr-2 w-5 h-5" />
                            서비스 소개서 다운로드
                        </Button>
                    </NewsletterModal>
                </div>

                <p className="mt-10 text-sm text-white/40 font-medium tracking-wide break-keep">
                    카드 등록 불필요 ∙ 전담 매니저 배정 ∙ 무료 로드맵 상담 포함
                </p>
            </div>
        </section>
    )
}
