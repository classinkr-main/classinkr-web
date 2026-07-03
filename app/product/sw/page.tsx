import {
    ArrowRight, Monitor, Layers, MousePointerClick,
    Clock, Users, PenTool, Dice1, Layout, Video,
    Globe, Wifi, BookOpen, Timer,
    MessageSquare, GraduationCap, CheckCircle2, Zap,
    Star, X, Camera, Trophy, Shuffle, FlaskConical, Atom, Ruler, Laptop
} from "lucide-react"
import Link from "next/link"
import Image from "next/image"

import { HeroVideoBackdrop } from "@/components/media/HeroVideoBackdrop"
import { Reveal } from "@/components/motion/Reveal"
import { fadeUp, stagger } from "@/components/motion/presets"
import { EyebrowTag, VIDEO_BACKDROP_MEDIA_QUERY, WaveDivider } from "@/components/product/sw/sw-shared"
import SwHeroSection from "@/components/product/sw/SwHeroSection"
import { KeyUseCases } from "@/components/sections/KeyUseCases"
import { TESTIMONIALS } from "@/lib/testimonials"

import {
    AIFeaturesSection,
    AnalyticsSection,
    FAQSection,
    FinalCTASection,
    FutureVision2Section,
    NetworkStatsSection,
    OnboardingRoadmap,
    PricingValueSection,
} from "@/components/product/sw/LazySwSections"

const BLACKBOARD_VIDEO_SRC = "/video/클립2.mp4"

const LESSON_TOOLS: {
    label: string
    icon: React.ComponentType<{ className?: string }>
    tone: string
    labelClass?: string
}[] = [
    { label: "타이머", icon: Timer, tone: "from-[#FFE7CB] to-[#F1C18C] text-[#9F5B23]" },
    { label: "주사위", icon: Dice1, tone: "from-[#F3F4FF] to-[#DEE1FF] text-[#5157A6]" },
    { label: "스톱워치", icon: Clock, tone: "from-[#EEF7FF] to-[#D8E9FF] text-[#426D9C]" },
    { label: "보조 칠판", icon: Layout, tone: "from-[#FFF0E3] to-[#F5D0B4] text-[#8B5A2B]" },
    { label: "트로피 순위", icon: Trophy, tone: "from-[#FFF3D5] to-[#EAC57A] text-[#8A6A1F]" },
    { label: "레이저 포인터 움직이기", icon: MousePointerClick, tone: "from-[#FFE1E5] to-[#FF9CAA] text-[#B6324B]", labelClass: "text-[13px]" },
    { label: "보조 카메라", icon: Camera, tone: "from-[#EEF2FF] to-[#D8DEFF] text-[#485AA7]" },
    { label: "브라우저", icon: Globe, tone: "from-[#E4F5FF] to-[#BEE8FF] text-[#1D6C8C]" },
    { label: "비디오 갤러리", icon: Video, tone: "from-[#EEF2F7] to-[#CFD7E3] text-[#536273]" },
    { label: "미러링", icon: Wifi, tone: "from-[#EBF7FF] to-[#C6E9FF] text-[#247099]" },
    { label: "화면 공유", icon: Monitor, tone: "from-[#F2F4F8] to-[#D8DEE8] text-[#5C6678]" },
    { label: "VNC", icon: Laptop, tone: "from-[#EEF2FF] to-[#D7DFFE] text-[#4D5AA4]" },
    { label: "랜덤 선택", icon: Shuffle, tone: "from-[#F3F4F6] to-[#DEE2E8] text-[#667085]" },
    { label: "개인 칠판", icon: PenTool, tone: "from-[#FFF1E4] to-[#F3D7BD] text-[#855B31]" },
    { label: "객관식 퀴즈", icon: CheckCircle2, tone: "from-[#F5F5F7] to-[#E1E3E8] text-[#667085]" },
    { label: "선착순 퀴즈", icon: Zap, tone: "from-[#FFE2E2] to-[#FFB4B4] text-[#A53636]" },
    { label: "그룹 토론", icon: MessageSquare, tone: "from-[#F4F7FB] to-[#DDE5F0] text-[#61758E]" },
    { label: "다방향 브라우저", icon: ArrowRight, tone: "from-[#E5F1FF] to-[#C8DEFF] text-[#3D6FA1]", labelClass: "text-[13px]" },
    { label: "수업 자료 라이브러리", icon: BookOpen, tone: "from-[#FFF0E7] to-[#F7D2BE] text-[#965A35]", labelClass: "text-[13px]" },
    { label: "화학 실험", icon: FlaskConical, tone: "from-[#FDF0F6] to-[#F7CADF] text-[#A34B75]" },
    { label: "물리 실험", icon: Atom, tone: "from-[#EEF8D9] to-[#D3EEAA] text-[#547A2B]" },
    { label: "기하도형", icon: Layers, tone: "from-[#DDF1FF] to-[#B8E0FF] text-[#186B95]" },
    { label: "측정 도구", icon: Ruler, tone: "from-[#F0F4FF] to-[#D9E3FF] text-[#5064A8]" },
    { label: "바둑 칠판", icon: Layout, tone: "from-[#F1F2F4] to-[#D7DAE0] text-[#6A7280]" },
    { label: "실시간 채팅", icon: MessageSquare, tone: "from-[#ECF7E9] to-[#CFEAC5] text-[#4E7B3A]" },
    { label: "공동 작업", icon: Users, tone: "from-[#F4F4FF] to-[#E0E3FF] text-[#5962AE]" },
]

const LESSON_ACTIVITIES: {
    label: string
    desc?: string
    featured?: boolean
    cardClass: string
    iconSizeClass: string
    iconSrc: string
    iconAlt: string
}[] = [
    {
        label: "수업",
        desc: "다양한 실시간 상호작용과 수업 후 AI 분석 및 요약 지원",
        featured: true,
        cardClass: "col-span-2 md:col-span-2 xl:col-span-6",
        iconSrc: "/images/product/sw/activity-icons/class.png",
        iconAlt: "수업 아이콘",
        iconSizeClass: "h-12 w-12 md:h-14 md:w-14",
    },
    {
        label: "숙제",
        desc: "유연한 과제 형식 호환 및 AI 자동 채점 지원",
        featured: true,
        cardClass: "col-span-2 md:col-span-2 xl:col-span-6",
        iconSrc: "/images/product/sw/activity-icons/homework.png",
        iconAlt: "숙제 아이콘",
        iconSizeClass: "h-12 w-12 md:h-14 md:w-14",
    },
    {
        label: "시험",
        cardClass: "col-span-1 xl:col-span-3",
        iconSrc: "/images/product/sw/activity-icons/quiz-mono.png",
        iconAlt: "시험 흑백 아이콘",
        iconSizeClass: "h-10 w-10",
    },
    {
        label: "녹화+수업",
        cardClass: "col-span-1 xl:col-span-3",
        iconSrc: "/images/product/sw/activity-icons/recorded-class-mono.png",
        iconAlt: "녹화 수업 흑백 아이콘",
        iconSizeClass: "h-10 w-10",
    },
    {
        label: "학습 자료",
        cardClass: "col-span-1 xl:col-span-3",
        iconSrc: "/images/product/sw/activity-icons/learning-materials-mono.png",
        iconAlt: "학습 자료 흑백 아이콘",
        iconSizeClass: "h-10 w-10",
    },
    {
        label: "일일 과제",
        cardClass: "col-span-1 xl:col-span-3",
        iconSrc: "/images/product/sw/activity-icons/daily-task-mono.png",
        iconAlt: "일일 과제 흑백 아이콘",
        iconSizeClass: "h-10 w-10",
    },
    {
        label: "토론",
        cardClass: "col-span-1 xl:col-span-3",
        iconSrc: "/images/product/sw/activity-icons/discussion-mono.png",
        iconAlt: "토론 흑백 아이콘",
        iconSizeClass: "h-10 w-10",
    },
    {
        label: "OMR 카드",
        cardClass: "col-span-1 xl:col-span-3",
        iconSrc: "/images/product/sw/activity-icons/omr-card-mono.png",
        iconAlt: "OMR 카드 흑백 아이콘",
        iconSizeClass: "h-10 w-10",
    },
    {
        label: "SCORM",
        cardClass: "col-span-1 xl:col-span-3",
        iconSrc: "/images/product/sw/activity-icons/scorm-mono.png",
        iconAlt: "SCORM 흑백 아이콘",
        iconSizeClass: "h-10 w-10",
    },
    {
        label: "따라읽기",
        cardClass: "col-span-1 xl:col-span-3",
        iconSrc: "/images/product/sw/activity-icons/repeat-after-me-mono.png",
        iconAlt: "따라읽기 흑백 아이콘",
        iconSizeClass: "h-10 w-10",
    },
]

