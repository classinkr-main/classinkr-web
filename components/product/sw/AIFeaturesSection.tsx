"use client"

import { m } from "framer-motion"
import { ArrowRight } from "lucide-react"
import Link from "next/link"

import { fadeUp } from "@/components/motion/presets"
import { trackEvent } from "@/lib/analytics"

/* ── [C] AI 기능 섹션 ────────────────────────────────────────── */
const AI_FEATURES = [
    { icon: "✍️", title: "AI 첨삭", desc: "학생 제출 과제를 AI가 즉시 분석·채점. 교사의 채점 시간을 획기적으로 줄입니다." },
    { icon: "📝", title: "AI 과제 생성", desc: "학습 수준과 목표에 맞는 맞춤형 과제를 자동으로 만들어줍니다." },
    { icon: "✏️", title: "AI 작문 도우미", desc: "작문 주제와 조건을 입력하면 수준별 예시 답안과 첨삭 가이드를 제공합니다." },
    { icon: "🔢", title: "AI 수식 풀이", desc: "수학·과학 문제의 정답과 풀이 과정을 AI가 즉시 생성합니다." },
    { icon: "📄", title: "AI 문서 정리", desc: "수업 자료 자동 요약, 보고서 작성, 학습 노트 정리를 AI가 처리합니다." },
    { icon: "🎨", title: "AI 이미지 생성", desc: "아이디어를 입력하면 수업에 필요한 시각 자료를 자동으로 생성합니다." },
    { icon: "📚", title: "AI 교안 자동화", desc: "학습 목표를 입력하면 전체 수업 계획안을 자동으로 작성해줍니다." },
    { icon: "💬", title: "AI 질의응답", desc: "과목·언어 관계없이 학생 질문에 24시간 즉시 답변. 자기주도 학습을 지원합니다." },
]

export default function AIFeaturesSection() {
    return (
        <section className="py-24 md:py-32 bg-[#F6F5F4]">
            <div className="container mx-auto px-4 lg:px-8 max-w-6xl">
                <m.div className="text-center mb-14" {...fadeUp}>
                    <span className="inline-flex items-center gap-1.5 bg-[#084734] text-[#6EE7B7] text-xs font-bold px-3 py-1.5 rounded-full mb-5">
                        ✦ AI-Powered
                    </span>
                    <h2 className="text-3xl md:text-4xl lg:text-5xl font-sans text-[#1a1a19] leading-tight mb-4">
                        AI가 교사의 시간을<br /><span className="text-[#084734]">돌려드립니다</span>
                    </h2>
                    <p className="text-lg text-slate-500 max-w-xl mx-auto">
                        채점, 교안 작성, 자료 정리 — 반복적인 작업은 AI에게 맡기고
                        교사는 가르치는 일에만 집중할 수 있습니다.
                    </p>
                </m.div>

                <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
                    {AI_FEATURES.map((f, i) => (
                        <m.div
                            key={f.title}
                            initial={{ opacity: 0, y: 20 }}
                            whileInView={{ opacity: 1, y: 0 }}
                            viewport={{ once: true }}
                            transition={{ delay: i * 0.07 }}
                            className="bg-white rounded-2xl border border-[rgba(0,0,0,0.06)] p-6 hover:shadow-[0_8px_24px_rgba(34,163,102,0.09)] hover:border-[rgba(34,163,102,0.2)] hover:-translate-y-0.5 transition-all group relative overflow-hidden"
                        >
                            <div className="absolute top-0 left-0 w-full h-[2px] bg-gradient-to-r from-[#22A366]/0 via-[#22A366]/20 to-[#22A366]/0 opacity-0 group-hover:opacity-100 transition-opacity" />
                            <div className="w-9 h-9 rounded-lg bg-[#ECFDF5] border border-[rgba(34,163,102,0.15)] flex items-center justify-center mb-4 text-lg">{f.icon}</div>
                            <h3 className="text-sm font-bold text-[#111110] mb-1.5 tracking-tight">{f.title}</h3>
                            <p className="text-xs text-[#615D59] leading-relaxed">{f.desc}</p>
                        </m.div>
                    ))}
                </div>

                <m.div
                    initial={{ opacity: 0 }}
                    whileInView={{ opacity: 1 }}
                    viewport={{ once: true }}
                    transition={{ delay: 0.5 }}
                    className="mt-10 bg-[#084734] rounded-2xl p-6 flex flex-col sm:flex-row items-center justify-between gap-4 text-white"
                >
                    <div>
                        <p className="font-bold text-base mb-0.5">AI 기능 모두 기본 포함</p>
                        <p className="text-white/50 text-sm">별도 AI 툴 구독 없이 Classin 하나로 사용 가능합니다.</p>
                    </div>
                    <Link
                        href="/contact"
                        onClick={() => trackEvent("click_cta", { button: "sw_ai_freetrial", page: "/product/sw" })}
                        className="shrink-0 inline-flex items-center gap-2 bg-white text-[#084734] font-bold text-sm px-5 py-2.5 rounded-full hover:bg-white/90 transition-colors"
                    >
                        무료 체험 시작 <ArrowRight className="w-4 h-4" />
                    </Link>
                </m.div>
            </div>
        </section>
    )
}

