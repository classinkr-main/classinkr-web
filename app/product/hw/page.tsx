"use client"

import { Button } from "@/components/ui/button"
import { BROCHURE_URL } from "@/lib/marketing-links"
import { motion, useInView } from "framer-motion"
import {
    ArrowRight, PenTool, Eye, Share2,
    Monitor, Fingerprint, Users, Layers, Wifi,
    Shield, Maximize, ChevronRight, Zap, Hand,
    GraduationCap, Mic, Camera, Star,
} from "lucide-react"
import Image from "next/image"
import Link from "next/link"
import { useRef, useState } from "react"

import OpeningStatement from "@/components/product/hw/OpeningStatement"
import PainPointsV2 from "@/components/product/hw/PainPointsV2"
import AllInOneStatement from "@/components/product/hw/AllInOneStatement"
import BigBackdropImage from "@/components/product/hw/BigBackdropImage"
import DesignDetails from "@/components/product/hw/DesignDetails"
import LatencyProof from "@/components/product/hw/LatencyProof"
import AICameraSection from "@/components/product/hw/AICameraSection"
import SizeChooser from "@/components/product/hw/SizeChooser"
import ValueAnchor from "@/components/product/hw/ValueAnchor"
import ClassroomStudioSection from "@/components/product/hw/ClassroomStudioSection"
import AfterClassSection from "@/components/product/hw/AfterClassSection"

/* ── Animation helpers ───────────────────────────────────────────── */
const fadeUp = {
    initial: { opacity: 0, y: 30 },
    whileInView: { opacity: 1, y: 0 },
    viewport: { once: true },
    transition: { duration: 0.6 },
}

const stagger = (i: number) => ({
    ...fadeUp,
    transition: { duration: 0.5, delay: i * 0.12 },
})

/* ── Spec data ───────────────────────────────────────────────────── */
const specRows = [
    { label: "화면 크기", s110: '110"', s86: '86"', s75: '75"', s65: '65"' },
    { label: "모델명", s110: "BS110A", s86: "BS86A", s75: "BS75A", s65: "BS65A" },
    { label: "터치 포인트", s110: "50점", s86: "50점", s75: "50점", s65: "50점" },
    { label: "터치 방식", s110: "적외선", s86: "적외선", s75: "적외선", s65: "적외선" },
    { label: "응답 속도", s110: "2ms", s86: "2ms", s75: "2ms", s65: "2ms" },
    { label: "스피커", s110: "2×15W", s86: "2×15W", s75: "2×15W", s65: "2×15W" },
    { label: "내장 마이크", s110: "—", s86: "8배열", s75: "8배열", s65: "8배열" },
    { label: "측면 제스처바", s110: "양측", s86: "양측", s75: "—", s65: "—" },
    { label: "OPS 모듈", s110: "기본 제공", s86: "기본 제공", s75: "기본 제공", s65: "기본 제공" },
]

const lineupCards = [
    { model: "S110", size: '110"', rec: "대형 강의실 · 강당", color: "from-slate-900 to-slate-700", textColor: "text-white", badge: "FLAGSHIP" },
    { model: "S86", size: '86"', rec: "일반 교실 · 회의실", color: "from-[#22A366] to-[#1B8A55]", textColor: "text-white", badge: "BEST" },
    { model: "S75", size: '75"', rec: "중소 교실 · 세미나실", color: "from-slate-100 to-white", textColor: "text-slate-900", badge: "" },
    { model: "S65", size: '65"', rec: "소규모 교실 · 스터디룸", color: "from-slate-100 to-white", textColor: "text-slate-900", badge: "" },
]

/* ── Section: Comparison ─────────────────────────────────────────── */
function ComparisonSection() {
    const ref = useRef(null)
    const inView = useInView(ref, { once: true, margin: "-100px" })

    const items = [
        {
            title: "기존 칠판",
            problems: ["분필 먼지와 소모 관리", "지우면 기록이 사라짐", "공유·저장 불가"],
            bg: "bg-slate-100",
            border: "border-slate-200",
            iconColor: "text-slate-400",
        },
        {
            title: "일반 전자칠판",
            problems: ["필기감과 반응의 이질감", "운영용 소프트웨어 별도 구성", "화면 출력 중심의 장비"],
            bg: "bg-slate-50",
            border: "border-slate-200",
            iconColor: "text-slate-400",
        },
        {
            title: "ClassIn Board",
            problems: ["자연스러운 판서와 기록의 동시성", "소프트웨어까지 이어지는 통합 경험", "교실 안팎을 잇는 수업 흐름"],
            bg: "bg-[#F0FFF4]",
            border: "border-[#22A366]/20",
            iconColor: "text-[#22A366]",
            highlight: true,
        },
    ]

    return (
        <section className="py-24 md:py-32 bg-white">
            <div className="container mx-auto px-4 lg:px-8">
                <motion.div className="text-center mb-16" {...fadeUp}>
                    <p className="text-sm font-semibold text-[#22A366] tracking-wider uppercase mb-3">WHY CLASSIN BOARD</p>
                    <h2 className="text-3xl md:text-4xl lg:text-5xl text-[#1a1a19] leading-tight">
                        비슷해 보여도,
                        <br className="hidden sm:block" />
                        <span className="text-[#22A366]">교실의 완성도</span>는 다릅니다
                    </h2>
                </motion.div>

                <div ref={ref} className="grid md:grid-cols-3 gap-6 max-w-5xl mx-auto">
                    {items.map((item, i) => (
                        <motion.div
                            key={i}
                            initial={{ opacity: 0, y: 40 }}
                            animate={inView ? { opacity: 1, y: 0 } : {}}
                            transition={{ duration: 0.5, delay: i * 0.15 }}
                            className={`rounded-2xl border ${item.border} ${item.bg} p-8 ${item.highlight ? "ring-2 ring-[#22A366]/20 shadow-lg shadow-[#22A366]/5 scale-[1.02]" : ""}`}
                        >
                            <h3 className={`text-xl font-bold mb-6 ${item.highlight ? "text-[#22A366]" : "text-slate-900"}`}>
                                {item.title}
                            </h3>
                            <ul className="space-y-4">
                                {item.problems.map((p, j) => (
                                    <li key={j} className="flex items-start gap-3">
                                        <div className={`mt-0.5 ${item.iconColor}`}>
                                            {item.highlight ? (
                                                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                                                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                                </svg>
                                            ) : (
                                                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                                    <path strokeLinecap="round" strokeLinejoin="round" d="M18 12H6" />
                                                </svg>
                                            )}
                                        </div>
                                        <span className={`text-sm leading-relaxed ${item.highlight ? "text-slate-700 font-medium" : "text-slate-500"}`}>{p}</span>
                                    </li>
                                ))}
                            </ul>
                        </motion.div>
                    ))}
                </div>
            </div>
        </section>
    )
}

