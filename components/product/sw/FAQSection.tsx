"use client"

import { useState } from "react"
import { motion } from "framer-motion"
import { ArrowRight } from "lucide-react"
import { TrackedLink } from "@/components/TrackedLink"

const fadeUp = {
    initial: { opacity: 0, y: 30 },
    whileInView: { opacity: 1, y: 0 },
    viewport: { once: true },
    transition: { duration: 0.6 },
}

function EyebrowTag({ children, center = true, dark = false }: { children: React.ReactNode; center?: boolean; dark?: boolean }) {
    return (
        <div className={`flex items-center gap-3 mb-4 ${center ? "justify-center" : "justify-start"}`}>
            <div className={`h-px w-5 shrink-0 ${dark ? "bg-[#6EE7B7]/40" : "bg-[#084734]/40"}`} />
            <p className={`text-[11px] font-bold tracking-[0.2em] uppercase whitespace-nowrap ${dark ? "text-[#6EE7B7]" : "text-[#084734]"}`}>{children}</p>
            <div className={`h-px w-5 shrink-0 ${dark ? "bg-[#6EE7B7]/40" : "bg-[#084734]/40"}`} />
        </div>
    )
}

/* ── [E] FAQ 섹션 ────────────────────────────────────────────── */
const FAQS = [
    {
        q: "Zoom과 비교해서 실제로 어떻게 다른가요?",
        a: "Zoom에서도 화이트보드, 녹화와 참여 기록을 사용할 수 있으며 기능은 요금제와 설정에 따라 달라집니다. Classin은 수업용 교구와 교안, 녹화, 학습 관리 기능을 수업 흐름에 연결하는 데 초점을 둡니다. 실제 도입 전 필요한 기능과 요금제 조건을 비교해 보세요.",
    },
    {
        q: "기존 학원 시스템과 연동이 가능한가요?",
        a: "Google Classroom, Canvas, Moodle 등 주요 LMS와의 연동을 지원합니다. 자체 시스템이 있는 경우 API를 통한 커스텀 연동도 가능하며, 도입 시 전담 팀이 설정을 도와드립니다.",
    },
    {
        q: "학생들이 사용하기 어렵지 않나요?",
        a: "별도 앱 설치 없이 웹 브라우저에서 접속 가능합니다. 처음 수업 전 5분 안내로 학생 대부분이 바로 사용할 수 있으며, 모바일에서도 동일하게 작동합니다.",
    },
    {
        q: "인터넷 속도가 느린 환경에서도 괜찮나요?",
        a: "수업 환경의 네트워크 상태와 기기 사양에 따라 연결 품질이 달라질 수 있습니다. 도입 전 실제 교실 환경에서 확인해 주세요.",
    },
    {
        q: "수업 녹화본의 저작권은 누가 갖나요?",
        a: "수업 녹화본의 저작권은 해당 기관과 강사에게 있습니다. Classin은 앱 내 재생만 허용하고 외부 다운로드를 차단하며, 재생 시 워터마크를 제공해 무단 배포를 막습니다.",
    },
    {
        q: "요금제는 어떻게 구성되나요?",
        a: "학원 규모, 수강생 수, 필요 기능에 따라 맞춤 요금제를 제공합니다. 소규모 학원부터 대형 교육 그룹까지 적합한 플랜이 있으며, 2주 무료 체험 후 결정하실 수 있습니다.",
    },
]

export default function FAQSection() {
    const [openItems, setOpenItems] = useState<number[]>([])
    return (
        <section className="py-24 md:py-32 bg-[#FDFCF8]">
            <div className="container mx-auto px-6 md:px-10 lg:px-16 max-w-5xl">
                <motion.div className="text-center mb-14" {...fadeUp}>
                    <EyebrowTag>FAQ</EyebrowTag>
                    <h2 className="text-3xl md:text-4xl font-sans text-[#1a1a19] leading-tight">
                        자주 묻는 질문
                    </h2>
                </motion.div>

                <div className="space-y-3">
                    {FAQS.map((faq, i) => (
                        <motion.div
                            key={i}
                            initial={{ opacity: 0, y: 15 }}
                            whileInView={{ opacity: 1, y: 0 }}
                            viewport={{ once: true }}
                            transition={{ delay: i * 0.06 }}
                            className="bg-white rounded-xl border border-[rgba(0,0,0,0.06)] overflow-hidden shadow-[0_1px_4px_rgba(0,0,0,0.04)] hover:border-[rgba(8,71,52,0.15)] transition-colors"
                        >
                            <button
                                onClick={() => setOpenItems((items) => items.includes(i) ? items.filter((item) => item !== i) : [...items, i])}
                                className="w-full flex items-center justify-between gap-5 px-8 py-6 text-left md:px-10 lg:px-12"
                            >
                                <span className="text-base font-semibold text-[#31302E] leading-snug md:text-lg">{faq.q}</span>
                                <motion.span
                                    animate={{ rotate: openItems.includes(i) ? 45 : 0 }}
                                    transition={{ duration: 0.2 }}
                                    className="w-7 h-7 rounded-full border border-[rgba(8,71,52,0.2)] text-[#084734] text-base font-bold shrink-0 leading-none flex items-center justify-center bg-[#ECFDF5]/50"
                                >
                                    +
                                </motion.span>
                            </button>
                            <motion.div
                                initial={false}
                                animate={{ height: openItems.includes(i) ? "auto" : 0, opacity: openItems.includes(i) ? 1 : 0 }}
                                transition={{ duration: 0.25 }}
                                className="overflow-hidden"
                            >
                                <p className="px-8 pb-6 text-base text-[#615D59] leading-relaxed border-t border-black/[0.06] pt-5 md:px-10 lg:px-12">
                                    {faq.a}
                                </p>
                            </motion.div>
                        </motion.div>
                    ))}
                </div>

                <div className="mt-8 flex flex-col items-center justify-center gap-1 sm:flex-row sm:gap-8">
                    <TrackedLink
                        href="/faq"
                        ctaId="sw_faq_more"
                        className="inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-[#084734] transition-colors hover:text-[#065c41] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#084734]"
                    >
                        전체 FAQ 보기
                        <ArrowRight className="h-4 w-4" aria-hidden="true" />
                    </TrackedLink>
                    <TrackedLink
                        href="/pricing"
                        ctaId="sw_pricing_link"
                        className="inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-[#084734] transition-colors hover:text-[#065c41] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#084734]"
                    >
                        요금 안내
                        <ArrowRight className="h-4 w-4" aria-hidden="true" />
                    </TrackedLink>
                </div>
            </div>
        </section>
    )
}
