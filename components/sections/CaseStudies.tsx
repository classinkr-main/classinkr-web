"use client"

import { useEffect, useState } from "react"
import Image from "next/image"
import { motion } from "framer-motion"
import { Card, CardContent } from "@/components/ui/card"
import { ChevronLeft, ChevronRight, Quote } from "lucide-react"

type CaseStudy = {
    badge: string
    name: string
    meta: string
    challenge: string
    result: string
    quote: string
    attribution: string
    photo: string | null
    photoAlt: string
    placeholder: string
}

const cases: CaseStudy[] = [
    {
        badge: "부천",
        name: "부천 정*** 학원",
        meta: "입시 전문 학원, 중·고등부 중심 운영",
        challenge: "오프라인 수업 중심 운영으로 결석 학생 보강과 수업 자료 공유가 반복 업무로 쌓였습니다.",
        result: "수업 자료와 보강 흐름을 한곳에 모아 학생 관리 속도와 학부모 응대 품질을 함께 개선했습니다.",
        quote: "수업 이후 관리가 훨씬 정돈됐습니다. 강사마다 달랐던 보강 안내와 자료 전달 방식도 하나의 기준으로 맞출 수 있었습니다.",
        attribution: "대표원장",
        photo: null,
        photoAlt: "부천 정*** 학원 도입 사례 사진",
        placeholder: "bg-[linear-gradient(135deg,#E8E2D9_0%,#BFD9CD_52%,#F1B98D_100%)]",
    },
    {
        badge: "온라인",
        name: "온라인 ***에듀",
        meta: "온라인 수업 전문, 전국 수강생 대상",
        challenge: "비대면 수업 특성상 학생 참여도와 과제 진행 상황을 실시간으로 확인하기 어려웠습니다.",
        result: "수업 참여, 과제, 피드백 기록을 연결해 온라인에서도 학생별 학습 흐름을 안정적으로 추적했습니다.",
        quote: "온라인 수업에서도 학생이 어디에서 막히는지 더 빨리 보입니다. 상담할 때도 감이 아니라 기록을 기준으로 이야기할 수 있게 됐습니다.",
        attribution: "운영팀장",
        photo: null,
        photoAlt: "온라인 ***에듀 도입 사례 사진",
        placeholder: "bg-[linear-gradient(135deg,#DBEAFE_0%,#A7C7B7_50%,#F6E7C9_100%)]",
    },
    {
        badge: "부산",
        name: "부산 과** 학원",
        meta: "과학 전문 학원, 중·고등 내신 관리",
        challenge: "반별 진도와 테스트 결과가 흩어져 있어 학생별 약점 파악과 재원 관리가 늦어졌습니다.",
        result: "반별 수업 기록과 평가 데이터를 정리해 상담 준비 시간을 줄이고 학습 피드백의 일관성을 높였습니다.",
        quote: "이전에는 상담 전마다 자료를 다시 모아야 했는데, 지금은 학생별 흐름이 바로 보여서 훨씬 빠르게 판단할 수 있습니다.",
        attribution: "원장",
        photo: null,
        photoAlt: "부산 과** 학원 도입 사례 사진",
        placeholder: "bg-[linear-gradient(135deg,#D7E8F0_0%,#D8D6C4_45%,#CC8767_100%)]",
    },
    {
        badge: "청주",
        name: "청주 이** 국어 학원",
        meta: "국어 전문 학원, 내신·수능 대비",
        challenge: "첨삭과 과제 피드백이 강사 개인 방식에 의존해 학부모에게 전달되는 정보의 깊이가 달랐습니다.",
        result: "첨삭 기록과 과제 이력을 누적해 강사별 편차를 줄이고 학부모 상담의 설득력을 높였습니다.",
        quote: "국어 수업은 과정 설명이 중요한데, 누적 기록이 생기니 학생 변화와 다음 과제를 더 선명하게 전달할 수 있었습니다.",
        attribution: "담당 강사",
        photo: null,
        photoAlt: "청주 이** 국어 학원 도입 사례 사진",
        placeholder: "bg-[linear-gradient(135deg,#EAD7D0_0%,#C5D7C0_50%,#8BA6B8_100%)]",
    },
]

const AUTO_ADVANCE_MS = 8500
const SLIDE_SPACING_PX = 360