const ACTIVITY_ICON_VERSION = "20260429"

/* ── Avatar with initials ────────────────────────────────────────── */
function Avatar({ name, gradient }: { name: string; gradient: string }) {
    const initials = name.split(" ").map(n => n[0]).join("").slice(0, 2)
    return (
        <div className={`flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full bg-gradient-to-br text-sm font-bold text-white ${gradient}`}>
            {initials}
        </div>
    )
}

type SoftwareTestimonial = {
    name: string
    role: string
    quote: string
    rating: number
    gradient: string
    dark?: boolean
    delay?: number
    className?: string
}

// 콘텐츠(이름·인용·평점)는 lib/testimonials.ts 단일 소스에서 가져오고,
// 이 페이지는 표현(그래디언트·다크·그리드 배치·등장 딜레이)만 정의한다.
type TestimonialPresentation = {
    id: string
    gradient: string
    dark?: boolean
    delay?: number
    className?: string
}

const SOFTWARE_TESTIMONIAL_PRESENTATION: TestimonialPresentation[] = [
    { id: "olm-eng-director", gradient: "from-[#0FAE73] to-[#087A52]", dark: true, className: "lg:col-span-5" },
    { id: "imisook-korean-ceo", gradient: "from-[#B950D7] to-[#7C3AED]", className: "lg:col-span-4", delay: 0.08 },
    { id: "rhino-tutor", gradient: "from-[#5B7CFA] to-[#3B5BDB]", className: "lg:col-span-3", delay: 0.12 },
    { id: "yerim-edu", gradient: "from-[#4F5F73] to-[#283548]", className: "lg:col-span-4", delay: 0.16 },
    { id: "jans-english", gradient: "from-[#0FC5A4] to-[#07926F]", className: "lg:col-span-5", delay: 0.2 },
    { id: "barungeul-korean", gradient: "from-[#F95D91] to-[#D6336C]", className: "lg:col-span-3", delay: 0.24 },
]

const SOFTWARE_TESTIMONIALS: SoftwareTestimonial[] = SOFTWARE_TESTIMONIAL_PRESENTATION.flatMap((presentation) => {
    const source = TESTIMONIALS.find((item) => item.id === presentation.id)
    if (!source) return []
    return [{
        name: source.role,
        role: source.badge,
        quote: source.quote,
        rating: source.rating ?? 5,
        gradient: presentation.gradient,
        dark: presentation.dark,
        delay: presentation.delay,
        className: presentation.className,
    }]
})

/* ── Testimonial Card ────────────────────────────────────────────── */
function TestimonialCard({
    name,
    role,
    quote,
    rating,
    gradient,
    dark = false,
    delay = 0,
    className = "",
}: SoftwareTestimonial) {
    return (
        <Reveal
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-80px" }}
            transition={{ delay, duration: 0.5 }}
            className={`group relative flex min-h-[190px] flex-col rounded-lg border p-5 transition-all duration-300 after:absolute after:bottom-[-7px] after:h-3.5 after:w-3.5 after:rotate-45 after:rounded-[2px] ${
                dark
                    ? "border-[#0E3D30] bg-[#101311] text-white shadow-[0_18px_46px_rgba(16,19,17,0.16)] after:left-9 after:border-b after:border-r after:border-[#0E3D30] after:bg-[#101311]"
                    : "border-[#E8E6DC] bg-white text-[#172018] shadow-[0_12px_30px_rgba(20,24,21,0.04)] hover:-translate-y-0.5 hover:border-[#22A366]/25 hover:shadow-[0_18px_44px_rgba(8,71,52,0.07)] after:right-9 after:border-b after:border-r after:border-[#E8E6DC] after:bg-white"
            } ${className}`}
        >
            <div className="mb-4 flex items-start justify-between gap-4">
                <div className="flex items-center gap-3">
                    <Avatar name={name} gradient={gradient} />
                    <div>
                        <div className={`text-sm font-extrabold ${dark ? "text-white" : "text-slate-950"}`}>{name}</div>
                        <div className={`mt-0.5 text-xs font-medium ${dark ? "text-white/50" : "text-slate-500"}`}>{role}</div>
                    </div>
                </div>
                <MessageSquare className={`mt-1 h-4 w-4 shrink-0 ${dark ? "text-[#F8C35B]" : "text-[#22A366]/45"}`} />
            </div>

            <p className={`flex-1 text-[15px] font-semibold leading-7 break-keep ${dark ? "text-white/86" : "text-slate-700"}`}>
                &ldquo;{quote}&rdquo;
            </p>

            <div className={`mt-5 flex items-center border-t pt-3 ${dark ? "border-white/10" : "border-black/[0.06]"}`}>
                <div className="flex gap-0.5">
                    {[...Array(5)].map((_, i) => (
                        <Star
                            key={i}
                            className={`h-3.5 w-3.5 ${
                                i < rating
                                    ? dark
                                        ? "fill-[#F8C35B] text-[#F8C35B]"
                                        : "fill-[#FFB000] text-[#FFB000]"
                                    : "text-slate-200"
                            }`}
                        />
                    ))}
                </div>
            </div>
        </Reveal>
    )
}

/* ── 고객 사례 (시네마틱 스트립) ────────────────────────────── */
const CINEMATIC_CASES = [
    {
        index: "01",
        tag: "입시학원",
        name: "부천 정율사관학원",
        quote: "강사가 바뀌어도 수업 품질이 흔들리지 않게 됐습니다. 수업 콘티를 저장하고 공유하는 것만으로 노하우가 시스템이 됐어요.",
        person: "원장 김O준",
        before: { label: "도입 전", items: ["강사 의존도 높음", "타지역 학생 모집 불가", "신규 강사 적응 3주"] },
        after: { label: "도입 후", items: ["하이브리드로 전국 모집", "피어러닝으로 참여도 상승", "강사 온보딩 3일로 단축"] },
        accentBg: "bg-[#ECFDF5]",
        accentText: "text-[#084734]",
        accentBorder: "border-[#D1FAE5]",
        num: "50%",
        numLabel: "강사 온보딩 시간 단축",
    },
    {
        index: "02",
        tag: "글로벌 튜터링",
        name: "Acadsoc · 1:1 ESL 플랫폼",
        quote: "Classin 이전에도 여러 화상 툴을 써봤습니다. 하지만 영업 데모를 할 때 학생과 교사 모두 Classin에 가장 빠르게 반응했어요.",
        person: "Acadsoc 서비스 팀",
        before: { label: "도입 전", items: ["학생 이탈률 높음", "수업 집중도 측정 불가", "다른 플랫폼으로 전전"] },
        after: { label: "도입 후", items: ["누적 학습자 4,000만+", "영업 데모 1순위 채택", "Series A→C 투자 유치"] },
        accentBg: "bg-[#F6F5F4]",
        accentText: "text-[#31302E]",
        accentBorder: "border-[#e8e8e4]",
        num: "$63.6M",
        numLabel: "누적 투자 유치",
    },
    {
        index: "03",
        tag: "대형 교육기관",
        name: "북경대학교 글로벌 오픈 코스",
        quote: "하이브리드 접근 방식은 팬데믹 속 임시 해법이 아닙니다. 이것이 교육의 새로운 표준이 될 것입니다.",
        person: "왕보(王博) 부총장",
        before: { label: "도입 전", items: ["단일 캠퍼스 수업 한계", "해외 학생 접근 불가", "협업 대학 연결 어려움"] },
        after: { label: "도입 후", items: ["한 학기 287개 하이브리드 수업", "Cornell·ANU·와세다 연결", "글로벌 오픈 코스 프로그램"] },
        accentBg: "bg-[#ECFDF5]",
        accentText: "text-[#084734]",
        accentBorder: "border-[#D1FAE5]",
        num: "287",
        numLabel: "단 한 학기 하이브리드 수업 수",
    },
]

