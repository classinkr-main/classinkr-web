"use client"

import { Button } from "@/components/ui/button"
import { DemoModal } from "./DemoModal"
import { NewsletterModal } from "./NewsletterModal"
import { ArrowRight, FileText } from "lucide-react"

const BROCHURE_URL =
  "https://remarkable-marquess-225.notion.site/AI-ClassIn-25a9585602f980049915fe608aec56f7?pvs=74"

export function FinalCTA() {
    return (
        <section className="py-16 md:py-32 relative overflow-hidden bg-slate-950">
            {/* Background Effects */}
            <div className="absolute inset-0 bg-gradient-to-br from-[#084734] to-slate-950 opacity-90" />
            <div className="absolute inset-0 bg-[url('/images/noise-texture.svg')] opacity-20 mix-blend-overlay pointer-events-none" />
            <div className="absolute top-0 right-0 w-[800px] h-[800px] bg-primary/30 rounded-full blur-[120px] pointer-events-none translate-x-1/2 -translate-y-1/2" />

            <div className="container mx-auto relative z-10 text-center">
                <span className="inline-block py-1.5 px-4 rounded-full bg-white/10 text-green-300 text-sm font-semibold mb-6 border border-white/20 backdrop-blur-md">
                    무료 컨설팅 제공
                </span>

                <h2 className="text-4xl md:text-5xl lg:text-6xl font-extrabold tracking-tight text-white mb-6 break-keep">
                    성공 방정식을 표준화할 준비가 되셨나요?
                </h2>

                <p className="text-xl md:text-2xl text-slate-300 max-w-3xl mx-auto mb-12 font-light leading-relaxed break-keep">
                    15분 만에 맞춤형 도입 플랜을 받아보세요. <br className="hidden md:block" />
                    1등 학원들이 Classin을 선택하는 이유를 직접 확인하세요.
                </p>

                <div className="flex flex-col sm:flex-row items-center justify-center gap-6">
                    <DemoModal>
                        <Button size="lg" className="h-16 px-10 text-lg font-bold bg-white text-slate-950 hover:bg-slate-100 hover:scale-105 active:scale-95 transition-all shadow-xl shadow-white/10 w-full sm:w-auto rounded-full">
                            맞춤형 도입 플랜 받기
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

                <p className="mt-10 text-sm text-slate-400 font-medium tracking-wide break-keep">
                    카드 등록 불필요 ∙ 전담 매니저 배정 ∙ 무료 로드맵 상담 포함
                </p>
            </div>
        </section>
    )
}