export function CaseStudies() {
    const [activeIndex, setActiveIndex] = useState(0)

    useEffect(() => {
        const timer = window.setInterval(() => {
            setActiveIndex((currentIndex) => (currentIndex + 1) % cases.length)
        }, AUTO_ADVANCE_MS)

        return () => window.clearInterval(timer)
    }, [])

    const paginate = (nextDirection: number) => {
        setActiveIndex((currentIndex) => (currentIndex + nextDirection + cases.length) % cases.length)
    }

    const goToSlide = (nextIndex: number) => {
        setActiveIndex(nextIndex)
    }

    return (
        <section className="py-16 md:py-24 bg-[#F6F5F4]">
            <div className="container mx-auto">
                <h2 className="text-3xl font-extrabold text-center text-[#111110] sm:text-4xl mb-12 break-keep">
                    성공적인 도입 사례
                </h2>

                <div className="mx-auto max-w-6xl px-4">
                    <div className="relative h-[760px] overflow-hidden py-4 sm:h-[700px] md:h-[660px]">
                        {cases.map((caseItem, index) => {
                            const offset = index - activeIndex
                            const distance = Math.abs(offset)
                            const isActive = offset === 0

                            return (
                                <motion.article
                                    key={caseItem.name}
                                    onClick={() => goToSlide(index)}
                                    initial={false}
                                    animate={{
                                        x: `calc(-50% + ${offset * SLIDE_SPACING_PX}px)`,
                                        scale: isActive ? 1 : distance === 1 ? 0.84 : 0.72,
                                        opacity: isActive ? 1 : distance === 1 ? 0.58 : 0.24,
                                        zIndex: cases.length - distance,
                                    }}
                                    transition={{ type: "spring", stiffness: 170, damping: 24, mass: 0.9 }}
                                    className="absolute left-1/2 top-4 w-[82vw] max-w-[480px] cursor-pointer"
                                    aria-hidden={!isActive}
                                >
                                    <Card className={`overflow-hidden border bg-white transition-shadow duration-200 ${isActive ? "border-[#084734]/30 shadow-[0_28px_90px_rgba(17,17,16,0.16)]" : "border-black/[0.08] shadow-sm"}`}>
                                        <CardContent className="p-0">
                                            <div className="relative h-44 overflow-hidden bg-[#E4E0DA] sm:h-56">
                                                {caseItem.photo ? (
                                                    <Image
                                                        src={caseItem.photo}
                                                        alt={caseItem.photoAlt}
                                                        fill
                                                        sizes="(min-width: 768px) 480px, 82vw"
                                                        className="object-cover"
                                                    />
                                                ) : (
                                                    <div className={`absolute inset-0 ${caseItem.placeholder}`}>
                                                        <div className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-black/35 to-transparent" />
                                                        <div className="absolute bottom-4 left-5 text-sm font-bold text-white">사진 업데이트 예정</div>
                                                    </div>
                                                )}
                                            </div>

                                            <div className="p-7 sm:p-8">
                                                <div className="flex items-center gap-4 mb-7">
                                                    <div className="w-12 h-12 bg-[#ECFDF5] rounded-full flex items-center justify-center font-bold text-[#A39E98] shrink-0">
                                                        {caseItem.badge}
                                                    </div>
                                                    <div>
                                                        <div className="font-bold text-[#111110]">{caseItem.name}</div>
                                                        <div className="text-xs text-muted-foreground break-keep">{caseItem.meta}</div>
                                                    </div>
                                                </div>

                                                <div className="grid gap-5 sm:grid-cols-2">
                                                    <div className="space-y-2">
                                                        <div className="text-sm font-semibold text-[#A39E98] uppercase">도전 과제 (Challenge)</div>
                                                        <p className="text-[#615D59] text-sm leading-6 break-keep">{caseItem.challenge}</p>
                                                    </div>
                                                    <div className="space-y-2">
                                                        <div className="text-sm font-semibold text-[#084734] uppercase">결과 (Result)</div>
                                                        <p className="text-[#111110] text-sm font-medium leading-6 break-keep">{caseItem.result}</p>
                                                    </div>
                                                </div>

                                                <blockquote className="bg-[#F6F5F4] p-4 rounded-lg italic text-[#615D59] text-sm relative break-keep mt-6">
                                                    <Quote className="w-4 h-4 text-[#A39E98]/60 absolute -top-2 -left-2 fill-current" />
                                                    &quot;{caseItem.quote}&quot;
                                                    <div className="mt-3 text-right font-bold text-[#A39E98] not-italic text-xs break-keep">- {caseItem.attribution}</div>
                                                </blockquote>
                                            </div>
                                        </CardContent>
                                    </Card>
                                </motion.article>
                            )
                        })}
                    </div>

                    <div className="mt-2 flex items-center justify-center gap-8">
                        <button
                            type="button"
                            aria-label="이전 도입 사례"
                            onClick={() => paginate(-1)}
                            className="inline-flex h-10 w-10 items-center justify-center text-[#A39E98] transition hover:text-[#084734] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#084734] focus-visible:ring-offset-2"
                        >
                            <ChevronLeft className="h-7 w-7" />
                        </button>

                        <button
                            type="button"
                            aria-label="다음 도입 사례"
                            onClick={() => paginate(1)}
                            className="inline-flex h-10 w-10 items-center justify-center text-[#A39E98] transition hover:text-[#084734] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#084734] focus-visible:ring-offset-2"
                        >
                            <ChevronRight className="h-7 w-7" />
                        </button>
                    </div>
                </div>
            </div>
        </section>
    )
}