/* ── Section: Feature Block (reusable) ───────────────────────────── */
function FeatureSection({
    tag, title, desc, features, reverse = false, accent = "#22A366", children,
}: {
    tag: string; title: React.ReactNode; desc: string
    features: { icon: React.ReactNode; label: string; detail: string }[]
    reverse?: boolean; accent?: string; children?: React.ReactNode
}) {
    return (
        <section className="py-24 md:py-32">
            <div className="container mx-auto px-4 lg:px-8">
                <div className={`flex flex-col ${reverse ? "lg:flex-row-reverse" : "lg:flex-row"} items-center gap-16 lg:gap-20`}>
                    {/* Text side */}
                    <div className="flex-1 max-w-xl">
                        <motion.div {...fadeUp}>
                            <p className="text-sm font-semibold tracking-wider uppercase mb-3" style={{ color: accent }}>{tag}</p>
                            <h2 className="text-3xl md:text-4xl lg:text-[2.75rem] text-[#1a1a19] leading-tight mb-6">
                                {title}
                            </h2>
                            <p className="text-lg text-slate-500 leading-relaxed mb-10">{desc}</p>
                        </motion.div>

                        <div className="space-y-6">
                            {features.map((f, i) => (
                                <motion.div key={i} {...stagger(i)} className="flex items-start gap-4">
                                    <div className="flex items-center justify-center shrink-0"
                                        style={{ color: accent }}>
                                        {f.icon}
                                    </div>
                                    <div>
                                        <h4 className="font-sans font-bold tabular-nums text-slate-900 mb-1">{f.label}</h4>
                                        <p className="text-sm text-slate-500 leading-relaxed">{f.detail}</p>
                                    </div>
                                </motion.div>
                            ))}
                        </div>
                    </div>

                    {/* Visual side */}
                    <div className="flex-1 w-full max-w-lg">
                        {children ?? (
                            <motion.div
                                {...fadeUp}
                                className="aspect-[4/3] rounded-3xl bg-gradient-to-br from-slate-100 to-slate-50 border border-slate-200/60 shadow-xl shadow-slate-200/30 flex items-center justify-center"
                            >
                                <Monitor className="w-20 h-20 text-slate-300" />
                            </motion.div>
                        )}
                    </div>
                </div>
            </div>
        </section>
    )
}

/* ── Feature Tab data ────────────────────────────────────────────── */
const featureTabs = [
    {
        label: "판서",
        image: "/images/product/hw/writing/writing-multitouch.jpg",
        badge: "50페이지 무한 캔버스",
        title: "지우지 않아도 흐름이 이어집니다",
        points: [
            "50페이지 캔버스 위에 수업의 전개를 그대로 남깁니다",
            "쓰는 순간 학생 기기에도 같은 내용이 함께 반영됩니다",
            "낮은 지연과 50포인트 터치로 설명이 자연스럽게 이어집니다",
        ],
    },
    {
        label: "디스플레이",
        image: "/images/product/hw/display/display-wall-cinematic.jpg",
        badge: "178° 광시야각",
        title: "어느 자리에서도 같은 내용이 선명합니다",
        points: [
            "178° 광시야각으로 어느 자리에서도 같은 가독성 유지",
            "풀 라미네이션과 AG·AF 코팅으로 반사와 얼룩을 줄임",
            "오랜 수업에도 눈의 부담을 낮추는 화면 설계",
        ],
    },
    {
        label: "판서 공유",
        image: "/images/product/hw/writing/writing-closeup.jpg",
        badge: "실시간 동기화",
        title: "판서는 쓰는 순간, 함께 남습니다",
        points: [
            "실시간 판서 동기화로 태블릿과 노트북에 즉시 반영됩니다",
            "수업 종료 후 판서 내용이 PDF로 자동 저장되고 공유됩니다",
            "결석한 학생도 같은 자료로 수업 흐름을 다시 따라갈 수 있습니다",
        ],
    },
    {
        label: "AI 카메라",
        image: "/images/product/hw/camera/camera-ai-unit-front.png",
        badge: "수업 영상 자동 생성",
        title: "수업은 끝나도 그대로 남습니다",
        points: [
            "4K AI 카메라가 교사를 자동 추적하며 수업 전체를 기록합니다",
            "수업 종료 후 복습용 영상이 바로 정리돼 편집·업로드 부담을 줄입니다",
            "8배열 마이크와 AI 노이즈캔슬링으로 또렷한 음성 전달",
            "교실과 원격 학생이 같은 흐름으로 참여하는 하이브리드 수업을 만듭니다",
        ],
    },
    {
        label: "SW 생태계",
        image: "/images/product/hw/ecosystem/ecosystem-board-ui.png",
        badge: "20+ 강의 도구",
        title: "보드에서 시작해 운영까지 이어집니다",
        points: [
            "NFC 원터치 로그인으로 내 수업 환경이 바로 열립니다",
            "출결·과제·성적·알림이 하나의 LMS 흐름으로 이어집니다",
            "투표·퀴즈·타이머 등 강의 도구를 보드 위에서 바로 실행합니다",
        ],
    },
]

