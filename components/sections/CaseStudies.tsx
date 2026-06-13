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
    photo: string
    photoAlt: string
    photoClassName?: string
}

const cases: CaseStudy[] = [
    {
        badge: "청주",
        name: "청주 이** 국어",
        meta: "국어 전문 학원, 내신·수능 대비",
        challenge: "첨삭과 과제 피드백이 강사 개인 방식에 의존해 학부모에게 전달되는 정보의 깊이가 달랐습니다.",
        result: "첨삭 기록과 과제 이력을 누적해 강사별 편차를 줄이고 학부모 상담의 설득력을 높였습니다.",
        quote: "국어 수업은 과정 설명이 중요한데, 누적 기록이 생기니 학생 변화와 다음 과제를 더 선명하게 전달할 수 있었습니다.",
        attribution: "담당 강사",
        photo: "/images/case-studies/cheongju-imisook-korean-v3.jpg",
        photoAlt: "청주 이** 국어 도입 사례 사진",
    },
    {
        badge: "평택",
        name: "평택 윤**",
        meta: "입시 학원, 중·고등 수업 운영",
        challenge: "교실별 수업 자료와 판서 기록이 분산되어 수업 이후 복습 안내와 보강 관리가 번거로웠습니다.",
        result: "수업 화면과 자료 흐름을 Classin 중심으로 정리해 학생별 복습과 후속 관리를 더 빠르게 연결했습니다.",
        quote: "수업 장면과 자료가 함께 남으니 학생에게 무엇을 다시 봐야 하는지 안내하기가 훨씬 쉬워졌습니다.",
        attribution: "운영팀장",
        photo: "/images/case-studies/pyeongtaek-yoon-plus.jpg",
        photoAlt: "평택 윤** 도입 사례 사진",
        photoClassName: "object-cover object-top",
    },
    {
        badge: "부산",
        name: "부산 과**",
        meta: "과학 전문 학원, 중·고등 내신 관리",
        challenge: "반별 진도와 테스트 결과가 흩어져 있어 학생별 약점 파악과 재원 관리가 늦어졌습니다.",
        result: "반별 수업 기록과 평가 데이터를 정리해 상담 준비 시간을 줄이고 학습 피드백의 일관성을 높였습니다.",
        quote: "이전에는 상담 전마다 자료를 다시 모아야 했는데, 지금은 학생별 흐름이 바로 보여서 훨씬 빠르게 판단할 수 있습니다.",
        attribution: "원장",
        photo: "/images/case-studies/busan-gwasaram.jpg",
        photoAlt: "부산 과** 도입 사례 사진",
    },
    {
        badge: "대치",
        name: "대치 세**",
        meta: "입시 전문 학원, 상위권 집중 관리",
        challenge: "고난도 수업의 판서와 풀이 과정이 휘발되어 결석·복습 학생에게 같은 품질로 전달하기 어려웠습니다.",
        result: "실시간 판서와 수업 자료를 수업 흐름 안에 모아 복습 자료화와 보강 운영의 밀도를 높였습니다.",
        quote: "설명과 판서가 남으니 학생들이 수업 이후에도 같은 흐름으로 다시 따라올 수 있었습니다.",
        attribution: "원장",
        photo: "/images/case-studies/daechi-sejeong.webp",
        photoAlt: "대치 세** 도입 사례 사진",
    },
    {
        badge: "대구",
        name: "대구 학**",
        meta: "입시 학원, 정규반·특강 운영",
        challenge: "정규 수업과 특강이 병행되며 강의 자료, 출결, 과제 안내를 한 번에 관리하기 어려웠습니다.",
        result: "수업 전후 운영 정보를 한곳에 모아 강사와 운영팀이 같은 기준으로 학생을 관리하게 됐습니다.",
        quote: "수업이 끝난 뒤 해야 할 일이 명확해졌습니다. 자료 공유와 후속 안내가 전보다 훨씬 정돈됐습니다.",
        attribution: "운영팀",
        photo: "/images/case-studies/daegu-hakmundang.jpg",
        photoAlt: "대구 학** 도입 사례 사진",
    },
    {
        badge: "천안",
        name: "천안 제**",
        meta: "집중형 강의실, 하이브리드 수업 환경",
        challenge: "강의실마다 장비와 수업 환경이 달라 수업 준비와 장비 점검에 반복 시간이 들어갔습니다.",
        result: "Classin 보드 중심으로 교실 환경을 표준화해 수업 준비 부담을 줄이고 운영 안정성을 높였습니다.",
        quote: "강의실 세팅이 일정해지니 수업 시작 전 확인해야 할 일이 줄었고, 운영팀도 훨씬 안정적으로 움직입니다.",
        attribution: "운영 담당자",
        photo: "/images/case-studies/cheonan-jayscan.jpg",
        photoAlt: "천안 제** 도입 사례 사진",
    },
    {
        badge: "12인",
        name: "12인 에**",
        meta: "온라인 수업 전문, 참여형 활동 운영",
        challenge: "비대면 수업에서 학생 참여도와 활동 결과를 한눈에 확인하기 어려웠습니다.",
        result: "게임형 활동과 수업 기록을 연결해 온라인에서도 학생별 참여 흐름을 더 선명하게 파악했습니다.",
        quote: "온라인 수업에서도 학생들이 직접 움직이는 느낌이 생겼습니다. 참여 결과가 보여서 피드백도 빨라졌습니다.",
        attribution: "운영팀",
        photo: "/images/case-studies/online-12inedu.jpg",
        photoAlt: "12인 에** 도입 사례 사진",
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
                                                <Image
                                                    src={caseItem.photo}
                                                    alt={caseItem.photoAlt}
                                                    fill
                                                    unoptimized
                                                    sizes="(min-width: 768px) 480px, 82vw"
                                                    className={caseItem.photoClassName ?? "object-cover"}
                                                />
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
