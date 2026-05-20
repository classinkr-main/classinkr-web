"use client"

import { motion } from "framer-motion"
import { BookOpen, Users, Star } from "lucide-react"

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
        accent: "#084734",
        bg: "#ECFDF5",
        borderColor: "rgba(8,71,52,0.12)",
    },
    {
        icon: Users,
        perspective: "학부모",
        headline: "\"오늘 뭘 배웠어?\"\n이제 직접 확인합니다",
        detail:
            "수업 종료 후 판서 PDF가 자동으로 공유됩니다. 학부모는 자녀가 어떤 내용을 배웠는지, 어디까지 진행됐는지 그대로 볼 수 있습니다.",
        accent: "#084734",
        bg: "#FFFFFF",
        borderColor: "rgba(0,0,0,0.08)",
    },
    {
        icon: Star,
        perspective: "교사",
        headline: "내 수업을 돌아보면\n다음 수업이 달라집니다",
        detail:
            "AI 카메라가 녹화한 수업 영상을 교사 스스로 복기합니다. 어느 순간 학생 집중이 흩어졌는지, 판서 흐름이 자연스러웠는지 — 성찰이 성장이 됩니다.",
        accent: "#084734",
        bg: "#F6F5F4",
        borderColor: "rgba(0,0,0,0.08)",
    },
]

export default function AfterClassSection() {
    return (
        <section className="py-24 md:py-32 bg-[#F6F5F4]">
            <div className="container mx-auto px-4 lg:px-8">
                {/* Header */}
                <motion.div {...fadeUp} className="text-center mb-16">
                    <span className="inline-flex items-center px-3 py-1 rounded-full bg-[#ECFDF5] border border-[#084734]/15 text-xs font-semibold tracking-widest text-[#084734] uppercase mb-5">
                        After Class
                    </span>
                    <h2
                        className="text-3xl sm:text-4xl md:text-5xl font-bold text-[#111110] mb-5 leading-tight"
                        style={{ letterSpacing: "-0.035em" }}
                    >
                        수업이 끝나도,
                        <br />
                        <span className="text-[#084734]">배움은 계속됩니다</span>
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
                                className="rounded-2xl p-8 flex flex-col gap-5"
                                style={{
                                    background: card.bg,
                                    border: `1px solid ${card.borderColor}`,
                                    boxShadow:
                                        "rgba(0,0,0,0.04) 0px 4px 18px, rgba(0,0,0,0.027) 0px 2px 7.8px, rgba(0,0,0,0.02) 0px 0.8px 2.9px",
                                }}
                            >
                                {/* Icon + perspective badge */}
                                <div className="flex items-center gap-3">
                                    <div
                                        className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                                        style={{ background: "#ECFDF5" }}
                                    >
                                        <Icon className="w-5 h-5" style={{ color: card.accent }} />
                                    </div>
                                    <span
                                        className="text-xs font-semibold tracking-wider uppercase"
                                        style={{ color: card.accent }}
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
            </div>
        </section>
    )
}
