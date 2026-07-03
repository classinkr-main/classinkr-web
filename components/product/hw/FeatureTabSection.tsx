"use client"

import { motion } from "framer-motion"
import Image from "next/image"
import { useState } from "react"

import { fadeUp } from "@/components/motion/presets"

/* ── Feature Tab data ────────────────────────────────────────────── */
type FeatureTab = {
    label: string
    badge: string
    title: string
    points: string[]
    image?: string
    imageAlt?: string
    imageFit?: "cover" | "contain"
    imagePanelClassName?: string
    imageClassName?: string
}

const featureTabs: FeatureTab[] = [
    {
        label: "판서",
        image: "/images/product/hw/features/feature-writing.webp",
        imageAlt: "50페이지 판서 기능 시각화",
        imageFit: "contain",
        imagePanelClassName: "bg-[#05080C]",
        imageClassName: "scale-[1.8] -translate-y-[8%]",
        badge: "50페이지 무한 캔버스",
        title: "공간 걱정 없이 쓰고, 쓰는 즉시 전달",
        points: [
            "50페이지 무한 캔버스 — 지우지 않고 이어가는 수업",
            "0.03초 초저지연 + 50포인트 멀티터치로 분필처럼 자연스러운 판서",
            "쓰는 순간 전 학생 기기에 실시간 동기화 → 필기 대신 수업에 집중",
            "수업 종료 후 자동 PDF 저장·배포로 결석 학생도 그대로 복습",
        ],
    },
    {
        label: "디스플레이",
        image: "/images/product/hw/features/feature-display.webp",
        imageAlt: "클래스인 보드 디스플레이 화질 이미지",
        badge: "178° 광시야각",
        title: "어디서 봐도 선명한 화면",
        points: [
            "178° 광시야각 — 교실 어느 자리서든 동일 화면",
            "풀 라미네이션 + AG·AF 코팅으로 조명 반사 차단",
            "블루라이트 차단 설계로 눈 건강 보호",
        ],
    },
    {
        label: "인터랙티브 수업",
        image: "/images/product/hw/features/feature-interactive.webp",
        imageAlt: "인터랙티브 수업 현장 사진",
        badge: "30+ 수업 도구",
        title: "타이머부터 선착순 퀴즈까지, 생동감 있는 인터랙티브 수업",
        points: [
            "타이머, 스톱워치, 선착순 퀴즈 등 30+ 수업 도구로 수업 리듬을 살립니다",
            "학생 참여 권한 기능으로 필요한 순간 학생도 보드 위에서 직접 조작·판서",
            "교사 혼자 끌고 가는 수업이 아니라, 학생이 함께 움직이는 양방향 수업",
        ],
    },
    {
        label: "AI 카메라",
        image: "/images/product/hw/camera/camera-dual-premium-blended.webp",
        imageAlt: "Classin Board AI 트래킹 카메라 클로즈업",
        imageFit: "contain",
        imagePanelClassName: "bg-[#050708]",
        imageClassName: "scale-[1.08]",
        badge: "수업 영상 자동 생성",
        title: "수업이 끝나면, 영상도 완성됩니다",
        points: [
            "4K AI 카메라가 교사를 자동 추적하며 수업 전체를 녹화",
            "수업 종료 즉시 수업 영상 자동 생성 — 별도 편집·업로드 불필요",
            "8배열 마이크 + AI 노이즈캔슬링으로 선명한 음성 전달",
            "교실+원격 학생 동시 판서, 진짜 하이브리드 수업",
        ],
    },
    {
        label: "SW 생태계",
        image: "/images/product/hw/features/feature-ecosystem.webp",
        imageAlt: "클래스인 소프트웨어 생태계 학습 장면",
        badge: "LMS 완전 통합",
        title: "수업 이후 운영까지 이어지는 Classin 소프트웨어",
        points: [
            "NFC 원터치 로그인 — 내 수업 환경 즉시 로드",
            "출결·과제·성적·알림까지 학원 운영 흐름과 자연스럽게 연결",
            "수업 기록과 학습 데이터가 Classin 시스템 안에 한 번에 쌓입니다",
        ],
    },
]

/* ── Section: Feature Tab ────────────────────────────────────────── */
export default function FeatureTabSection() {
    const [active, setActive] = useState(0)
    const tab = featureTabs[active]

    return (
        <section className="py-24 md:py-32 bg-white">
            <div className="container mx-auto px-4 lg:px-8">
                <motion.div className="text-center mb-12" {...fadeUp}>
                    <p className="text-sm font-semibold text-[#22A366] tracking-wider uppercase mb-3">FEATURES</p>
                    <h2 className="text-3xl md:text-4xl text-[#1a1a19] leading-tight">
                        하나의 보드, <span className="text-[#22A366]">다섯 가지 경험</span>
                    </h2>
                    <p className="text-lg text-slate-500 mt-4 max-w-xl mx-auto">
                        탭을 눌러 각 기능을 빠르게 확인하세요.
                    </p>
                </motion.div>

                {/* Tab buttons */}
                <div className="flex flex-wrap justify-center gap-2 mb-12">
                    {featureTabs.map((t, i) => (
                        <button
                            key={i}
                            onClick={() => setActive(i)}
                            className={`px-5 py-2.5 rounded-full text-sm font-semibold transition-all ${
                                active === i
                                    ? "bg-[#22A366] text-white shadow-md"
                                    : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                            }`}
                        >
                            {t.label}
                        </button>
                    ))}
                </div>

                {/* Tab content */}
                <motion.div
                    key={active}
                    initial={{ opacity: 0, y: 16 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.3 }}
                    className="max-w-5xl mx-auto grid lg:grid-cols-2 gap-10 items-center"
                >
                    {/* Image */}
                    <div className={`rounded-3xl overflow-hidden shadow-2xl ${tab.imagePanelClassName ?? "bg-white"}`}>
                        <div className={`relative aspect-[4/3] ${tab.imagePanelClassName ?? ""}`}>
                            <Image
                                src={tab.image ?? ""}
                                alt={tab.imageAlt ?? tab.title}
                                fill
                                sizes="(max-width: 768px) 100vw, 50vw"
                                className={`${tab.imageFit === "contain" ? "object-contain" : "object-cover"} ${tab.imageClassName ?? ""}`}
                            />
                        </div>
                    </div>

                    {/* Content */}
                    <div>
                        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#22A366]/10 text-[#22A366] text-xs font-bold mb-5 border border-[#22A366]/15">
                            {tab.badge}
                        </div>
                        <h3 className="text-2xl md:text-3xl text-[#1a1a19] mb-8 leading-snug">
                            {tab.title}
                        </h3>
                        <ul className="space-y-4">
                            {tab.points.map((p, i) => (
                                <li key={i} className="flex items-start gap-3">
                                    <div className="w-5 h-5 rounded-full bg-[#22A366]/10 flex items-center justify-center shrink-0 mt-0.5">
                                        <svg className="w-3 h-3 text-[#22A366]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                        </svg>
                                    </div>
                                    <span className="text-slate-600 leading-relaxed">{p}</span>
                                </li>
                            ))}
                        </ul>
                    </div>
                </motion.div>
            </div>
        </section>
    )
}
