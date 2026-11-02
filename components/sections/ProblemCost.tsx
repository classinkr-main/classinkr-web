"use client"

import { motion } from "framer-motion"
import { AlertTriangle, Clock, TrendingDown } from "lucide-react"

const pains = [
    {
        icon: TrendingDown,
        title: "에이스 강사가 퇴사했습니다.",
        desc: "그 반 학생 20명은요? 커리큘럼은요? 다음 강사가 같은 수준으로 가르칠 수 있을까요?",
        countLabel: "교안과 수업 흐름을 함께 남길 방법을 살펴보세요.",
    },
    {
        icon: Clock,
        title: "같은 교재, 같은 시간.",
        desc: "근데 반마다 성적이 다릅니다. 원장님은 어떤 반이 문제인지, 왜 그런지 알고 계신가요?",
        countLabel: "반별 수업 기록을 함께 확인해 보세요.",
    },
    {
        icon: AlertTriangle,
        title: "학부모 상담마다 같은 질문.",
        desc: "\"복습은 어떻게 하나요?\" — 이 질문에 매번 직접 답하는 대신, 데이터로 보여줄 수 있다면요?",
        countLabel: "복습 자료와 안내 순서를 정리해 보세요.",
    },
]

export function ProblemCost() {
    return (
        <section className="relative py-16 md:py-32 bg-[#111110] overflow-hidden">
            {/* Grid pattern */}
            <div className="absolute inset-0 opacity-[0.03]"
                style={{ backgroundImage: 'linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)', backgroundSize: '60px 60px' }} />

            {/* Amber/terracotta ambient glow blobs */}
            <div className="absolute top-1/4 left-1/4 w-[500px] h-[500px] bg-[#B85C33]/[0.08] rounded-full blur-[60px]" />
            <div className="absolute bottom-1/4 right-1/4 w-[400px] h-[400px] bg-orange-500/[0.06] rounded-full blur-[60px]" />

            {/* Noise texture */}
            <div className="absolute inset-0 bg-[url('/images/noise-texture.svg')] opacity-15 mix-blend-overlay pointer-events-none" />

            <div className="container mx-auto relative z-10">
                {/* Title */}
                <motion.div
                    initial={{ opacity: 0, y: 40 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    transition={{ duration: 0.7 }}
                    className="text-center max-w-3xl mx-auto mb-20 px-4"
                >
                    <span className="inline-flex items-center gap-2.5 py-2 px-5 rounded-full bg-[#B85C33]/8 border border-[#B85C33]/15 text-[#F6D5C5] text-sm font-semibold mb-6 backdrop-blur-md shadow-[0_2px_16px_rgba(184,92,51,0.12)]">
                        <span className="relative flex h-2 w-2">
                            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#F6D5C5]/40" />
                            <span className="relative inline-flex h-2 w-2 rounded-full bg-[#F6D5C5]" />
                        </span>
                        <span className="tracking-[0.02em]">원장님, 이 질문들을 받아본 적 있으신가요</span>
                    </span>
                    <h2 className="text-4xl font-black text-white sm:text-5xl md:text-[3.5rem] mb-6 leading-tight break-keep" style={{ letterSpacing: '-1.5px' }}>
                        강사 개인에게만 의존하면<br />
                        <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#B85C33] to-[#F6D5C5] break-keep">운영 기준이 흔들릴 수 있습니다</span>
                    </h2>
                    <p className="text-lg text-[#A39E98] break-keep">
                        수업 자료와 운영 기준이 개인에게만 남아 있다면, 강사 교체나 반 이동 때 이어가기 어려울 수 있습니다.
                    </p>
                </motion.div>

                {/* Cards */}
                <div className="grid md:grid-cols-3 gap-6 md:gap-8">
                    {pains.map((pain, index) => (
                        <motion.div
                            key={index}
                            initial={{ opacity: 0, y: 50, scale: 0.95 }}
                            whileInView={{ opacity: 1, y: 0, scale: 1 }}
                            transition={{ delay: index * 0.2, duration: 0.7, type: "spring", bounce: 0.15 }}
                            viewport={{ once: true }}
                            className="h-full"
                        >
                            <div className="relative h-full md:min-h-[440px] rounded-3xl overflow-hidden group bg-[#1C1B1A]/60 backdrop-blur-xl border border-white/[0.08] hover:border-[#B85C33]/30 transition-all duration-500 shadow-[0_0_0_1px_rgba(255,255,255,0.03)] hover:shadow-[0_0_40px_rgba(184,92,51,0.1)]">
                                {/* Top accent line */}
                                <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-[#B85C33]/50 to-transparent group-hover:via-[#B85C33] group-hover:h-0.5 transition-all duration-500" />

                                <div className="pt-10 p-8 flex flex-col items-center text-center h-full">
                                    {/* Icon */}
                                    <div className="relative mb-8">
                                        <div className="absolute inset-0 rounded-full bg-[#B85C33]/20 blur-xl opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                                        <div className="relative p-5 rounded-2xl bg-gradient-to-br from-[#B85C33]/15 to-[#9A4A27]/10 border border-[#B85C33]/20 text-[#F6D5C5] group-hover:from-[#B85C33]/25 group-hover:to-[#9A4A27]/20 group-hover:text-white group-hover:scale-110 transition-all duration-500">
                                            <pain.icon className="w-10 h-10" strokeWidth={1.5} />
                                        </div>
                                    </div>

                                    <h3 className="text-2xl font-extrabold mb-4 text-white break-keep" style={{ letterSpacing: '-0.25px' }}>{pain.title}</h3>
                                    <p className="text-[#A39E98] mb-8 flex-grow text-lg leading-relaxed break-keep">{pain.desc}</p>

                                    {/* Next step */}
                                    <div className="w-full pt-6 border-t border-white/[0.08] mt-auto">
                                        <p className="text-[11px] font-bold text-[#F6D5C5]/50 uppercase tracking-[0.25em] mb-2">함께 살펴볼 일</p>
                                        <div className="space-y-2">
                                            <p className="text-base font-extrabold leading-snug text-[#F6D5C5] break-keep">
                                                {pain.countLabel}
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </motion.div>
                    ))}
                </div>

            </div>

            {/* Bottom edge line */}
            <div className="absolute bottom-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-[#B85C33]/30 to-transparent" />
        </section>
    )
}
