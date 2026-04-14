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
        headline: "결석한 날에도,\n수업의 흐름이 남습니다",
        detail:
            "영상과 판서 노트가 함께 남아 집에서도 같은 흐름으로 복습할 수 있습니다. 결석한 날에도 수업 맥락을 놓치지 않습니다.",
        accent: "#084734",
        bg: "#ECFDF5",
        borderColor: "rgba(8,71,52,0.12)",
    },
    {
        icon: Users,
        perspective: "학부모",
        headline: "\"오늘 무엇을 배웠는지\"\n바로 확인할 수 있습니다",
        detail:
            "수업 종료 후 판서 PDF가 자동으로 공유됩니다. 학부모는 자녀가 어떤 내용을 배우고 어디까지 진도 나갔는지 직접 확인할 수 있습니다.",
        accent: "#084734",
        bg: "#FFFFFF",
        borderColor: "rgba(0,0,0,0.08)",
    },
    {
        icon: Star,
        perspective: "교사",
        headline: "지난 수업을 보면,\n다음 수업이 더 좋아집니다",
        detail:
            "교사는 수업 영상을 다시 보며 설명 흐름과 학생 반응을 점검할 수 있습니다. 복기는 다음 수업의 완성도를 높입니다.",
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
                        좋은 수업은,
                        <br />
                        <span className="text-[#084734]">교실 밖에서도 이어집니다</span>
                    </h2>
                    <p className="text-base sm:text-lg text-[#615D59] max-w-xl mx-auto leading-relaxed">
                        ClassIn Board가 남기는 판서와 영상은 교실 밖에서도 바로 활용됩니다.
                        <br />
                        학생, 학부모, 교사 모두 같은 수업의 근거를 각자의 방식으로 다시 확인할 수 있습니다.
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