function CinematicCasesSection() {
    return (
        <section className="py-24 md:py-32 bg-[#1a1a19] overflow-hidden">
            <div className="container mx-auto px-4 lg:px-8 max-w-6xl">
                <Reveal className="mb-16" initial={{ opacity: 0, y: 30 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}>
                    <p className="text-sm font-semibold text-[#6EE7B7]/60 tracking-wider uppercase mb-3">Customer Stories</p>
                    <h2 className="text-3xl md:text-5xl font-sans text-white leading-tight">
                        그들은 이미<br /><span className="text-[#6EE7B7]">바꿨습니다</span>
                    </h2>
                </Reveal>

                <div className="space-y-6">
                    {CINEMATIC_CASES.map((c, i) => (
                        <Reveal
                            key={c.index}
                            initial={{ opacity: 0, y: 40 }}
                            whileInView={{ opacity: 1, y: 0 }}
                            viewport={{ once: true }}
                            transition={{ delay: i * 0.1, duration: 0.7 }}
                            className="grid lg:grid-cols-[1fr_1.6fr_1fr] gap-0 rounded-2xl overflow-hidden border border-white/[0.07]"
                        >
                            {/* Left: meta */}
                            <div className="bg-white/[0.04] p-8 flex flex-col justify-between">
                                <div>
                                    <span className="text-[11px] font-bold text-white/30 tracking-widest uppercase block mb-3">{c.index} · {c.tag}</span>
                                    <h3 className="text-lg font-bold text-white mb-6">{c.name}</h3>
                                </div>
                                <div>
                                    <div className="text-4xl font-sans font-bold tabular-nums text-[#6EE7B7] mb-1">{c.num}</div>
                                    <div className="text-xs text-white/30 leading-snug">{c.numLabel}</div>
                                </div>
                            </div>

                            {/* Center: quote */}
                            <div className="bg-white/[0.02] p-8 lg:p-10 flex flex-col justify-center border-x border-white/[0.07]">
                                <div className="text-[#6EE7B7]/30 text-4xl font-sans mb-4 leading-none">&ldquo;</div>
                                <blockquote className="text-lg font-sans text-white/80 leading-relaxed mb-5">{c.quote}</blockquote>
                                <cite className="text-sm text-white/30 not-italic">— {c.person}</cite>
                            </div>

                            {/* Right: before/after */}
                            <div className="bg-white/[0.04] p-8 grid grid-rows-2 gap-4">
                                <div>
                                    <p className="text-[10px] font-bold text-white/20 tracking-widest uppercase mb-2">{c.before.label}</p>
                                    <ul className="space-y-1">
                                        {c.before.items.map(item => (
                                            <li key={item} className="text-xs text-white/30 flex items-center gap-2">
                                                <span className="text-white/20">✕</span>{item}
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                                <div className={`rounded-xl p-4 ${c.accentBg}`}>
                                    <p className={`text-[10px] font-bold tracking-widest uppercase mb-2 ${c.accentText} opacity-60`}>{c.after.label}</p>
                                    <ul className="space-y-1">
                                        {c.after.items.map(item => (
                                            <li key={item} className={`text-xs font-medium flex items-center gap-2 ${c.accentText}`}>
                                                <CheckCircle2 className="w-3 h-3 shrink-0" />{item}
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            </div>
                        </Reveal>
                    ))}
                </div>
            </div>
        </section>
    )
}

/* ── 타이포 후킹 섹션 ────────────────────────────────────────── */
function TypographyHookSection() {
    const lines = [
        { text: "매일 반복되는 수업.", muted: false },
        { text: "그 안에서 아이들은", muted: false },
        { text: "정말 배우고 있을까요?", muted: false, accent: true },
    ]
    return (
        <section className="py-36 md:py-48 bg-[#FDFCF8] overflow-hidden">
            <div className="container mx-auto px-6 max-w-4xl">
                <div className="space-y-4 md:space-y-6 mb-16">
                    {lines.map((line, i) => (
                        <Reveal as="p"
                            key={i}
                            initial={{ opacity: 0, y: 30 }}
                            whileInView={{ opacity: 1, y: 0 }}
                            viewport={{ once: true }}
                            transition={{ delay: i * 0.18, duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
                            className={`text-[clamp(2rem,5vw,4rem)] font-sans leading-[1.15] tracking-tight ${
                                line.accent ? "text-[#22A366]" : "text-[#1a1a19]"
                            }`}
                        >
                            {line.text}
                        </Reveal>
                    ))}
                </div>

                <Reveal
                    initial={{ opacity: 0, scaleX: 0 }}
                    whileInView={{ opacity: 1, scaleX: 1 }}
                    viewport={{ once: true }}
                    transition={{ delay: 0.6, duration: 0.6, ease: "easeOut" }}
                    style={{ originX: 0 }}
                    className="w-16 h-[2px] bg-[#22A366] mb-10"
                />

                <Reveal
                    initial={{ opacity: 0, y: 20 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    transition={{ delay: 0.8, duration: 0.6 }}
                    className="max-w-lg"
                >
                    <p className="text-xl md:text-2xl font-sans text-slate-600 leading-relaxed mb-2">
                        교사가 <span className="font-bold text-slate-900">잘 가르칠 수 있을 때</span>,
                    </p>
                    <p className="text-xl md:text-2xl font-sans text-slate-600 leading-relaxed">
                        학생은 <span className="font-bold text-[#22A366]">더 깊이 배웁니다.</span>
                    </p>
                </Reveal>
            </div>
        </section>
    )
}

/* ── 미래 제시 1 섹션 ────────────────────────────────────────── */
const FUTURE_ITEMS = [
    { icon: "🌍", title: "국경 없는 교실", desc: "서울의 학생이 핀란드 교사에게 배우고, 부산의 학원이 도쿄와 협업 수업을 합니다." },
    { icon: "🤖", title: "AI 보조 교사", desc: "AI가 개별 학습 데이터를 분석해 실시간으로 교사에게 학생별 맞춤 피드백을 제안합니다." },
    { icon: "📡", title: "실시간 학습 진단", desc: "수업 중 학생의 집중도와 이해도를 실시간으로 파악해 교사가 즉각 대응할 수 있습니다." },
    { icon: "♻️", title: "지식의 재활용", desc: "한 번 만든 수업 콘텐츠가 전 세계 동료 교사들과 공유되고 발전합니다." },
]

function FutureVision1Section() {
    return (
        <section className="py-24 md:py-40 bg-[#084734] relative overflow-hidden">
            <div className="absolute inset-0 pointer-events-none">
                <div className="absolute bottom-0 left-0 w-[600px] h-[600px] bg-[#065c41] rounded-full translate-x-[-40%] translate-y-[40%] blur-[100px] opacity-60" />
                <div className="absolute top-0 right-0 w-[400px] h-[400px] bg-[#6EE7B7]/10 rounded-full translate-x-[30%] translate-y-[-30%] blur-[80px]" />
            </div>
            <div className="container mx-auto px-4 lg:px-8 max-w-6xl relative">
                <div className="grid lg:grid-cols-2 gap-16 items-center">
                    <Reveal initial={{ opacity: 0, x: -30 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true }} transition={{ duration: 0.8 }}>
                        <p className="text-[#6EE7B7]/60 text-sm font-semibold tracking-wider uppercase mb-6">The Future of Education</p>
                        <h2 className="text-4xl md:text-5xl lg:text-6xl font-sans font-bold text-white leading-[1.1] tracking-tight mb-6">
                            2030년의<br />교실은 <span className="text-[#6EE7B7]">달라집니다</span>
                        </h2>
                        <p className="text-lg text-white/50 leading-relaxed">
                            학교의 물리적 벽이 사라지고, AI가 개인 맞춤 교육을 제공하며,
                            세계 어느 곳의 학생도 최고의 교사에게 배울 수 있는 시대.
                            Classin은 그 미래를 지금 만들고 있습니다.
                        </p>
                    </Reveal>

                    <div className="grid grid-cols-2 gap-4">
                        {FUTURE_ITEMS.map((item, i) => (
                            <Reveal
                                key={item.title}
                                initial={{ opacity: 0, y: 25 }}
                                whileInView={{ opacity: 1, y: 0 }}
                                viewport={{ once: true }}
                                transition={{ delay: i * 0.1, duration: 0.6 }}
                                className="bg-white/[0.06] rounded-2xl p-6 border border-white/[0.08] hover:bg-white/[0.10] transition-colors"
                            >
                                <div className="text-2xl mb-3">{item.icon}</div>
                                <h3 className="text-sm font-bold text-white mb-2">{item.title}</h3>
                                <p className="text-xs text-white/40 leading-relaxed">{item.desc}</p>
                            </Reveal>
                        ))}
                    </div>
                </div>
            </div>
        </section>
    )
}

/* ── [A] 수업 사이클 섹션 (수업 전·중·후) ───────────────────── */
const CYCLE_PHASES = [
    {
        phase: "수업 전",
        emoji: "📋",
        color: "bg-[#ECFDF5] border-[#D1FAE5]",
        accent: "#084734",
        old: ["교재 따로 인쇄", "판서 자료 USB에 담기", "학생 예습 확인 불가"],
        now: ["TeacherIn으로 수업 콘티 저장", "클라우드에서 즉시 불러오기", "LMS 사전 퀴즈로 예습 확인"],
    },
    {
        phase: "수업 중",
        emoji: "🖊️",
        color: "bg-[#ECFDF5] border-[#D1FAE5]",
        accent: "#22A366",
        old: ["교사 혼자 판서", "학생은 영상만 시청", "출석 수동으로 체크"],
        now: ["학생이 직접 화면에서 문제 풀기", "30+ 도구로 쌍방향 수업", "자동 출석 체크 + 집중도 측정"],
    },
    {
        phase: "수업 후",
        emoji: "📊",
        color: "bg-[#F6F5F4] border-[#e8e8e4]",
        accent: "#31302E",
        old: ["녹화 파일 수동 공유", "숙제 카톡으로 받기", "성적 엑셀로 관리"],
        now: ["클라우드 자동 저장 · 다시보기", "LMS 숙제 제출 · AI 자동 채점", "학습 데이터 리포트 자동 생성"],
    },
]

function LearningCycleSection() {
    return (
        <section className="py-24 md:py-32 bg-white">
            <div className="container mx-auto px-4 lg:px-8 max-w-6xl">
                <Reveal className="text-center mb-14" {...fadeUp}>
                    <EyebrowTag>LEARNING CYCLE</EyebrowTag>
                    <h2 className="text-3xl md:text-4xl lg:text-5xl font-sans text-[#1a1a19] leading-tight">
                        수업의 처음부터 끝까지,<br /><span className="text-[#22A366]">하나로 연결</span>
                    </h2>
                    <p className="text-lg text-slate-400 mt-4 max-w-xl mx-auto">
                        수업 전 준비 → 수업 중 운영 → 수업 후 관리. 세 단계가 끊기지 않고 이어집니다.
                    </p>
                </Reveal>

                <div className="grid lg:grid-cols-3 gap-6">
                    {CYCLE_PHASES.map((p, i) => (
                        <Reveal
                            key={p.phase}
                            initial={{ opacity: 0, y: 30 }}
                            whileInView={{ opacity: 1, y: 0 }}
                            viewport={{ once: true }}
                            transition={{ delay: i * 0.12 }}
                            className={`rounded-2xl border p-7 ${p.color}`}
                        >
                            <div className="flex items-center gap-3 mb-6">
                                <span className="text-2xl">{p.emoji}</span>
                                <span className="text-lg font-bold text-slate-900">{p.phase}</span>
                            </div>

                            <div className="space-y-2 mb-5">
                                <p className="text-[11px] font-bold text-slate-400 tracking-wider uppercase mb-2">기존 방식</p>
                                {p.old.map((item) => (
                                    <div key={item} className="flex items-start gap-2 text-sm text-slate-400">
                                        <span className="mt-0.5 shrink-0">✕</span>
                                        <span className="line-through">{item}</span>
                                    </div>
                                ))}
                            </div>

                            <div className="h-px bg-black/[0.06] my-5" />

                            <div className="space-y-2">
                                <p className="text-[11px] font-bold tracking-wider uppercase mb-2" style={{ color: p.accent }}>Classin</p>
                                {p.now.map((item) => (
                                    <div key={item} className="flex items-start gap-2 text-sm font-medium text-slate-700">
                                        <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" style={{ color: p.accent }} />
                                        <span>{item}</span>
                                    </div>
                                ))}
                            </div>
                        </Reveal>
                    ))}
                </div>
            </div>
        </section>
    )
}

/* ── [B] 하드웨어 티저 섹션 ──────────────────────────────────── */
function HardwareTeaserSection() {
    return (
        <section className="py-24 md:py-32 bg-[#1a1a19] relative overflow-hidden">
            <div className="absolute inset-0 pointer-events-none opacity-10" style={{
                backgroundImage: "radial-gradient(circle at 70% 50%, rgba(110,231,183,0.3) 0%, transparent 60%)",
            }} />
            <div className="container mx-auto px-4 sm:px-6 lg:px-[10%] max-w-6xl relative">
                <div className="grid lg:grid-cols-2 gap-14 items-center">
                    <Reveal initial={{ opacity: 0, x: -30 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true }} transition={{ duration: 0.7 }}>
                        <span className="inline-flex items-center gap-2 bg-[#6EE7B7]/10 text-[#6EE7B7] text-xs font-bold px-3 py-1.5 rounded-full mb-6">
                            Classin Board · 하드웨어
                        </span>
                        <h2 className="text-3xl md:text-4xl lg:text-5xl font-sans text-white leading-tight mb-5">
                            소프트웨어만으로<br />부족하다면
                        </h2>
                        <p className="text-lg text-white/50 leading-relaxed mb-8">
                            AI 전자칠판 + 모션 트래킹 카메라 + AI 노이즈 캔슬링 마이크.
                            <br />
                            Classin 소프트웨어와 완벽하게 연동되는 스마트 교실을 구축하세요.
                        </p>
                        <div className="space-y-3 mb-10">
                            {[
                                { label: "4K@120Hz AI 전자칠판", sub: "20포인트 멀티터치 · 눈부심 방지" },
                                { label: "모션 트래킹 AI 카메라", sub: "120° 앵글 · 자동 줌·포커스 · 4K 녹화" },
                                { label: "AI 디노이즈 천장형 마이크", sub: "32개 마이크 내장 · 80㎡ 커버리지" },
                            ].map((item) => (
                                <div key={item.label} className="flex items-start gap-3">
                                    <div className="w-1.5 h-1.5 rounded-full bg-[#6EE7B7] mt-2 shrink-0" />
                                    <div>
                                        <span className="text-sm font-semibold text-white/90">{item.label}</span>
                                        <span className="text-sm text-white/30 ml-2">{item.sub}</span>
                                    </div>
                                </div>
                            ))}
                        </div>
                        <Link href="/product/hw" className="inline-flex items-center gap-2 bg-[#6EE7B7] hover:bg-[#4ade80] text-[#084734] font-bold text-sm px-6 py-3 rounded-full transition-all hover:scale-105">
                            하드웨어 상세 보기 <ArrowRight className="w-4 h-4" />
                        </Link>
                    </Reveal>

                    {/* Hardware visual */}
                    <Reveal initial={{ opacity: 0, x: 30 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true }} transition={{ duration: 0.7, delay: 0.1 }}>
                        <div className="text-center">
                            <div className="relative aspect-video w-full overflow-hidden rounded-2xl border border-white/10 bg-white/5 shadow-[0_24px_70px_rgba(0,0,0,0.28)]">
                                <Image
                                    src="/images/smartroon.webp"
                                    alt="Classin 소프트웨어와 연동되는 스마트 교실 구성"
                                    fill
                                    className="object-cover"
                                    sizes="(min-width: 1024px) 44vw, 100vw"
                                />
                                <div className="absolute inset-0 bg-gradient-to-t from-[#1a1a19]/28 via-transparent to-white/8" />
                            </div>
                            <p className="mt-4 text-white/30 text-xs">Classin Board · 스마트 교실 구성</p>
                        </div>
                    </Reveal>
                </div>
            </div>
        </section>
    )
}

/* ── [D] 도입 프로세스 섹션 → components/product/sw/OnboardingRoadmap.tsx 로 추출됨 ──────────── */

/* ── ① 텍스트 임팩트 섹션 ────────────────────────────────────── */
function ImpactTextSection() {
    return (
        <section className="py-24 md:py-36 bg-[#FDFCF8]">
            <div className="container mx-auto px-4 max-w-3xl">
                <Reveal
                    initial={{ opacity: 0, y: 30 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    transition={{ duration: 0.7 }}
                    className="space-y-6"
                >
                    <p className="text-sm font-semibold text-slate-400 tracking-widest uppercase">Before Classin</p>
                    <div className="space-y-4 text-2xl sm:text-3xl md:text-4xl font-sans text-slate-700 leading-snug">
                        <p>화면을 켜놓고 딴짓하는 학생.</p>
                        <p>녹화 파일을 공유하느라 허비하는 10분.</p>
                        <p className="text-slate-400">숙제는 카톡으로, 출결은 엑셀로,</p>
                        <p className="text-slate-400">성적은 또 다른 스프레드시트로.</p>
                    </div>
                    <Reveal as="p"
                        initial={{ opacity: 0 }}
                        whileInView={{ opacity: 1 }}
                        viewport={{ once: true }}
                        transition={{ delay: 0.4, duration: 0.7 }}
                        className="text-xl sm:text-2xl md:text-3xl font-sans text-slate-900 pt-4 border-t border-slate-100"
                    >
                        수업은 했는데,{" "}
                        <span className="text-[#22A366] font-bold">교육은 안 된 하루.</span>
                    </Reveal>
                    <Reveal as="p"
                        initial={{ opacity: 0, y: 10 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true }}
                        transition={{ delay: 0.7, duration: 0.6 }}
                        className="text-base sm:text-lg text-slate-500 leading-relaxed max-w-xl pt-2"
                    >
                        회의용 도구는 회의를 위해 만들어졌습니다.
                        교육은 그것과 다른 무언가가 필요합니다.
                        학생이 화면 안에서 <em className="not-italic font-semibold text-slate-700">직접 참여</em>할 수 있어야 합니다.
                    </Reveal>
                </Reveal>
            </div>
        </section>
    )
}

/* ── ② 풀스크린 배경 + 인용구 섹션 ──────────────────────────── */
function FullscreenQuoteSection() {
    return (
        <section className="relative py-32 md:py-48 overflow-hidden bg-[#084734]">
            {/* Subtle noise texture overlay */}
            <div className="absolute inset-0 opacity-[0.03]" style={{
                backgroundImage: "url(\"data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")",
            }} />
            {/* Radial glow */}
            <div className="absolute inset-0 pointer-events-none">
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[500px] bg-[#6EE7B7]/10 rounded-full blur-[120px]" />
            </div>

            <div className="container mx-auto px-4 max-w-4xl relative text-center">
                <Reveal
                    initial={{ opacity: 0, y: 40 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    transition={{ duration: 0.9 }}
                >
                    <div className="text-[#6EE7B7]/60 text-5xl font-sans mb-8 leading-none select-none">&ldquo;</div>
                    <blockquote className="text-2xl sm:text-3xl md:text-4xl font-sans text-white leading-[1.4] tracking-tight mb-10">
                        하이브리드 수업은 팬데믹의 임시방편이 아닙니다.
                        <br className="hidden md:block" />{" "}
                        <span className="text-[#6EE7B7]">교육의 새로운 표준</span>이 될 것입니다.
                    </blockquote>
                    <div className="flex flex-col items-center gap-1">
                        <div className="w-8 h-px bg-[#6EE7B7]/40 mb-3" />
                        <p className="text-[#6EE7B7]/70 text-sm font-semibold tracking-wider">왕보 (王博)</p>
                        <p className="text-white/40 text-sm">북경대학교 부총장 · Classin 글로벌 파트너</p>
                    </div>
                </Reveal>

                <Reveal
                    initial={{ opacity: 0 }}
                    whileInView={{ opacity: 1 }}
                    viewport={{ once: true }}
                    transition={{ delay: 0.5, duration: 0.7 }}
                    className="mx-auto mt-14 grid max-w-2xl grid-cols-1 gap-5 border-t border-white/10 pt-10 sm:mt-16 sm:grid-cols-3 sm:gap-8 sm:pt-12"
                >
                    {[
                        { value: "287개", label: "하이브리드 수업 (2021 가을학기 단 한 학기)" },
                        { value: "160+", label: "협력 국가" },
                        { value: "6만+", label: "교육기관" },
                    ].map((s) => (
                        <div key={s.label} className="text-center">
                            <div className="text-2xl sm:text-3xl font-sans font-bold tabular-nums text-white mb-1">{s.value}</div>
                            <div className="text-xs text-white/40 leading-relaxed">{s.label}</div>
                        </div>
                    ))}
                </Reveal>
            </div>
        </section>
    )
}

/* ── ③ 케이스 스터디 섹션 ────────────────────────────────────── */
const CASES = [
    {
        tag: "학원 운영",
        name: "부천 정율사관학원",
        headline: "타지역 학생을 온라인으로 끌어들이다",
        body: "오프라인 수업만 하던 입시학원이 Classin의 하이브리드 강의를 도입한 뒤, 부천 외 지역 학생 유치가 가능해졌습니다. 학생이 화면에서 직접 판서하며 풀이하는 방식으로 집중도가 올라갔고, TeacherIn으로 저장한 수업 콘티 덕분에 신규 강사 온보딩 시간도 크게 단축됐습니다.",
        results: [
            { label: "타지역 학생 유치", value: "가능" },
            { label: "학생 참여도", value: "급상승" },
            { label: "강사 온보딩 시간", value: "50% 단축" },
        ],
        color: "bg-[#ECFDF5] border-[#D1FAE5]",
        accent: "text-[#084734]",
        badgeBg: "bg-[#D1FAE5] text-[#084734]",
    },
    {
        tag: "글로벌 튜터링",
        name: "Acadsoc",
        headline: "1:1 온라인 튜터링으로 4,000만 학습자",
        body: "필리핀 튜터와 전 세계 학습자를 연결하는 ESL 플랫폼 Acadsoc는 2017년 Classin을 도입한 이후 Series A → C까지 투자를 유치했습니다. 현재도 영업팀과 강사진이 고객 데모에 Classin을 1순위로 사용할 만큼 수업 경험의 품질이 검증됐습니다.",
        results: [
            { label: "누적 학습자", value: "4,000만+" },
            { label: "고용 튜터", value: "15,000명" },
            { label: "누적 투자 유치", value: "$63.6M" },
        ],
        color: "bg-[#F6F5F4] border-[#e8e8e4]",
        accent: "text-[#31302E]",
        badgeBg: "bg-[#e8e8e4] text-[#615D59]",
    },
    {
        tag: "프랜차이즈",
        name: "전국 30개 지점 교육 그룹",
        headline: "본사에서 전국 수업 품질을 실시간 관리",
        body: "과거에는 지점마다 수업 품질이 달랐습니다. Classin 도입 후 전국 모든 수업 데이터가 실시간으로 본사에 집계됩니다. 어떤 강사가 어떤 수업을 어떻게 진행했는지 모니터링이 가능해지면서 교육 품질 편차가 현저히 줄었습니다.",
        results: [
            { label: "수업 품질 모니터링", value: "실시간" },
            { label: "지점 간 품질 편차", value: "대폭 감소" },
            { label: "강사 평가 자동화", value: "가능" },
        ],
        color: "bg-white border-[rgba(0,0,0,0.08)]",
        accent: "text-[#084734]",
        badgeBg: "bg-[#ECFDF5] text-[#084734]",
    },
]

function CaseStudiesSection() {
    return (
        <section className="py-24 md:py-32 bg-[#FDFCF8]">
            <div className="container mx-auto px-4 lg:px-8 max-w-6xl">
                <Reveal className="text-center mb-16" {...fadeUp}>
                    <EyebrowTag>CASE STUDY</EyebrowTag>
                    <h2 className="text-3xl md:text-4xl lg:text-5xl font-sans text-[#1a1a19] leading-tight">
                        실제 교육 현장의 <span className="text-[#22A366]">변화</span>
                    </h2>
                    <p className="text-lg text-slate-400 mt-4 max-w-xl mx-auto">도입 후 실제로 달라진 것들을 현장의 언어로 전달합니다.</p>
                </Reveal>

                <div className="grid lg:grid-cols-3 gap-6">
                    {CASES.map((c, i) => (
                        <Reveal
                            key={c.name}
                            initial={{ opacity: 0, y: 30 }}
                            whileInView={{ opacity: 1, y: 0 }}
                            viewport={{ once: true }}
                            transition={{ delay: i * 0.12, duration: 0.6 }}
                            className={`rounded-2xl border p-7 flex flex-col ${c.color} shadow-[0_4px_18px_rgba(0,0,0,0.04)]`}
                        >
                            <span className={`self-start text-xs font-bold px-3 py-1 rounded-full mb-4 ${c.badgeBg}`}>{c.tag}</span>
                            <h3 className="text-lg font-bold text-slate-900 mb-1">{c.name}</h3>
                            <p className={`text-base font-semibold mb-3 ${c.accent}`}>{c.headline}</p>
                            <p className="text-sm text-slate-500 leading-relaxed mb-6 flex-1">{c.body}</p>
                            <div className="grid grid-cols-3 gap-2 border-t border-black/[0.06] pt-5">
                                {c.results.map((r) => (
                                    <div key={r.label} className="text-center">
                                        <div className={`text-sm font-sans font-bold tabular-nums ${c.accent}`}>{r.value}</div>
                                        <div className="text-[10px] text-slate-400 mt-0.5 leading-tight">{r.label}</div>
                                    </div>
                                ))}
                            </div>
                        </Reveal>
                    ))}
                </div>
            </div>
        </section>
    )
}

/* ══════════════════════════════════════════════════════════════════
   MAIN PAGE
══════════════════════════════════════════════════════════════════ */
export default function ProductPage() {
    return (
        <div className="bg-[#FDFCF8] min-h-screen text-slate-900 font-sans selection:bg-green-200 pt-20">

            {/* ================================================================
                HERO — "수업을, 더 수업답게"
            ================================================================ */}
            <SwHeroSection />

            <section aria-labelledby="classin-software-summary" className="bg-white py-12 md:py-16">
                <div className="container mx-auto px-4 lg:px-8">
                    <div className="mx-auto grid max-w-5xl gap-6 border-y border-slate-200 py-8 md:grid-cols-[0.9fr_1.4fr] md:py-10">
                        <div>
                            <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#22A366]">Classin Software</p>
                            <h2 id="classin-software-summary" className="mt-3 text-2xl font-bold leading-tight text-slate-950 md:text-3xl">
                                Classin 소프트웨어는 수업 운영을 한 흐름으로 묶습니다
                            </h2>
                        </div>
                        <div>
                            <p className="text-base leading-8 text-slate-600 md:text-lg">
                                Classin 소프트웨어는 실시간 수업, 수업 도구, 과제 제출, AI 자동채점, 학습 데이터 리포트,
                                학부모 소통을 통합하는 학원 수업 운영 플랫폼입니다. 교사는 수업과 피드백에 집중하고,
                                관리자는 반별 운영 상태를 데이터로 확인할 수 있습니다.
                            </p>
                            <ul className="mt-6 grid gap-3 text-sm font-semibold text-slate-700 sm:grid-cols-3">
                                <li className="rounded-[8px] bg-[#ECFDF5] px-4 py-3 text-[#084734]">수업 전: 자료·과제 준비</li>
                                <li className="rounded-[8px] bg-[#ECFDF5] px-4 py-3 text-[#084734]">수업 중: 판서·퀴즈·상호작용</li>
                                <li className="rounded-[8px] bg-[#ECFDF5] px-4 py-3 text-[#084734]">수업 후: 채점·리포트·복습</li>
                            </ul>
                        </div>
                    </div>
                </div>
            </section>

            <KeyUseCases defaultValue="comms" />

            <ImpactTextSection />

            <WaveDivider color="#ffffff" />

            {/* ================================================================
                COMPARISON — Zoom vs Classin (staggered rows, visual contrast)
            ================================================================ */}
            <section className="py-16 md:py-24 bg-white">
                <div className="container mx-auto px-4 lg:px-8">
                    <Reveal className="text-center mb-16" {...fadeUp}>
                        <EyebrowTag>Why Classin</EyebrowTag>
                        <h2 className="text-3xl md:text-4xl lg:text-5xl font-sans text-[#1a1a19] leading-tight">
                            회의용 도구로 수업하던 시대는
                            <br className="hidden sm:block" />{" "}
                            <span className="text-[#22A366]">끝났습니다</span>
                        </h2>
                    </Reveal>

                    <div className="max-w-4xl mx-auto">
                        <div className="bg-white rounded-2xl border border-slate-200/60 shadow-lg overflow-hidden">
                            <div className="overflow-x-auto">
                                <table className="min-w-[720px] w-full text-sm">
                                    <thead>
                                        <tr className="bg-slate-50 border-b border-slate-100">
                                            <th className="text-left py-4 px-6 font-semibold text-slate-500 w-[30%]">구분</th>
                                            <th className="text-center py-4 px-6 font-semibold text-slate-400 w-[35%]">일반 화상 도구 (Zoom 등)</th>
                                            <th className="text-center py-4 px-6 font-bold text-[#22A366] w-[35%] border-l-2 border-[#22A366]/20 bg-[#ECFDF5]/60">
                                                <span className="inline-flex items-center gap-1.5">
                                                    Classin
                                                    <span className="text-[10px] bg-[#22A366] text-white px-1.5 py-0.5 rounded-full font-bold">추천</span>
                                                </span>
                                            </th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {[
                                            { label: "주요 목적", zoom: "비즈니스 회의 · 정보 전달", classin: "실시간 상호작용 수업 · 교육" },
                                            { label: "판서 기능", zoom: "기본적인 그리기 위주", classin: "레이어 기반 전문 교구 활용" },
                                            { label: "학생 참여", zoom: "채팅 또는 음소거 해제", classin: "교재 직접 조작 · 능동 참여" },
                                            { label: "수업 도구", zoom: "화면 공유 + 기본 그리기", classin: "30여 가지 인터랙티브 도구" },
                                            { label: "수업 활동", zoom: "없음 (별도 앱 필요)", classin: "10가지 참여형 수업 활동" },
                                            { label: "학습 관리", zoom: "별도 LMS 필요", classin: "자체 LMS 기능 탑재" },
                                            { label: "수업 형태", zoom: "화상 회의 1가지", classin: "1:1 ~ 수백 명 대형 강의" },
                                            { label: "녹화 · 복습", zoom: "파일 수동 관리", classin: "클라우드 자동 녹화& 업로드" },
                                        ].map((row, i) => (
                                            <Reveal as="tr"
                                                key={i}
                                                initial={{ opacity: 0, x: -20 }}
                                                whileInView={{ opacity: 1, x: 0 }}
                                                viewport={{ once: true }}
                                                transition={{ delay: i * 0.06 }}
                                                className={`border-b border-slate-50 ${i % 2 === 0 ? "bg-white" : "bg-slate-50/30"}`}
                                            >
                                                <td className="py-4 px-6 font-medium text-slate-700">{row.label}</td>
                                                <td className="py-4 px-6 text-left text-slate-400">
                                                    <span className="flex w-full items-start gap-2 leading-relaxed">
                                                        <X className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-300" />
                                                        <span>{row.zoom}</span>
                                                    </span>
                                                </td>
                                                <td className="py-4 px-6 text-center text-slate-900 font-medium bg-[#ECFDF5]/30 border-l-2 border-[#22A366]/15">
                                                    <span className="flex w-full items-start gap-2 leading-relaxed">
                                                        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[#22A366]" />
                                                        <span>{row.classin}</span>
                                                    </span>
                                                </td>
                                            </Reveal>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>
                </div>
            </section>

            <LearningCycleSection />

            <WaveDivider flip color="#FDFCF8" />

            {/* ================================================================
                양방향 블랙보드 (SVG path animation, animated cursors)
            ================================================================ */}
            <section className="py-24 md:py-32">
                <div className="container mx-auto px-4 lg:px-8">
                    <div className="flex flex-col lg:flex-row items-center gap-16 lg:gap-20 max-w-7xl mx-auto">
                        <div className="flex-1 max-w-xl">
                            <Reveal {...fadeUp}>
                                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#22A366]/5 text-[#22A366] text-sm font-bold mb-6">
                                    <PenTool className="w-4 h-4" />양방향 블랙보드
                                </div>
                                <h2 className="text-3xl md:text-5xl font-sans text-[#1a1a19] mb-6 leading-tight">
                                    교사만 쓰는 칠판은<br /><span className="text-[#22A366]">칠판이 아닙니다</span>
                                </h2>
                                <p className="text-lg text-slate-500 leading-relaxed font-medium mb-10">교사의 판서를 보기만 하던 시대는 끝났습니다. 학생에게 권한을 주어 직접 문제를 풀고, 그림을 그리고, 아이디어를 표현하게 하세요.</p>
                            </Reveal>
                            <div className="space-y-5">
                                {[
                                    { icon: <Users className="w-5 h-5" />, label: "학생 동시 판서", detail: "여러 학생이 동시에 같은 화면에서 필기합니다. 그룹 토론과 협업이 자연스럽게." },
                                    { icon: <Layers className="w-5 h-5" />, label: "레이어 기반 교구", detail: "단순 그리기가 아닌, 레이어·도형·수식 편집기를 갖춘 전문 교육 도구." },
                                    { icon: <BookOpen className="w-5 h-5" />, label: "교재 위에 직접 풀기", detail: "PDF, PPT 교재를 올리고 그 위에 바로 필기. 종이 프린트가 필요 없습니다." },
                                ].map((f, i) => (
                                    <Reveal key={i} {...stagger(i)} className="flex items-center gap-4 bg-white border border-[rgba(0,0,0,0.06)] rounded-xl p-4 shadow-[0_1px_4px_rgba(0,0,0,0.04)] hover:shadow-[0_4px_18px_rgba(0,0,0,0.07)] hover:border-[rgba(34,163,102,0.18)] transition-all group">
                                        <div className="w-11 h-11 rounded-xl bg-[#ECFDF5] border border-[rgba(34,163,102,0.15)] text-[#22A366] flex items-center justify-center shrink-0">{f.icon}</div>
                                        <div className="flex-1 min-w-0"><h4 className="font-bold text-slate-900 mb-0.5 text-sm">{f.label}</h4><p className="text-xs text-slate-500 leading-relaxed">{f.detail}</p></div>
                                        <ArrowRight className="w-4 h-4 text-slate-200 group-hover:text-[#22A366]/40 shrink-0 transition-colors" />
                                    </Reveal>
                                ))}
                            </div>
                        </div>

                        {/* Blackboard classroom video */}
                        <div className="flex-1 w-full max-w-lg">
                            <Reveal {...fadeUp} className="relative">
                                <div className="relative aspect-[3/2] overflow-hidden rounded-3xl border border-slate-200/80 bg-white shadow-[0_24px_60px_rgba(15,23,42,0.14)]">
                                    <HeroVideoBackdrop
                                        src={BLACKBOARD_VIDEO_SRC}
                                        posterSrc="/images/product/sw/two-way-blackboard.webp"
                                        posterAlt="교사와 학생이 함께 참여하는 Classin 양방향 블랙보드 수업 장면"
                                        className="absolute inset-0"
                                        imageClassName="object-contain bg-[#eef4f0]"
                                        videoClassName="scale-100 object-contain blur-0 bg-[#eef4f0]"
                                        sizes="(min-width: 1024px) 512px, 100vw"
                                        loadStrategy="in-view"
                                        preload="auto"
                                        mediaQuery={VIDEO_BACKDROP_MEDIA_QUERY}
                                    />
                                    <div className="absolute inset-0 bg-gradient-to-t from-[#084734]/18 via-transparent to-white/12" />
                                    <div className="absolute left-5 top-5 rounded-full border border-white/70 bg-white/88 px-3 py-1.5 text-xs font-semibold text-[#084734] shadow-[0_10px_30px_rgba(15,23,42,0.08)] backdrop-blur-sm">
                                        실제 수업 화면
                                    </div>
                                </div>
                                <Reveal initial={{ opacity: 0, scale: 0.8 }} whileInView={{ opacity: 1, scale: 1 }} viewport={{ once: true }} transition={{ delay: 0.5, type: "spring" }} className="absolute -bottom-4 -left-4 rounded-2xl border border-slate-100 bg-white px-4 py-3 shadow-[0_16px_40px_rgba(15,23,42,0.12)]">
                                    <div className="text-xs font-medium text-slate-400 mb-1">양방향 수업</div>
                                    <div className="text-lg font-bold text-[#22A366]">학생도 화면 위에서 함께 풉니다</div>
                                </Reveal>
                            </Reveal>
                        </div>
                    </div>
                </div>
            </section>

            <WaveDivider color="#ffffff" />

            {/* ================================================================
                30가지 수업 도구 + 10가지 수업 활동 (categorized, wave anim)
            ================================================================ */}
            <section className="py-16 md:py-24 bg-white">
                <div className="container mx-auto px-4 lg:px-8">
                    <Reveal className="text-center mb-12" {...fadeUp}>
                        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-bold mb-6 bg-[#ECFDF5] border border-[rgba(34,163,102,0.2)] text-[#22A366] tracking-wide">
                            <Dice1 className="w-4 h-4" />수업 도구 · 수업 활동
                        </div>
                        <h2 className="text-3xl md:text-5xl font-sans text-[#1a1a19] mb-4 leading-tight">
                            수업이 지루할 틈이 <span className="text-[#22A366]">없습니다</span>
                        </h2>
                        <p className="text-lg text-slate-500 max-w-2xl mx-auto">타이머, 미러링, 스톱워치, 개인칠판 등 30여 가지 수업 도구를 수업 화면 안에서 바로 꺼내 씁니다.</p>
                    </Reveal>

                    {/* 30+ 수업 도구 — actual product tool board */}
                    <div className="max-w-6xl mx-auto mb-20">
                        <Reveal
                            {...fadeUp}
                            className="overflow-hidden rounded-[32px] border border-slate-200 bg-[radial-gradient(circle_at_top,#5B6471_0%,#353D49_38%,#171C25_100%)] p-6 md:p-8 shadow-[0_30px_80px_rgba(15,23,42,0.18)]"
                        >
                            <div className="mb-8 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
                                <div>
                                    <p className="text-sm font-bold uppercase tracking-[0.28em] text-white/55">30+ 수업 도구</p>
                                    <h3 className="mt-2 text-2xl md:text-3xl font-semibold text-white">실제 수업 화면에서 바로 꺼내 쓰는 대표 툴</h3>
                                </div>
                                <p className="max-w-xl text-sm leading-relaxed text-white/65">
                                    스크린샷 기준 대표 도구를 추려 보여줍니다. 타이머와 퀴즈부터 미러링, VNC, 실험, 공동 작업까지 수업 흐름 안에서 즉시 실행할 수 있습니다.
                                </p>
                            </div>

                            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
                                {LESSON_TOOLS.map((tool, i) => (
                                    <Reveal
                                        key={tool.label}
                                        initial={{ opacity: 0, y: 14, scale: 0.96 }}
                                        whileInView={{ opacity: 1, y: 0, scale: 1 }}
                                        viewport={{ once: true }}
                                        transition={{ delay: i * 0.02 }}
                                        className="group rounded-2xl border border-white/10 bg-white/[0.04] px-3 py-4 text-center backdrop-blur-sm transition-all hover:-translate-y-1 hover:border-white/20 hover:bg-white/[0.08] hover:shadow-[0_20px_40px_rgba(15,23,42,0.18)]"
                                    >
                                        <div className={`mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br ${tool.tone} shadow-[inset_0_1px_0_rgba(255,255,255,0.4)] transition-transform group-hover:scale-105`}>
                                            <tool.icon className="h-5 w-5" />
                                        </div>
                                        <p className={`break-keep text-sm font-semibold leading-snug text-white/90 ${tool.labelClass ?? ""}`}>
                                            {tool.label}
                                        </p>
                                    </Reveal>
                                ))}
                            </div>
                        </Reveal>
                    </div>

                    {/* 10가지 수업 활동 */}
                    <div className="max-w-5xl mx-auto">
                        <Reveal as="h3" {...fadeUp} className="text-sm font-bold text-slate-400 tracking-wider uppercase mb-6 text-center">10가지 수업 활동</Reveal>
                        <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-12 gap-4">
                            {LESSON_ACTIVITIES.map((act, i) => (
                                <Reveal
                                    key={act.label}
                                    {...stagger(i)}
                                    className={`${act.cardClass} rounded-2xl border border-[rgba(0,0,0,0.08)] bg-white shadow-[0_1px_6px_rgba(0,0,0,0.04)] transition-all hover:-translate-y-1 hover:shadow-[0_14px_30px_rgba(34,163,102,0.08)] group ${act.featured ? "p-5 md:p-6" : "p-4 md:p-5"}`}
                                >
                                    <div className={act.featured ? "flex items-start gap-4" : "flex flex-col items-center text-center"}>
                                        <div className={`relative shrink-0 transition-transform duration-300 group-hover:scale-105 ${act.iconSizeClass}`}>
                                            <Image
                                                src={`${act.iconSrc}?v=${ACTIVITY_ICON_VERSION}`}
                                                alt={act.iconAlt}
                                                fill
                                                unoptimized
                                                className="object-contain"
                                                sizes={act.featured ? "56px" : "40px"}
                                            />
                                        </div>
                                        <div className={act.featured ? "min-w-0 flex-1 pt-1" : "mt-3"}>
                                            <h4 className={`font-bold text-slate-900 ${act.featured ? "text-lg mb-1.5" : "text-sm"}`}>{act.label}</h4>
                                            {act.desc ? <p className="text-sm leading-relaxed text-slate-500">{act.desc}</p> : null}
                                        </div>
                                    </div>
                                </Reveal>
                            ))}
                        </div>
                        <Reveal as="p" {...fadeUp} className="mt-6 text-center text-sm text-slate-400">
                            활동 단위로 수업을 설계하고, 자료 공유부터 평가와 피드백까지 한 흐름으로 연결됩니다.
                        </Reveal>
                    </div>
                </div>
            </section>

            <WaveDivider flip color="#FDFCF8" />

            {/* ================================================================
                다양한 수업 형태 (3D tilt, people visualization)
            ================================================================ */}
            <section className="py-24 md:py-32">
                <div className="container mx-auto px-4 lg:px-8">
                    <Reveal className="text-center mb-16" {...fadeUp}>
                        <EyebrowTag>FLEXIBLE FORMAT</EyebrowTag>
                        <h2 className="text-3xl md:text-4xl lg:text-5xl font-sans text-[#1a1a19] leading-tight">
                            1:1 과외부터 수백 명 강의까지,<br /><span className="text-[#22A366]">하나의 플랫폼</span>
                        </h2>
                    </Reveal>

                    <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5 max-w-5xl mx-auto">
                        {[
                            { icon: <Users className="w-7 h-7" />, title: "1:1 과외", desc: "개인 맞춤 수업에 최적화된 집중 환경", people: 1, color: "bg-[#ECFDF5] border-[#D1FAE5] text-[#084734]", dotColor: "bg-[#084734]" },
                            { icon: <MessageSquare className="w-7 h-7" />, title: "소그룹 토론", desc: "그룹별 방 분리, 동시 판서, 발표 기능", people: 6, color: "bg-green-50 border-green-100 text-green-600", dotColor: "bg-green-400" },
                            { icon: <Monitor className="w-7 h-7" />, title: "일반 수업", desc: "학원 · 학교의 표준 수업 형태", people: 12, color: "bg-[#D1FAE5] border-[#D1FAE5] text-[#065c41]", dotColor: "bg-[#065c41]" },
                            { icon: <GraduationCap className="w-7 h-7" />, title: "대형 강의", desc: "수백 명이 동시 참여하는 라이브 강의", people: 20, color: "bg-green-50 border-green-100 text-green-700", dotColor: "bg-green-500" },
                        ].map((item, i) => (
                            <Reveal
                                key={i}
                                initial={{ opacity: 0, y: 30, rotateX: 8 }}
                                whileInView={{ opacity: 1, y: 0, rotateX: 0 }}
                                viewport={{ once: true }}
                                transition={{ delay: i * 0.1, type: "spring", stiffness: 200, damping: 25 }}
                                whileHover={{ y: -8, boxShadow: "0 20px 40px rgba(0,0,0,0.08)" }}
                                className={`rounded-2xl border p-6 ${item.color} text-center transition-all cursor-pointer`}
                                style={{ perspective: 800 }}
                            >
                                <div className="w-14 h-14 rounded-2xl bg-white border border-[rgba(0,0,0,0.08)] flex items-center justify-center mx-auto mb-4 shadow-[0_2px_10px_rgba(0,0,0,0.07)]">{item.icon}</div>
                                <h3 className="text-xl font-bold text-slate-900 mb-2">{item.title}</h3>
                                {/* People dots */}
                                <div className="flex flex-wrap justify-center gap-1 mb-3">
                                    {[...Array(Math.min(item.people, 15))].map((_, j) => (
                                        <Reveal
                                            key={j}
                                            initial={{ scale: 0 }}
                                            whileInView={{ scale: 1 }}
                                            viewport={{ once: true }}
                                            transition={{ delay: i * 0.1 + j * 0.03 }}
                                            className={`w-2 h-2 rounded-full ${item.dotColor}`}
                                        />
                                    ))}
                                    {item.people > 15 && <span className="text-[10px] font-bold opacity-50 ml-1">+{item.people > 100 ? "···" : ""}</span>}
                                </div>
                                <p className="text-sm text-slate-500">{item.desc}</p>
                            </Reveal>
                        ))}
                    </div>
                </div>
            </section>

            <HardwareTeaserSection />

            <FullscreenQuoteSection />

            <NetworkStatsSection />

            <AnalyticsSection />

            <AIFeaturesSection />

            <CaseStudiesSection />

            <WaveDivider color="#ffffff" />

            {/* ================================================================
                TESTIMONIALS (avatars, star ratings, marquee option)
            ================================================================ */}
            <section className="relative overflow-hidden bg-[#F6F7F2] py-20 md:py-24">
                <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[#084734]/20 to-transparent" />
                <div className="container mx-auto max-w-7xl px-4 lg:px-8">
                    <div className="max-w-2xl">
                        <Reveal {...fadeUp}>
                            <EyebrowTag>-Real Voice-</EyebrowTag>
                            <h2 className="mt-5 max-w-2xl text-3xl font-sans leading-tight text-[#1a1a19] md:text-5xl">
                                수업 운영을 바꾼 사람들의
                                <br />
                                <span className="text-[#22A366]">구체적인 한마디</span>
                            </h2>
                            <p className="mt-5 max-w-xl text-base font-medium leading-7 text-slate-500">
                                수업 도구, 자동채점, 온라인 운영, 온보딩 경험까지. Classin 소프트웨어를 실제로 쓰며
                                달라진 장면을 중심으로 정리했습니다.
                            </p>
                        </Reveal>
                    </div>

                    <div className="mt-10 grid gap-4 md:grid-cols-2 lg:grid-cols-12">
                        {SOFTWARE_TESTIMONIALS.map((testimonial) => (
                            <TestimonialCard key={`${testimonial.name}-${testimonial.role}`} {...testimonial} />
                        ))}
                    </div>
                </div>
            </section>

            <PricingValueSection />

            <OnboardingRoadmap />

            <FAQSection />

            <CinematicCasesSection />
            <TypographyHookSection />
            <FutureVision1Section />
            <FutureVision2Section />

            {/* ================================================================
                FINAL CTA
            ================================================================ */}
            <FinalCTASection />

        </div>
    )
}
