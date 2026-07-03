"use client"

import { m } from "framer-motion"
import { ArrowRight } from "lucide-react"
import Link from "next/link"

import { fadeUp } from "@/components/motion/presets"
import { trackEvent } from "@/lib/analytics"

import { EyebrowTag } from "./sw-shared"
import { CHECKOUT_CTA_LABEL, CHECKOUT_HREF, trackCheckoutClick } from "./sw-checkout"

/* ── ④ 가격 가치 제안 섹션 ───────────────────────────────────── */
const INCLUDED = [
    "양방향 블랙보드 · 50페이지 판서 공간",
    "30가지 인터랙티브 수업 도구",
    "10가지 참여형 수업 활동",
    "수업 자동 녹화 · 클라우드 저장",
    "LMS (숙제 · 출결 · 성적 · 평가)",
    "학습 데이터 리포트 및 분석",
    "1:1부터 최대 1,000명 대형 강의까지",
    "12개 언어 지원 · 160개국 서비스",
    "AI 첨삭 · AI 과제 생성 · AI 교안",
    "전담 고객 지원 · 전문가 온보딩",
]

export default function PricingValueSection() {
    return (
        <section className="py-24 md:py-32 bg-white">
            <div className="container mx-auto px-4 lg:px-8 max-w-5xl">
                <m.div className="text-center mb-14" {...fadeUp}>
                    <EyebrowTag>PRICING VALUE</EyebrowTag>
                    <h2 className="text-3xl md:text-4xl lg:text-5xl font-sans text-[#1a1a19] leading-tight mb-4">
                        이 가격에,{" "}
                        <span className="text-[#22A366]">이 모든 것을</span>
                    </h2>
                    <p className="text-lg text-slate-500 max-w-xl mx-auto">
                        LMS 따로, 화상 도구 따로, 녹화 툴 따로 — 세 가지를 각각 쓰면
                        월 수십만 원이 넘습니다. Classin은 하나로 전부 해결합니다.
                    </p>
                </m.div>

                <div className="grid lg:grid-cols-[2fr_3fr] gap-10">
                    {/* Included list */}
                    <m.div
                        initial={{ opacity: 0, x: -20 }}
                        whileInView={{ opacity: 1, x: 0 }}
                        viewport={{ once: true }}
                        transition={{ duration: 0.6 }}
                        className="bg-[#FDFCF8] rounded-2xl border border-slate-100 p-8"
                    >
                        <p className="text-xs font-bold text-slate-400 tracking-wider uppercase mb-5">구독 하나로 포함되는 것들</p>
                        <ul className="space-y-3">
                            {INCLUDED.map((item, i) => (
                                <m.li
                                    key={item}
                                    initial={{ opacity: 0, x: -10 }}
                                    whileInView={{ opacity: 1, x: 0 }}
                                    viewport={{ once: true }}
                                    transition={{ delay: i * 0.04 }}
                                    className="flex items-start gap-3 text-sm text-slate-700"
                                >
                                    <div className="w-4 h-4 rounded-full bg-[#ECFDF5] border border-[rgba(34,163,102,0.25)] flex items-center justify-center shrink-0 mt-0.5">
                                        <div className="w-1.5 h-1.5 rounded-full bg-[#22A366]" />
                                    </div>
                                    {item}
                                </m.li>
                            ))}
                        </ul>
                    </m.div>

                    {/* Value framing */}
                    <m.div
                        initial={{ opacity: 0, x: 20 }}
                        whileInView={{ opacity: 1, x: 0 }}
                        viewport={{ once: true }}
                        transition={{ duration: 0.6, delay: 0.1 }}
                        className="space-y-5"
                    >
                        {[
                            { label: "일반 화상 도구", note: "Zoom · Teams 등", scope: "화상 수업만", line: true },
                            { label: "+ LMS 별도 구독", note: "Canvas · Classting Pro 등", scope: "출결 · 과제 · 평가만", line: true },
                            { label: "+ 녹화 · 클라우드 스토리지", note: "별도 저장소 + 관리", scope: "영상 보관만", line: true },
                            { label: "+ AI 기능 별도 구독", note: "ChatGPT Team · AI 첨삭 도구 등", scope: "AI 도구만", line: true },
                            { label: "Classin 하나로", note: "도구마다 다른 계약 · 다른 로그인 없이", scope: "전부 한 번에", line: false, highlight: true },
                        ].map((row) => (
                            <div key={row.label} className={`flex items-center justify-between ${row.line ? "pb-4 border-b border-slate-100" : ""} ${row.highlight ? "bg-[#F0FDF9] border border-[#22A366]/15 rounded-2xl px-6 py-6 -mx-4 mt-2" : ""}`}>
                                <div>
                                    <p className={`font-bold ${row.highlight ? "text-xl text-[#22A366]" : "text-sm font-semibold text-slate-700"}`}>{row.label}</p>
                                    <p className={`${row.highlight ? "text-sm text-slate-500" : "text-xs text-slate-400"}`}>{row.note}</p>
                                </div>
                                <p className={`font-bold ${row.highlight ? "text-lg text-[#22A366]" : "text-xs text-slate-500"}`}>{row.scope}</p>
                            </div>
                        ))}
                    </m.div>
                </div>

                {/* Full-width pricing callout */}
                <m.div
                    initial={{ opacity: 0, y: 20 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    transition={{ duration: 0.6, delay: 0.2 }}
                    className="bg-[#1a1a19] text-white rounded-2xl px-6 md:px-10 py-6 md:py-7 mt-10"
                >
                    <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6 lg:gap-10">
                        {/* Heading */}
                        <div className="text-center lg:text-left lg:shrink-0">
                            <p className="text-slate-300 text-sm font-bold uppercase tracking-[0.18em] mb-1.5">Classin 하나로</p>
                            <p className="font-sans font-bold text-white leading-tight">
                                <span className="text-2xl md:text-3xl">이 모든 기능</span>
                                <span className="text-sm md:text-base font-medium text-slate-300 ml-2 align-middle">+ AI 기능까지</span>
                            </p>
                        </div>

                        {/* Tier prices + note */}
                        <div className="flex flex-col items-center gap-2 lg:flex-1">
                            <div className="flex items-center gap-5 sm:gap-7">
                                <div className="text-center">
                                    <p className="text-[11px] text-slate-400 uppercase tracking-[0.16em] mb-1">Standard</p>
                                    <p className="text-lg font-sans font-bold tabular-nums text-white whitespace-nowrap">
                                        $99<span className="text-xs text-slate-300 font-medium ml-0.5">/계정/월</span>
                                    </p>
                                </div>
                                <div className="w-px h-10 bg-white/10" />
                                <div className="text-center">
                                    <p className="text-[11px] text-slate-400 uppercase tracking-[0.16em] mb-1">Plus</p>
                                    <p className="text-lg font-sans font-bold tabular-nums text-white whitespace-nowrap">
                                        $199<span className="text-xs text-slate-300 font-medium ml-0.5">/계정/월</span>
                                    </p>
                                </div>
                                <div className="w-px h-10 bg-white/10" />
                                <div className="text-center">
                                    <p className="text-[11px] text-slate-400 uppercase tracking-[0.16em] mb-1">Enterprise</p>
                                    <p className="text-lg font-bold text-white whitespace-nowrap">맞춤 견적</p>
                                </div>
                            </div>
                            <p className="text-[#22A366] text-xs font-medium">연 결제 시 약 2개월 절감</p>
                        </div>

                        {/* CTAs */}
                        <div className="flex flex-col sm:flex-row gap-2 justify-center lg:justify-end lg:shrink-0">
                            <Link
                                href={CHECKOUT_HREF}
                                onClick={() => trackCheckoutClick("sw_pricing_checkout")}
                                className="inline-flex items-center justify-center gap-2 rounded-full bg-[#009060] px-5 py-2.5 text-sm font-bold text-white transition-all hover:scale-105 hover:bg-[#007A52] whitespace-nowrap"
                            >
                                {CHECKOUT_CTA_LABEL} <ArrowRight className="w-4 h-4" />
                            </Link>
                            <Link
                                href="/contact#contact-form"
                                onClick={() => trackEvent("click_cta", { button: "sw_pricing_consultation", page: "/product/sw" })}
                                className="inline-flex items-center justify-center gap-2 rounded-full border border-white/20 bg-white/[0.04] px-5 py-2.5 text-sm font-bold text-white transition-all hover:bg-white/[0.08] whitespace-nowrap"
                            >
                                도입 상담
                            </Link>
                        </div>
                    </div>
                </m.div>
            </div>
        </section>
    )
}

