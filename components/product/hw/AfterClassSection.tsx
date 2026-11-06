"use client"

import { motion } from "framer-motion"
import { ArrowRight, BookOpen, Users, Star } from "lucide-react"

import { TrackedLink } from "@/components/TrackedLink"

const ease = [0.22, 1, 0.36, 1] as const

const fadeUp = {
    initial: { opacity: 0, y: 28 },
    whileInView: { opacity: 1, y: 0 },
    viewport: { once: true, margin: "-8% 0px" },
    transition: { duration: 0.6, ease },
}

const stagger = (i: number) => ({
    ...fadeUp,
    transition: { duration: 0.55, delay: 0.1 + i * 0.13, ease },
})

const cards = [
    {
        icon: BookOpen,
        perspective: "학생",
        headline: "결석한 날 밤도,\n완전한 수업입니다",
        detail:
            "영상과 판서 노트가 함께 저장됩니다. 집에서 영상을 틀면 교사의 설명이, 옆에 PDF를 열면 판서가 — 교실과 똑같은 복습 환경이 펼쳐집니다.",
        surface: "bg-fg-accent/8 border-fg-accent/12",
    },
    {
        icon: Users,
        perspective: "학부모",
        headline: "\"오늘 뭘 배웠어?\"\n이제 직접 확인합니다",
        detail:
            "판서는 수업 뒤 학습 보고서에 담기고, 학원은 보고서 링크를 학부모에게 전달합니다. 학부모는 자녀가 어떤 내용을 배웠는지, 어디까지 진행됐는지 그대로 볼 수 있습니다.",
        surface: "bg-surface-sheet border-line-hair",
    },
    {
        icon: Star,
        perspective: "교사",
        headline: "내 수업을 돌아보면\n다음 수업이 달라집니다",
        detail:
            "녹화한 수업 영상을 교사 스스로 복기합니다. 설명이 길어진 대목은 어디였는지, 판서 흐름이 자연스러웠는지 — 성찰이 성장이 됩니다.",
        surface: "bg-surface-sunken border-line-hair",
    },
]

export default function AfterClassSection() {
    return (
        <section className="py-24 md:py-32 bg-[#F6F5F4]">
            <div className="container mx-auto px-4 lg:px-8">
                {/* Header */}
                <motion.div {...fadeUp} className="text-center mb-16">
                    <span className="inline-flex items-center px-3 py-1 rounded-full bg-fg-accent/8 border border-fg-accent/15 text-xs font-semibold tracking-widest text-fg-accent uppercase mb-5">
                        After Class
                    </span>
                    <h2
                        className="text-3xl sm:text-4xl md:text-5xl font-bold text-[#111110] mb-5 leading-tight"
                        style={{ letterSpacing: "-0.035em" }}
                    >
                        수업이 끝나도,
                        <br />
                        <span className="text-fg-accent">배움은 계속됩니다</span>
                    </h2>
                    <p className="text-base sm:text-lg text-[#615D59] max-w-xl mx-auto leading-relaxed">
                        Classin Board가 만든 결과물은 교실 밖에서도 살아 숨쉽니다.
                        <br />
                        학생도, 학부모도, 교사도 — 각자의 방식으로 수업을 이어갑니다.
                    </p>
                </motion.div>

                {/* Cards */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-5 max-w-5xl mx-auto">
                    {cards.map((card, i) => {
                        const Icon = card.icon
                        return (
                            <motion.div
                                key={card.perspective}
                                {...stagger(i)}
                                className={`rounded-2xl p-8 flex flex-col gap-5 border ${card.surface}`}
                                style={{
                                    boxShadow:
                                        "rgba(0,0,0,0.04) 0px 4px 18px, rgba(0,0,0,0.027) 0px 2px 7.8px, rgba(0,0,0,0.02) 0px 0.8px 2.9px",
                                }}
                            >
                                {/* Icon + perspective badge */}
                                <div className="flex items-center gap-3">
                                    <div
                                        className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 bg-fg-accent/8"
                                    >
                                        <Icon className="w-5 h-5 text-fg-accent" />
                                    </div>
                                    <span
                                        className="text-xs font-semibold tracking-wider uppercase text-fg-accent"
                                    >
                                        {card.perspective}
                                    </span>
                                </div>

                                {/* Headline */}
                                <h3
                                    className="text-xl font-bold text-[#111110] leading-snug whitespace-pre-line"
                                    style={{ letterSpacing: "-0.02em" }}
                                >
                                    {card.headline}
                                </h3>

                                {/* Detail */}
                                <p className="text-sm text-[#615D59] leading-relaxed flex-1">
                                    {card.detail}
                                </p>
                            </motion.div>
                        )
                    })}
                </div>

                {/* 녹화·AI 리포트 딥다이브 진입 */}
                <motion.div {...fadeUp} className="mt-10 text-center">
                    <TrackedLink
                        href="/product/ai-report"
                        ctaId="hw_ai_report_deep_dive"
                        className="inline-flex items-center gap-2 rounded-md border border-fg-accent/25 px-5 py-3 text-sm font-semibold text-fg-accent hover:bg-fg-accent/8 transition-colors"
                    >
                        녹화 · AI 리포트 자세히 보기
                        <ArrowRight className="w-4 h-4" />
                    </TrackedLink>
                </motion.div>
            </div>
        </section>
    )
}