/* ── Section: Feature Tab ────────────────────────────────────────── */
function FeatureTabSection() {
    const [active, setActive] = useState(0)
    const tab = featureTabs[active]

    return (
        <section className="py-24 md:py-32 bg-white">
            <div className="container mx-auto px-4 lg:px-8">
                <motion.div className="text-center mb-12" {...fadeUp}>
                    <p className="text-sm font-semibold text-[#22A366] tracking-wider uppercase mb-3">FEATURES</p>
                    <h2 className="text-3xl md:text-4xl text-[#1a1a19] leading-tight">
                        좋은 수업은,
                        <br />
                        <span className="text-[#22A366]">기능보다 흐름</span>이 먼저입니다
                    </h2>
                    <p className="text-lg text-slate-500 mt-4 max-w-xl mx-auto">
                        판서, 화면, 공유, 기록, 운영. 각각이 좋아야 전체 수업 경험이 달라집니다.
                    </p>
                </motion.div>

                {/* Tab buttons */}
                <div className="flex flex-wrap justify-center gap-2 mb-12">
                    {featureTabs.map((t, i) => (
                        <button
                            key={i}
                            onClick={() => setActive(i)}
                            className={`px-5 py-2.5 rounded-full text-sm font-semibold transition-all ${active === i
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
                    <div className="rounded-3xl overflow-hidden shadow-2xl">
                        <Image
                            src={tab.image}
                            alt={tab.title}
                            width={800}
                            height={600}
                            sizes="(max-width: 768px) 100vw, 50vw"
                            className="w-full h-auto"
                        />
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

/* ── Section: Product Anatomy ────────────────────────────────────── */
function ProductAnatomySection() {
    const physicalSpecs = [
        { label: "두께", value: "단 110mm", sub: "초슬림 알루미늄 바디" },
        { label: "베젤", value: "22mm 슬림베젤", sub: "화면 집중도 극대화" },
        { label: "제스처바", value: "양측 탑재", sub: "S110·S86 좌우 모두 지원" },
        { label: "OPS 슬롯", value: "기본 내장", sub: "외장 PC 없이 독립 구동" },
        { label: "NFC", value: "원터치 로그인", sub: "교사 카드 태그 즉시 인증" },
        { label: "펜 트레이", value: "시그니처 오렌지", sub: "자석 부착, 스타일러스 2개 포함" },
    ]

    return (
        <section className="py-24 md:py-32 bg-[#FDFCF8]">
            <div className="container mx-auto px-4 lg:px-8">
                <motion.div className="text-center mb-16" {...fadeUp}>
                    <p className="text-sm font-semibold text-[#22A366] tracking-wider uppercase mb-3">PRODUCT DESIGN</p>
                    <h2 className="text-3xl md:text-4xl lg:text-5xl text-[#1a1a19] leading-tight">
                        보이지 않는 차이가,
                        <br />
                        <span className="text-[#22A366]">수업에 오래 남습니다</span>
                    </h2>
                    <p className="text-lg text-slate-500 mt-4 max-w-xl mx-auto">
                        두께, 베젤, 트레이, 로그인 방식까지. 매일 쓰는 도구일수록 작은 차이가 더 분명합니다.
                    </p>
                </motion.div>

                <div className="max-w-6xl mx-auto grid lg:grid-cols-2 gap-14 items-center">
                    {/* Side profile image */}
                    <motion.div {...fadeUp} className="rounded-3xl overflow-hidden shadow-xl bg-slate-50">
                        <Image
                            src="/images/product/hw/board/board-side-profile.png"
                            alt="ClassIn Board 측면 슬림 프로파일 — 110mm"
                            width={800}
                            height={600}
                            sizes="(max-width: 768px) 100vw, 50vw"
                            className="w-full h-auto"
                        />
                    </motion.div>

                    {/* Spec callout grid */}
                    <div className="grid sm:grid-cols-2 gap-4">
                        {physicalSpecs.map((s, i) => (
                            <motion.div
                                key={i}
                                {...stagger(i)}
                                className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 hover:shadow-md hover:border-[#22A366]/20 transition-all"
                            >
                                <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">{s.label}</div>
                                <div className="text-base font-sans font-bold tabular-nums tracking-tight text-[#1a1a19] mb-0.5">{s.value}</div>
                                <div className="text-xs text-slate-400 leading-relaxed">{s.sub}</div>
                            </motion.div>
                        ))}
                    </div>
                </div>
            </div>
        </section>
    )
}

/* ── Section: Impact Numbers (Full-width dark) ───────────────────── */
function ImpactNumbersSection() {
    const ref = useRef(null)
    const inView = useInView(ref, { once: true, margin: "-50px" })

    const stats = [
        { value: "1,200+", label: "도입 학교·기관", sub: "국내외 교육 현장" },
        { value: "35,000+", label: "활성 교사", sub: "매일 수업에 활용 중" },
        { value: "12개국", label: "글로벌 교육 시장", sub: "아시아·유럽·미주" },
    ]

    return (
        <section ref={ref} className="bg-[#0d1a12] relative overflow-hidden">
            <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_60%_at_50%_50%,_rgba(34,163,102,0.13)_0%,_transparent_100%)]" />
            <div className="container mx-auto px-4 lg:px-8 py-20 md:py-28 relative">
                <div className="grid md:grid-cols-3 divide-y md:divide-y-0 md:divide-x divide-white/8">
                    {stats.map((s, i) => (
                        <motion.div
                            key={i}
                            initial={{ opacity: 0, y: 24 }}
                            animate={inView ? { opacity: 1, y: 0 } : {}}
                            transition={{ duration: 0.6, delay: i * 0.15 }}
                            className="py-12 md:py-0 md:px-16 text-center"
                        >
                            <div className="text-5xl md:text-6xl lg:text-7xl font-sans font-bold tabular-nums tracking-tight text-white leading-none mb-3">
                                {s.value}
                            </div>
                            <div className="text-xs font-bold text-[#22A366] uppercase tracking-[0.2em] mb-2">{s.label}</div>
                            <div className="text-sm text-white/35">{s.sub}</div>
                        </motion.div>
                    ))}
                </div>
            </div>
        </section>
    )
}

/* ── Section: Full-Width Point (reusable) ────────────────────────── */
function FullWidthPointSection({
    eyebrow, statement, sub, dark = false, image,
}: {
    eyebrow: string; statement: React.ReactNode; sub?: string; dark?: boolean; image?: string
}) {
    return (
        <section className={`relative min-h-[65vh] flex items-center justify-center overflow-hidden ${dark ? "bg-[#0d1a12]" : "bg-[#22A366]"}`}>
            {image && (
                <Image src={image} alt="" fill className="object-cover" sizes="100vw" />
            )}
            <div className={`absolute inset-0 ${dark ? "bg-[#0d1a12]/75" : "bg-[#0d1a12]/65"}`} />
            <div className="relative container mx-auto px-4 lg:px-8 py-28 md:py-40 text-center text-white">
                <motion.div {...fadeUp}>
                    <p className="text-xs font-bold tracking-[0.35em] uppercase mb-7 text-white/50">{eyebrow}</p>
                    <h2 className="text-4xl sm:text-5xl lg:text-6xl xl:text-[5rem] leading-[1.1] tracking-tight mb-8 max-w-4xl mx-auto">
                        {statement}
                    </h2>
                    {sub && (
                        <p className="text-lg md:text-xl text-white/60 max-w-2xl mx-auto leading-relaxed">{sub}</p>
                    )}
                </motion.div>
            </div>
        </section>
    )
}

/* ── Section: Lesson Timeline ────────────────────────────────────── */
const timelineSteps = [
    {
        time: "08:55",
        icon: <Fingerprint className="w-4 h-4" />,
        title: "NFC 원터치 로그인",
        desc: "카드 태그 한 번으로 내 수업 환경이 바로 열립니다. 비밀번호 입력과 별도 설정이 줄어듭니다.",
    },
    {
        time: "09:00",
        icon: <PenTool className="w-4 h-4" />,
        title: "판서 시작, 수업 기록도 동시에",
        desc: "쓰는 즉시 학생 기기에 반영되고 AI 카메라는 교사를 추적하며 수업 기록을 시작합니다.",
    },
    {
        time: "09:15",
        icon: <Users className="w-4 h-4" />,
        title: "학생 협업 판서",
        desc: "여러 학생이 동시에 칠판에 참여해 설명형 수업이 참여형 수업으로 바뀝니다.",
    },
    {
        time: "09:40",
        icon: <Share2 className="w-4 h-4" />,
        title: "끝나면 자료가 자동으로 정리",
        desc: "판서는 PDF로, 수업은 영상으로 저장돼 따로 정리하고 업로드할 일이 줄어듭니다.",
    },
    {
        time: "방과후",
        icon: <Monitor className="w-4 h-4" />,
        title: "수업 영상 + 판서 노트로 복습",
        desc: "학생은 영상과 판서를 함께 보며 교실에서 들은 흐름 그대로 복습할 수 있습니다.",
    },
]

function LessonTimelineSection() {
    return (
        <section className="py-24 md:py-32 bg-[#FDFCF8]">
            <div className="container mx-auto px-4 lg:px-8">
                <motion.div className="text-center mb-16" {...fadeUp}>
                    <p className="text-sm font-semibold text-[#22A366] tracking-wider uppercase mb-3">A DAY WITH CLASSIN BOARD</p>
                    <h2 className="text-3xl md:text-4xl lg:text-5xl text-[#1a1a19] leading-tight">
                        수업 하루가
                        <br />
                        <span className="text-[#22A366]">더 정돈됩니다</span>
                    </h2>
                </motion.div>

                <div className="max-w-2xl mx-auto relative">
                    <div className="absolute left-[5.25rem] top-5 bottom-5 w-px bg-gradient-to-b from-[#22A366]/40 via-[#22A366]/20 to-transparent hidden sm:block" />

                    <div className="space-y-10">
                        {timelineSteps.map((step, i) => (
                            <motion.div key={i} {...stagger(i)} className="flex items-start gap-5">
                                <div className="shrink-0 w-16 text-right pt-2.5">
                                    <span className="text-[11px] font-bold tabular-nums text-slate-400 leading-none">{step.time}</span>
                                </div>
                                <div className="relative shrink-0 z-10">
                                    <div className="w-9 h-9 rounded-full bg-[#22A366]/10 border border-[#22A366]/25 flex items-center justify-center text-[#22A366]">
                                        {step.icon}
                                    </div>
                                </div>
                                <div className="pt-1.5 pb-2">
                                    <h3 className="font-bold text-slate-900 mb-1.5 text-sm">{step.title}</h3>
                                    <p className="text-sm text-slate-500 leading-relaxed">{step.desc}</p>
                                </div>
                            </motion.div>
                        ))}
                    </div>
                </div>
            </div>
        </section>
    )
}

/* ── Section: Testimonials ───────────────────────────────────────── */
const testimonials = [
    {
        quote: "판서가 학생 태블릿에 바로 떠요. 맨 뒷자리 학생들 표정이 달라졌습니다. 수업 집중도가 눈에 보인다고 처음 느꼈어요.",
        name: "김지수 선생님",
        school: "서울 ○○중학교 수학",
        model: "S86 도입",
        rating: 5,
    },
    {
        quote: "원격 수업 때 AI 카메라가 저를 따라다니니까 따로 누가 카메라를 잡아줄 필요가 없어요. 혼자서도 완전한 하이브리드 수업이 됩니다.",
        name: "박현수 선생님",
        school: "경기 ○○고등학교 과학",
        model: "S110 도입",
        rating: 5,
    },
    {
        quote: "NFC로 로그인하고 바로 수업에 들어가는 게 처음엔 신기했는데, 이제 없으면 불편할 것 같아요. 아이들도 칠판 앞에 나와서 직접 씁니다.",
        name: "이민정 선생님",
        school: "부산 ○○초등학교",
        model: "S75 도입",
        rating: 5,
    },
]

function TestimonialSection() {
    return (
        <section className="py-24 md:py-32 bg-white">
            <div className="container mx-auto px-4 lg:px-8">
                <motion.div className="text-center mb-14" {...fadeUp}>
                    <p className="text-sm font-semibold text-[#22A366] tracking-wider uppercase mb-3">VOICES FROM CLASSROOMS</p>
                    <h2 className="text-3xl md:text-4xl text-[#1a1a19] leading-tight">
                        먼저 써본
                        <br />
                        <span className="text-[#22A366]">선생님들이 말합니다</span>
                    </h2>
                </motion.div>

                <div className="grid md:grid-cols-3 gap-6 max-w-5xl mx-auto">
                    {testimonials.map((t, i) => (
                        <motion.div
                            key={i}
                            {...stagger(i)}
                            className="bg-[#FDFCF8] rounded-2xl border border-slate-100 shadow-sm p-7 flex flex-col"
                        >
                            <div className="flex gap-0.5 mb-5">
                                {Array.from({ length: t.rating }).map((_, j) => (
                                    <Star key={j} className="w-4 h-4 fill-[#22A366] text-[#22A366]" />
                                ))}
                            </div>
                            <p className="text-slate-600 leading-relaxed text-sm flex-1 mb-6">
                                &ldquo;{t.quote}&rdquo;
                            </p>
                            <div className="border-t border-slate-100 pt-5">
                                <div className="font-bold text-slate-900 text-sm">{t.name}</div>
                                <div className="text-xs text-slate-400 mt-0.5">{t.school}</div>
                                <div className="inline-flex mt-2.5 px-2.5 py-1 rounded-full bg-[#22A366]/8 text-[#22A366] text-[10px] font-bold border border-[#22A366]/15">
                                    {t.model}
                                </div>
                            </div>
                        </motion.div>
                    ))}
                </div>
            </div>
        </section>
    )
}

/* ── Section: Space Scenarios ────────────────────────────────────── */
const spaceScenarios = [
    {
        model: "S110", size: '110"', badge: "FLAGSHIP",
        tag: "강당 · 대형 강의실",
        story: "대형 강의와 설명회처럼 먼 자리까지 화면 전달력이 중요한 공간에 적합합니다. 넓은 공간에서도 판서 가독성과 전달력을 안정적으로 확보할 수 있습니다.",
        image: "/images/product/hw/spaces/space-classroom-real.png",
    },
    {
        model: "S86", size: '86"', badge: "BEST",
        tag: "일반 교실 · 회의실",
        story: "가장 많은 교실에서 안정적으로 쓰이는 표준 모델입니다. 일반 수업, 담임반 운영, 라이브 수업까지 균형 있게 대응합니다.",
        image: "/images/product/hw/spaces/space-classroom.jpg",
    },
    {
        model: "S75", size: '75"', badge: "",
        tag: "세미나 · 중형 회의실",
        story: "세미나실과 중형 교실에서 공간 대비 몰입감을 확보하기 좋은 사이즈입니다. 수업, 회의, 교사 연수까지 폭넓게 활용할 수 있습니다.",
        image: "/images/product/hw/spaces/space-classroom.jpg",
    },
    {
        model: "S65", size: '65"', badge: "",
        tag: "스터디룸 · 소규모",
        story: "소수 정예 수업과 스터디룸처럼 가까운 상호작용이 중요한 공간에 적합합니다. 학생 참여가 많은 수업에 특히 잘 맞습니다.",
        image: "/images/product/hw/spaces/space-classroom.jpg",
    },
]

function SpaceScenarioSection() {
    const [active, setActive] = useState(0)
    const scenario = spaceScenarios[active]

    return (
        <section className="py-24 md:py-32 bg-[#FDFCF8]">
            <div className="container mx-auto px-4 lg:px-8">
                <motion.div className="text-center mb-12" {...fadeUp}>
                    <p className="text-sm font-semibold text-[#22A366] tracking-wider uppercase mb-3">LINEUP × SPACE</p>
                    <h2 className="text-3xl md:text-4xl lg:text-5xl text-[#1a1a19] leading-tight">
                        공간에 맞는 선택이,
                        <br />
                        <span className="text-[#22A366]">운영을 더 안정적으로 만듭니다</span>
                    </h2>
                    <p className="text-lg text-slate-500 mt-4 max-w-xl mx-auto">
                        교실 규모와 수업 방식에 맞는 모델을 선택할 수 있도록 표준 구성을 정리했습니다.
                    </p>
                </motion.div>

                <div className="flex flex-wrap justify-center gap-3 mb-12">
                    {spaceScenarios.map((s, i) => (
                        <button
                            key={i}
                            onClick={() => setActive(i)}
                            className={`px-6 py-2.5 rounded-full text-sm font-bold transition-all ${active === i
                                ? "bg-[#22A366] text-white shadow-md"
                                : "bg-white border border-slate-200 text-slate-600 hover:border-slate-300"
                                }`}
                        >
                            {s.model}
                            <span className={`ml-1.5 font-normal text-xs ${active === i ? "text-white/70" : "text-slate-400"}`}>{s.size}</span>
                        </button>
                    ))}
                </div>

                <motion.div
                    key={active}
                    initial={{ opacity: 0, y: 14 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.3 }}
                    className="max-w-5xl mx-auto grid lg:grid-cols-2 gap-10 items-center"
                >
                    <div className="rounded-3xl overflow-hidden shadow-2xl aspect-[4/3] relative">
                        <Image
                            src={scenario.image}
                            alt={scenario.tag}
                            fill
                            className="object-cover"
                            sizes="(max-width: 768px) 100vw, 50vw"
                        />
                        <div className="absolute inset-0 bg-gradient-to-t from-black/65 via-black/10 to-transparent" />
                        {scenario.badge && (
                            <div className="absolute top-4 left-4 text-[10px] font-bold tracking-wider bg-[#22A366] text-white px-3 py-1 rounded-full">
                                {scenario.badge}
                            </div>
                        )}
                        <div className="absolute bottom-5 left-5 text-white">
                            <div className="text-4xl font-sans font-bold tabular-nums tracking-tight">{scenario.model}</div>
                            <div className="text-sm opacity-60 mt-0.5">{scenario.size}</div>
                        </div>
                    </div>

                    <div>
                        <div className="inline-flex items-center px-3 py-1 rounded-full bg-slate-100 text-slate-500 text-xs font-semibold mb-6">
                            {scenario.tag}
                        </div>
                        <h3 className="text-2xl md:text-3xl text-[#1a1a19] mb-5 leading-snug">
                            {scenario.model} <span className="text-slate-400 font-normal">{scenario.size}</span>
                            <br />어떤 공간에 가장 잘 맞을까요?
                        </h3>
                        <p className="text-slate-600 leading-relaxed mb-8">{scenario.story}</p>
                        <Button asChild className="bg-[#22A366] hover:bg-[#1B8A55] text-white rounded-full px-8 h-12 text-sm font-bold shadow-md hover:shadow-lg transition-all group">
                            <Link href="/contact#contact-form">
                                이 모델 상담받기
                                <ArrowRight className="w-4 h-4 ml-2 group-hover:translate-x-1 transition-transform" />
                            </Link>
                        </Button>
                    </div>
                </motion.div>
            </div>
        </section>
    )
}

/* ── Section: Onboarding Process ─────────────────────────────────── */
const processSteps = [
    { num: "01", title: "문의 · 상담", desc: "공간 규모와 운영 방식에 맞춰 추천 모델과 구성을 안내합니다" },
    { num: "02", title: "현장 실측 · 견적", desc: "설치 환경을 확인하고 공간에 맞는 견적을 제안합니다" },
    { num: "03", title: "설치 (1일 완료)", desc: "수업 공백을 최소화하면서 하루 안에 설치를 마칩니다" },
    { num: "04", title: "교사 교육 (2시간)", desc: "첫 수업부터 바로 활용할 수 있도록 현장 교육으로 안내합니다" },
    { num: "05", title: "전담 지원 · A/S", desc: "도입 후에도 운영 지원과 유지보수를 이어갑니다" },
]

function OnboardingProcessSection() {
    return (
        <section className="py-24 md:py-32 bg-[#FDFCF8]">
            <div className="container mx-auto px-4 lg:px-8">
                <motion.div className="text-center mb-16" {...fadeUp}>
                    <p className="text-sm font-semibold text-[#22A366] tracking-wider uppercase mb-3">HOW TO START</p>
                    <h2 className="text-3xl md:text-4xl lg:text-5xl text-[#1a1a19] leading-tight">
                        도입은
                        <br />
                        <span className="text-[#22A366]">간결할수록 좋습니다</span>
                    </h2>
                    <p className="text-lg text-slate-500 mt-4 max-w-xl mx-auto">
                        상담부터 첫 수업까지, 필요한 단계만 정돈해 안내합니다.
                    </p>
                </motion.div>

                <div className="max-w-5xl mx-auto relative">
                    <div className="absolute top-7 left-[12%] right-[12%] h-px bg-gradient-to-r from-transparent via-[#22A366]/25 to-transparent hidden lg:block" />
                    <div className="grid sm:grid-cols-3 lg:grid-cols-5 gap-8">
                        {processSteps.map((step, i) => (
                            <motion.div key={i} {...stagger(i)} className="flex flex-col items-center text-center">
                                <div className="w-14 h-14 rounded-full bg-[#22A366]/10 border border-[#22A366]/20 flex items-center justify-center mb-5 relative z-10 shrink-0">
                                    <span className="text-sm font-bold tabular-nums text-[#22A366]">{step.num}</span>
                                </div>
                                <h3 className="font-bold text-slate-900 text-sm mb-2 leading-snug">{step.title}</h3>
                                <p className="text-xs text-slate-400 leading-relaxed">{step.desc}</p>
                            </motion.div>
                        ))}
                    </div>
                </div>
            </div>
        </section>
    )
}

/* ── Main Page Component ─────────────────────────────────────────── */
export default function ProductHWPage() {
    return (
        <div className="bg-[#FDFCF8] min-h-screen text-slate-900 font-sans selection:bg-emerald-200 pt-20">

            {/* ================================================================
                ACT 1 — HERO: 익숙함을 넘어서
            ================================================================ */}
            <section className="relative overflow-hidden">
                {/* Subtle background gradient */}
                <div className="absolute inset-0 bg-gradient-to-b from-[#FDFCF8] via-[#F0FFF7] to-[#FDFCF8] pointer-events-none" />

                <div className="container mx-auto px-4 lg:px-8 pt-12 md:pt-24 pb-20 md:pb-32 relative">
                    <div className="max-w-6xl mx-auto text-center">
                        <motion.div
                            initial={{ opacity: 0, y: 30 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.7 }}
                        >
                            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-[#22A366]/5 text-[#22A366] text-sm font-semibold mb-8 border border-[#22A366]/10">
                                <Layers className="w-3.5 h-3.5" />
                                ClassIn Board S Series
                            </div>

                            <h1
                                className="text-[2.25rem] sm:text-5xl md:text-6xl lg:text-[4.25rem] xl:text-[5rem] font-bold leading-[1.05] mb-10 text-[#1a1a19]"
                                style={{ letterSpacing: "-0.045em" }}
                            >
                                수업은 더 잘 남고,{" "}
                                <span className="text-[#084734] whitespace-nowrap">운영은 더 단순해집니다.</span>
                            </h1>

                            <p className="text-lg md:text-xl lg:text-2xl text-[#615D59] leading-relaxed font-medium max-w-3xl mx-auto mb-12">
                                판서, 촬영, 저장, 공유가 한 흐름으로 이어지면 수업의 완성도는 높아지고 운영의 번거로움은 줄어듭니다.
                                ClassIn Board는 그 흐름을 한 대에 담은 교육 전용 보드입니다.
                            </p>
                        </motion.div>

                        {/* Hero key metrics */}
                        <motion.div
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.6, delay: 0.3 }}
                            className="flex flex-wrap justify-center gap-8 md:gap-14 mt-4"
                        >
                            {[
                                { value: "자동 기록", label: "수업이 끝나면 바로 남는 영상" },
                                { value: "50페이지", label: "지우지 않고 이어 쓰는 판서" },
                                { value: "AI 추적", label: "교사의 움직임을 따라가는 카메라" },
                                { value: "실시간 동기화", label: "판서가 학생 기기에 함께 반영" },
                            ].map((m, i) => (
                                <div key={i} className="text-center">
                                    <div className="text-2xl md:text-3xl font-sans font-bold tabular-nums tracking-tight text-[#22A366]">{m.value}</div>
                                    <div className="text-xs md:text-sm text-slate-400 mt-1 font-medium">{m.label}</div>
                                </div>
                            ))}
                        </motion.div>

                        {/* Hero board image */}
                        <motion.div
                            initial={{ opacity: 0, y: 40 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.8, delay: 0.5 }}
                            className="mt-16 rounded-3xl overflow-hidden shadow-2xl"
                        >
                            <Image
                                src="/images/product/hw/hero/hero-board-front-stand.png"
                                alt="ClassIn Board S Series — 전자칠판 정면"
                                width={1200}
                                height={800}
                                sizes="(max-width: 768px) 100vw, (max-width: 1200px) 80vw, 1200px"
                                priority
                                className="w-full h-auto"
                            />
                        </motion.div>
                    </div>
                </div>
            </section>

            {/* ================================================================
                NEW INTRO ARC — 도입부 2배 확장 (스토리텔링 + 제품 직설)
            ================================================================ */}

            {/* OPENING STATEMENT — 텍스트 임팩트 */}
            <OpeningStatement />

            {/* 🆕 CLASSROOM STUDIO — 보드+카메라+SW 시너지 3요소 */}
            <ClassroomStudioSection />

            {/* PAIN POINTS V2 — 5가지 고민 → 5가지 부품 매칭 */}
            <PainPointsV2 />

            {/* ALL-IN-ONE STATEMENT — OPS 내장 강조 + 분해도 */}
            <AllInOneStatement />

            {/* AI CAMERA — 트래킹 카메라 (상위 이동: 카메라 비중 UP) */}
            <AICameraSection />

            {/* BIG BACKDROP — 베젤 클로즈업 풀블리드 */}
            <BigBackdropImage />

            {/* IMPACT NUMBERS — 숫자로 보는 ClassIn Board */}
            <ImpactNumbersSection />

            {/* DESIGN DETAILS — 반사·지문·몰입 3카드 */}
            <DesignDetails />

            {/* LATENCY PROOF — 0.03s 시연 */}
            <LatencyProof />

            {/* SIZE CHOOSER — 75"/86" 비교 */}
            <SizeChooser />

            {/* VALUE ANCHOR — 한 대에 포함된 모든 것 */}
            <ValueAnchor />

            {/* ================================================================
                ACT 1 — COMPARISON: 왜 ClassIn Board인가
            ================================================================ */}
            <ComparisonSection />

            {/* ================================================================
                FULL-WIDTH POINT — 교사의 하루를 다시 설계합니다
            ================================================================ */}
            <FullWidthPointSection
                eyebrow="ClassIn Board의 약속"
                statement={<>좋은 수업이,<br />더 오래 남습니다</>}
                sub="판서, 기록, 공유가 같은 흐름으로 이어지면 수업 직후의 공백이 줄어듭니다."
                dark
            />

            {/* ================================================================
                FEATURE TABS — 5가지 핵심 기능 인터랙티브 개요
            ================================================================ */}
            <FeatureTabSection />

            {/* ================================================================
                LESSON TIMELINE — 수업 하루 타임라인
            ================================================================ */}
            <LessonTimelineSection />

            {/* ================================================================
                PRODUCT ANATOMY — 실물 HW 디자인 & 물리 스펙
            ================================================================ */}
            <ProductAnatomySection />

            {/* ================================================================
                ACT 2 — 필기: 디지털인데, 아날로그 같은
            ================================================================ */}
            <div className="bg-white">
                <FeatureSection
                    tag="WRITING EXPERIENCE"
                    title={<>쓰는 순간,<br />흐름이 바로 <span className="text-[#22A366]">이어집니다</span></>}
                    desc="마찰감 있는 표면과 낮은 지연이 만나, 디지털 장비를 의식하지 않고 설명을 이어갈 수 있습니다."
                    features={[
                        {
                            icon: <Zap className="w-7 h-7" />,
                            label: "0.03초 초저지연",
                            detail: "손동작과 화면 반응 사이의 끊김을 최소화합니다.",
                        },
                        {
                            icon: <Hand className="w-7 h-7" />,
                            label: "50포인트 멀티터치",
                            detail: "교사와 학생이 함께 쓰는 참여형 수업을 바로 만들 수 있습니다.",
                        },
                        {
                            icon: <Maximize className="w-7 h-7" />,
                            label: "무한 캔버스",
                            detail: "지우지 않고 흐름을 이어가며 최대 50페이지까지 한 번에 저장합니다.",
                        },
                    ]}
                >
                    {/* Writing visual — teacher writing on board */}
                    <motion.div {...fadeUp} className="relative">
                        <div className="rounded-3xl overflow-hidden shadow-2xl">
                            <Image
                                src="/images/product/hw/writing/writing-teacher.jpg"
                                alt="교사가 ClassIn Board에 수학 문제를 판서하는 모습"
                                width={800}
                                height={600}
                                sizes="(max-width: 768px) 100vw, 500px"
                                className="w-full h-auto"
                            />
                        </div>
                        {/* Floating latency badge */}
                        <motion.div
                            initial={{ opacity: 0, scale: 0.8 }}
                            whileInView={{ opacity: 1, scale: 1 }}
                            viewport={{ once: true }}
                            transition={{ delay: 0.5 }}
                            className="absolute -top-3 -right-3 bg-white rounded-2xl shadow-lg border border-slate-100 px-4 py-2.5"
                        >
                            <div className="text-xs text-slate-400 mb-0.5">지연 시간</div>
                            <div className="text-lg font-bold text-[#22A366] font-mono">0.03s</div>
                        </motion.div>
                    </motion.div>
                </FeatureSection>
            </div>

            {/* ================================================================
                ACT 2 — 선명함: 어디에 앉아도 같은 수업
            ================================================================ */}
            <FeatureSection
                tag="DISPLAY QUALITY"
                title={<>어디에 앉아도,<br /><span className="text-[#22A366]">같은 내용이</span> 선명합니다</>}
                desc="반사와 눈부심을 줄이고 시야각을 넓혀, 교실 어느 자리에서도 같은 가독성을 유지합니다."
                reverse
                features={[
                    {
                        icon: <Eye className="w-7 h-7" />,
                        label: "178° 광시야각",
                        detail: "교실 어디에 앉든 동일한 색감과 선명도. 사각지대가 사라집니다.",
                    },
                    {
                        icon: <Shield className="w-7 h-7" />,
                        label: "AG + AF 정밀 코팅",
                        detail: "조명 반사와 지문 얼룩을 줄여 화면을 선명하게 유지합니다.",
                    },
                    {
                        icon: <Eye className="w-7 h-7" />,
                        label: "블루라이트 차단",
                        detail: "오랜 수업에도 눈의 부담을 줄이도록 설계했습니다.",
                    },
                ]}
            >
                {/* Display visual — cinematic wall scene */}
                <motion.div {...fadeUp} className="relative">
                    <div className="rounded-3xl overflow-hidden shadow-2xl">
                        <Image
                            src="/images/product/hw/display/display-wall-cinematic.jpg"
                            alt="ClassIn Board에 우주 영상이 표시된 시네마틱 장면"
                            width={800}
                            height={600}
                            sizes="(max-width: 768px) 100vw, 500px"
                            className="w-full h-auto"
                        />
                    </div>
                    {/* Floating coating badge */}
                    <motion.div
                        initial={{ opacity: 0, scale: 0.8 }}
                        whileInView={{ opacity: 1, scale: 1 }}
                        viewport={{ once: true }}
                        transition={{ delay: 0.5 }}
                        className="absolute -bottom-3 -left-3 bg-white rounded-2xl shadow-lg border border-slate-100 px-4 py-2.5"
                    >
                        <div className="text-xs text-slate-400 mb-0.5">빛 투과율</div>
                        <div className="text-lg font-bold text-[#084734] font-mono">90%+</div>
                    </motion.div>
                </motion.div>
            </FeatureSection>

            {/* ================================================================
                ACT 3 — 판서 공유: 쓰는 즉시, 모든 학생에게
            ================================================================ */}
            <div className="bg-white">
                <FeatureSection
                    tag="INSTANT SHARING"
                    title={<>쓰는 순간,<br />학생 기기에 <span className="text-[#22A366]">함께 남습니다</span></>}
                    desc="교실 앞 보드와 학생 기기가 하나의 화면처럼 연결됩니다. 수업 중에는 즉시 반영되고, 끝나면 그대로 저장됩니다."
                    features={[
                        {
                            icon: <Share2 className="w-7 h-7" />,
                            label: "실시간 판서 동기화",
                            detail: "칠판에 쓰는 순간, 학생 태블릿과 노트북에 즉시 반영됩니다.",
                        },
                        {
                            icon: <Layers className="w-7 h-7" />,
                            label: "원클릭 저장 · 공유",
                            detail: "수업 종료 후 판서 내용이 PDF로 자동 저장되어 바로 공유할 수 있습니다.",
                        },
                        {
                            icon: <Users className="w-7 h-7" />,
                            label: "결석해도 복습 가능",
                            detail: "수업에 참여하지 못한 학생도 같은 자료로 수업 흐름을 다시 따라갈 수 있습니다.",
                        },
                    ]}
                >
                    {/* Sharing visual — board to devices flow */}
                    <motion.div {...fadeUp} className="relative">
                        <div className="aspect-[4/3] rounded-3xl bg-gradient-to-br from-emerald-50 to-green-50 border border-emerald-100/60 shadow-xl overflow-hidden p-8 flex flex-col justify-center items-center gap-6">
                            {/* Board icon */}
                            <div className="w-16 h-12 rounded-xl bg-slate-800 flex items-center justify-center shadow-md">
                                <PenTool className="w-6 h-6 text-white/70" />
                            </div>
                            {/* Arrow flow */}
                            <div className="flex flex-col items-center gap-1">
                                <motion.div
                                    animate={{ y: [0, 4, 0] }}
                                    transition={{ duration: 1.5, repeat: Infinity, ease: "easeInOut" }}
                                    className="text-[#22A366]/40"
                                >
                                    <ChevronRight className="w-5 h-5 rotate-90" />
                                </motion.div>
                                <motion.div
                                    animate={{ y: [0, 4, 0] }}
                                    transition={{ duration: 1.5, repeat: Infinity, ease: "easeInOut", delay: 0.2 }}
                                    className="text-[#22A366]/30"
                                >
                                    <ChevronRight className="w-5 h-5 rotate-90" />
                                </motion.div>
                            </div>
                            {/* Device icons */}
                            <div className="flex gap-4">
                                {["태블릿", "노트북", "스마트폰"].map((d, i) => (
                                    <motion.div
                                        key={d}
                                        initial={{ opacity: 0, y: 10 }}
                                        whileInView={{ opacity: 1, y: 0 }}
                                        viewport={{ once: true }}
                                        transition={{ delay: 0.6 + i * 0.15 }}
                                        className="bg-white rounded-xl shadow-md border border-emerald-100 px-4 py-3 text-center"
                                    >
                                        <Monitor className="w-5 h-5 text-[#22A366]/60 mx-auto mb-1" />
                                        <div className="text-[10px] text-slate-400 font-medium">{d}</div>
                                    </motion.div>
                                ))}
                            </div>
                        </div>
                    </motion.div>
                </FeatureSection>
            </div>

            {/* ================================================================
                AFTER CLASS — 학생·학부모·교사 3관점 수업 이후 경험
            ================================================================ */}
            <AfterClassSection />

            {/* ================================================================
                FULL-WIDTH POINT — 여기서도, 저기서도 같은 수업
            ================================================================ */}
            <FullWidthPointSection
                eyebrow="교실의 경계를 넘어서"
                statement={<>거리가 달라도,<br />수업의 밀도는 같습니다</>}
                sub="AI 카메라와 실시간 판서 동기화가 교실과 원격을 하나의 수업 흐름으로 이어줍니다."
                image="/images/product/hw/spaces/space-classroom-real.png"
                dark
            />

            {/* ================================================================
                ACT 3 — 시공간을 넘어서: 교실이 있는 곳이 학교
            ================================================================ */}
            <FeatureSection
                tag="BEYOND CLASSROOM"
                title={<>같은 공간에 없어도,<br /><span className="text-[#22A366]">같은 흐름</span>으로 이어집니다</>}
                desc="교실과 원격을 따로 운영하는 것이 아니라 하나의 수업으로 이어줍니다. 같은 판서와 같은 설명을 동시에 따라올 수 있습니다."
                reverse
                accent="#22A366"
                features={[
                    {
                        icon: <Camera className="w-7 h-7" />,
                        label: "4K AI 카메라",
                        detail: "교사를 자동으로 따라가 수업 진행에 맞는 화면을 안정적으로 잡아줍니다.",
                    },
                    {
                        icon: <Mic className="w-7 h-7" />,
                        label: "8배열 마이크 + 노이즈캔슬링",
                        detail: "교실 소음 속에서도 교사 음성을 또렷하게 전달해 원격 학생의 몰입을 높입니다.",
                    },
                    {
                        icon: <Wifi className="w-7 h-7" />,
                        label: "하이브리드 수업",
                        detail: "교실 학생과 원격 학생이 같은 캔버스에서 함께 참여하는 수업을 만듭니다.",
                    },
                ]}
            >
                {/* Hybrid classroom visual — real photo */}
                <motion.div {...fadeUp} className="relative">
                    <div className="rounded-3xl overflow-hidden shadow-2xl">
                        <Image
                            src="/images/product/hw/camera/camera-ai-unit-angle.png"
                            alt="하이브리드 교실 — 교실 학생과 원격 학생이 함께 수업하는 모습"
                            width={800}
                            height={600}
                            sizes="(max-width: 768px) 100vw, 500px"
                            className="w-full h-auto"
                        />
                    </div>
                </motion.div>
            </FeatureSection>

            {/* ================================================================
                ACT 4 — SW 완전 통합: 교육 생태계
            ================================================================ */}
            <section className="py-24 md:py-32 bg-slate-900 text-white relative overflow-hidden">
                {/* Background glow */}
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-[#22A366]/5 rounded-full blur-[120px] pointer-events-none" />

                <div className="container mx-auto px-4 lg:px-8 relative">
                    <motion.div className="text-center mb-16" {...fadeUp}>
                        <p className="text-sm font-semibold text-[#22A366] tracking-wider uppercase mb-3">COMPLETE ECOSYSTEM</p>
                        <h2 className="text-3xl md:text-4xl lg:text-5xl leading-tight">
                            보드에서 시작해,
                            <br />
                            <span className="text-[#22A366]">운영까지 이어집니다</span>
                        </h2>
                        <p className="text-lg text-slate-400 mt-6 max-w-2xl mx-auto leading-relaxed">
                            ClassIn 소프트웨어가 보드에 바로 이어져 출결, 판서, 과제, 성적, 알림이 같은 흐름으로 이어집니다.
                        </p>
                    </motion.div>

                    {/* Board bezel detail hero image */}
                    <motion.div {...fadeUp} className="max-w-3xl mx-auto mb-14 rounded-3xl overflow-hidden shadow-2xl">
                        <Image
                            src="/images/product/hw/board/board-bezel-detail.png"
                            alt="ClassIn Board 프리미엄 브러시드 메탈 베젤 디테일"
                            width={900}
                            height={500}
                            sizes="(max-width: 768px) 100vw, 900px"
                            className="w-full h-auto"
                        />
                    </motion.div>

                    <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5 max-w-5xl mx-auto">
                        {[
                            {
                                icon: <Fingerprint className="w-8 h-8" />,
                                title: "NFC 원터치 로그인",
                                desc: "카드 한 번으로 내 수업 환경이 바로 열립니다",
                            },
                            {
                                icon: <Layers className="w-8 h-8" />,
                                title: "20+ 강의 도구",
                                desc: "타이머, 투표, 퀴즈, 그룹 활동을 보드 위에서 바로 실행합니다",
                            },
                            {
                                icon: <GraduationCap className="w-8 h-8" />,
                                title: "LMS 완전 통합",
                                desc: "출결부터 과제, 성적, 알림까지 수업 흐름이 끊기지 않습니다",
                            },
                            {
                                icon: <Monitor className="w-8 h-8" />,
                                title: "무선 미러링",
                                desc: "노트북, 태블릿, 휴대폰 화면을 간단하게 공유합니다",
                            },
                        ].map((item, i) => (
                            <motion.div
                                key={i}
                                {...stagger(i)}
                                className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-2xl p-6 hover:bg-white/10 transition-colors"
                            >
                                <div className="text-[#22A366] mb-4">
                                    {item.icon}
                                </div>
                                <h3 className="font-bold text-white mb-2">{item.title}</h3>
                                <p className="text-sm text-slate-400 leading-relaxed">{item.desc}</p>
                            </motion.div>
                        ))}
                    </div>
                </div>
            </section>

            {/* ================================================================
                TESTIMONIALS — 도입 현장 후기
            ================================================================ */}
            <TestimonialSection />

            {/* ================================================================
                SPACE SCENARIOS — 공간별 모델 시나리오
            ================================================================ */}
            <SpaceScenarioSection />

            {/* ================================================================
                ACT 5 — 라인업: 스펙 비교표
            ================================================================ */}
            <section className="py-24 md:py-32">
                <div className="container mx-auto px-4 lg:px-8">
                    <motion.div className="text-center mb-16" {...fadeUp}>
                        <p className="text-sm font-semibold text-[#22A366] tracking-wider uppercase mb-3">LINEUP</p>
                        <h2 className="text-3xl md:text-4xl lg:text-5xl text-[#1a1a19] leading-tight">
                            모든 교실에 맞는 <span className="text-[#22A366]">ClassIn Board 라인업</span>
                        </h2>
                        <p className="text-lg text-slate-500 mt-4 max-w-xl mx-auto">
                            소규모 스터디룸부터 대형 강당까지, 공간과 운영 방식에 맞는 모델을 선택하세요.
                        </p>
                    </motion.div>

                    {/* Lineup cards */}
                    <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5 max-w-5xl mx-auto mb-20">
                        {lineupCards.map((card, i) => (
                            <motion.div
                                key={card.model}
                                {...stagger(i)}
                                className={`relative rounded-2xl bg-gradient-to-br ${card.color} p-6 ${card.textColor} overflow-hidden group hover:scale-[1.02] transition-transform`}
                                style={{ boxShadow: card.badge ? "0 8px 30px rgba(0,0,0,0.15)" : "0 4px 20px rgba(0,0,0,0.06)" }}
                            >
                                {card.badge && (
                                    <div className="absolute top-3 right-3 text-[10px] font-bold tracking-wider bg-white/20 px-2 py-0.5 rounded-full">
                                        {card.badge}
                                    </div>
                                )}
                                <div className="text-5xl font-sans font-bold tabular-nums tracking-tight mb-1">{card.model}</div>
                                <div className="text-2xl font-sans font-bold tabular-nums mb-4 opacity-70">{card.size}</div>
                                <p className={`text-sm ${card.textColor === "text-white" ? "text-white/70" : "text-slate-500"}`}>
                                    {card.rec}
                                </p>
                            </motion.div>
                        ))}
                    </div>

                    {/* Spec table */}
                    <motion.div {...fadeUp} className="max-w-5xl mx-auto">
                        <div className="bg-white rounded-2xl border border-slate-200/60 shadow-lg overflow-hidden">
                            <div className="overflow-x-auto">
                                <table className="w-full text-sm">
                                    <thead>
                                        <tr className="bg-slate-50 border-b border-slate-100">
                                            <th className="text-left py-4 px-6 font-semibold text-slate-500 w-40">사양</th>
                                            <th className="text-center py-4 px-4 font-bold text-slate-900">S110</th>
                                            <th className="text-center py-4 px-4 font-bold text-[#22A366]">S86</th>
                                            <th className="text-center py-4 px-4 font-bold text-slate-900">S75</th>
                                            <th className="text-center py-4 px-4 font-bold text-slate-900">S65</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {specRows.map((row, i) => (
                                            <tr key={i} className={`border-b border-slate-50 ${i % 2 === 0 ? "bg-white" : "bg-slate-50/50"}`}>
                                                <td className="py-3.5 px-6 font-medium text-slate-600">{row.label}</td>
                                                <td className="py-3.5 px-4 text-center text-slate-700">{row.s110}</td>
                                                <td className="py-3.5 px-4 text-center text-slate-700 font-medium">{row.s86}</td>
                                                <td className="py-3.5 px-4 text-center text-slate-700">{row.s75}</td>
                                                <td className="py-3.5 px-4 text-center text-slate-700">{row.s65}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </motion.div>
                </div>
            </section>

            {/* ================================================================
                ONBOARDING PROCESS — 도입 절차
            ================================================================ */}
            <OnboardingProcessSection />

            {/* ================================================================
                ACT 5 — CTA: 직접 체험해보세요
            ================================================================ */}
            <section className="py-24 md:py-32 bg-gradient-to-b from-white to-[#FDFCF8] border-t border-slate-100">
                <div className="container mx-auto px-4 text-center">
                    <motion.div {...fadeUp}>
                        <p className="text-sm font-semibold text-[#22A366] tracking-wider uppercase mb-3">EXPERIENCE</p>
                        <h2 className="text-3xl md:text-4xl lg:text-5xl text-[#1a1a19] mb-4 leading-tight">
                            카피로는 다 설명되지 않는 건,
                            <br />
                            <span className="text-[#22A366]">직접 써보면 바로 느껴집니다</span>
                        </h2>
                        <p className="text-lg text-slate-500 mb-10 max-w-xl mx-auto leading-relaxed">
                            교실 규모와 운영 방식에 맞는 모델을 함께 제안해드립니다.
                            <br />
                            데모부터 설치 계획까지 한 번에 상담받을 수 있습니다.
                        </p>

                        <div className="flex flex-col sm:flex-row gap-4 justify-center">
                            <Button asChild className="bg-[#22A366] hover:bg-[#1B8A55] text-white rounded-full px-10 h-14 text-base font-bold shadow-[0_8px_20px_rgba(34,163,102,0.3)] hover:shadow-[0_12px_25px_rgba(34,163,102,0.4)] transition-all hover:scale-105 group">
                                <Link href="/contact#contact-form">
                                    도입 상담받기
                                    <ArrowRight className="w-4 h-4 ml-2 group-hover:translate-x-1 transition-transform" />
                                </Link>
                            </Button>
                            <Button asChild variant="outline" className="rounded-full px-10 h-14 text-base font-bold border-slate-300 hover:border-slate-400 text-slate-700 hover:bg-slate-50 transition-all">
                                <a href={BROCHURE_URL} target="_blank" rel="noopener noreferrer">
                                    소개서 먼저 보기
                                </a>
                            </Button>
                        </div>
                    </motion.div>
                </div>
            </section>
        </div>
    )
}
