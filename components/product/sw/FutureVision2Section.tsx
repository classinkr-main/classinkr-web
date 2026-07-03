"use client"

import { m, useInView } from "framer-motion"
import { useRef } from "react"

import { EyebrowTag } from "./sw-shared"
import { useCountUp } from "./useCountUp"

/* ── 미래 제시 2 (퀄리티 3배, 리소스 1/3) ─────────────────── */
export default function FutureVision2Section() {
    const metricsRef = useRef<HTMLDivElement>(null)
    const inView = useInView(metricsRef, { once: true, margin: "-80px" })

    const q = useCountUp(3, inView, 1.5)
    const r = useCountUp(67, inView, 1.5)

    return (
        <section className="py-24 md:py-40 bg-[#FDFCF8] overflow-hidden">
            <div className="container mx-auto px-4 lg:px-8 max-w-6xl">

                {/* 헤드라인 */}
                <m.div
                    className="text-center mb-20 md:mb-28"
                    initial={{ opacity: 0, y: 40 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    transition={{ duration: 0.8 }}
                >
                    <EyebrowTag>The Real Goal</EyebrowTag>
                    <h2 className="text-[clamp(2rem,5vw,4.5rem)] font-sans text-[#1a1a19] leading-[1.1] tracking-tight mb-6">
                        아이들과의<br />
                        <span className="text-[#22A366]">진정한 교육</span>
                    </h2>
                    <p className="text-xl md:text-2xl text-slate-500 font-sans max-w-2xl mx-auto leading-relaxed">
                        더 많이 가르치면서 더 적게 소진되는 것.
                        <br className="hidden md:block" />{" "}
                        그것이 Classin이 교사에게 드리는 약속입니다.
                    </p>
                </m.div>

                {/* 핵심 수치 */}
                <div ref={metricsRef} className="grid md:grid-cols-2 gap-6 mb-20 max-w-3xl mx-auto">
                    <m.div
                        initial={{ opacity: 0, scale: 0.9 }}
                        animate={inView ? { opacity: 1, scale: 1 } : {}}
                        transition={{ duration: 0.7, type: "spring", stiffness: 150 }}
                        className="bg-[#1a1a19] rounded-3xl p-10 text-center"
                    >
                        <div className="text-[72px] md:text-[88px] font-sans font-bold tabular-nums text-[#6EE7B7] leading-none mb-2">
                            {q}x
                        </div>
                        <div className="text-white/80 text-lg font-semibold mb-1">수업 퀄리티</div>
                        <div className="text-white/30 text-sm">쌍방향 참여 · AI 지원 · 학습 데이터 기반</div>
                    </m.div>
                    <m.div
                        initial={{ opacity: 0, scale: 0.9 }}
                        animate={inView ? { opacity: 1, scale: 1 } : {}}
                        transition={{ duration: 0.7, delay: 0.15, type: "spring", stiffness: 150 }}
                        className="bg-[#084734] rounded-3xl p-10 text-center"
                    >
                        <div className="text-[72px] md:text-[88px] font-sans font-bold tabular-nums text-[#6EE7B7] leading-none mb-2">
                            -{r}%
                        </div>
                        <div className="text-white/90 text-lg font-semibold mb-1">반복 업무 리소스</div>
                        <div className="text-white/60 text-sm">채점 · 출결 · 자료 준비 · 보고서 자동화</div>
                    </m.div>
                </div>

                {/* 진정성 텍스트 */}
                <m.div
                    className="max-w-3xl mx-auto text-center"
                    initial={{ opacity: 0, y: 30 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    transition={{ duration: 0.7 }}
                >
                    <div className="grid md:grid-cols-3 gap-8 mb-14">
                        {[
                            { headline: "교사가 원하는 것", body: "더 잘 가르치는 것. 학생 한 명 한 명의 성장을 직접 느끼는 것." },
                            { headline: "학생이 필요한 것", body: "일방적으로 듣는 수업이 아닌, 직접 참여하고 표현하는 경험." },
                            { headline: "학원이 원하는 것", body: "강사에 의존하지 않고 시스템으로 돌아가는 교육의 구조." },
                        ].map((item) => (
                            <div key={item.headline} className="text-left">
                                <div className="w-6 h-[2px] bg-[#22A366] mb-4" />
                                <h3 className="text-base font-bold text-[#1a1a19] mb-2">{item.headline}</h3>
                                <p className="text-sm text-slate-500 leading-relaxed">{item.body}</p>
                            </div>
                        ))}
                    </div>

                    <p className="text-xl md:text-2xl font-sans text-slate-600 leading-relaxed">
                        Classin은 도구가 아닙니다.<br />
                        <span className="text-[#1a1a19] font-bold">교육이 다시 교육다워지는 환경</span>입니다.
                    </p>
                </m.div>
            </div>
        </section>
    )
}

