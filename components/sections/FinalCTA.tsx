"use client"

import Link from "next/link"
import { Button } from "@/components/ui/button"
import { DemoModal } from "./DemoModal"
import { TrackedLink } from "@/components/TrackedLink"
import { ArrowRight, CalendarDays, FileCheck2, Newspaper } from "lucide-react"

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
                    <span className="tracking-[0.04em]">대표 수업 1개부터</span>
                </span>

                <h2 className="text-3xl md:text-5xl lg:text-[3.5rem] font-black text-white mb-6 leading-[1.1] break-keep" style={{ letterSpacing: '-1.25px' }}>
                    전체를 한 번에 바꾸지 마세요.<br className="hidden md:block" /> 가장 손이 많이 가는 수업부터 검증하세요.
                </h2>

                <p className="text-xl md:text-2xl text-white/60 max-w-3xl mx-auto mb-12 font-light leading-relaxed break-keep">
                    대표 교안 1개와 줄이고 싶은 반복 업무 3가지만 준비하세요. <br className="hidden md:block" />
                    판서부터 녹화·복습·관리자 확인까지 첫 파일럿 순서를 함께 설계합니다.
                </p>

                <div className="flex flex-col sm:flex-row items-center justify-center gap-6">
                    <DemoModal trackingButton="final_consultation">
                        <Button size="lg" className="h-16 px-10 text-lg font-bold bg-white text-[#111110] hover:bg-[#F6F5F4] hover:scale-105 active:scale-95 transition-all shadow-xl shadow-white/10 w-full sm:w-auto rounded-full">
                            1개 교실 파일럿 상담받기
                            <ArrowRight className="ml-2 w-5 h-5" />
                        </Button>
                    </DemoModal>

                    <TrackedLink
                        href="/resources/academy-system-checklist#download"
                        ctaId="final_lead_magnet"
                        tracking={{ source: "home_final_cta", lead_magnet: "academy-system-checklist" }}
                        className="inline-flex h-16 w-full items-center justify-center rounded-full border border-white/20 bg-white/5 px-10 text-lg font-semibold text-white shadow-xl backdrop-blur-md transition-all hover:scale-105 hover:bg-white/10 sm:w-auto"
                    >
                        <FileCheck2 className="mr-2 h-5 w-5" />
                        먼저 운영 누수 진단하기
                    </TrackedLink>
                </div>

                <p className="mt-10 text-sm text-white/40 font-medium tracking-wide break-keep">
                    대표 수업 기준 ∙ 도입 범위 확인 ∙ 90일 파일럿 순서
                </p>

                {/* 아직 상담이 이르다면 — 콘텐츠 탐색 경로 */}
                <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row sm:gap-8">
                    <Link
                        href="/events"
                        prefetch={false}
                        className="inline-flex items-center gap-1.5 text-sm font-semibold text-white/50 transition-colors hover:text-[#6EE7B7]"
                    >
                        <CalendarDays className="h-4 w-4" />
                        진행 중인 행사·프로모션 보기
                    </Link>
                    <Link
                        href="/blog"
                        prefetch={false}
                        className="inline-flex items-center gap-1.5 text-sm font-semibold text-white/50 transition-colors hover:text-[#6EE7B7]"
                    >
                        <Newspaper className="h-4 w-4" />
                        블로그에서 도입 인사이트 읽기
                    </Link>
                </div>
            </div>
        </section>
    )
}
