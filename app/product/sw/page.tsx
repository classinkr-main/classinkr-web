"use client"

import { Button } from "@/components/ui/button"
import { trackEvent } from "@/lib/analytics"
import { BROCHURE_URL } from "@/lib/marketing-links"
import { motion, useInView, useMotionValue, useTransform, useScroll, useMotionValueEvent, animate } from "framer-motion"
import {
    Play, ArrowRight, Sparkles, Monitor, Layers, MousePointerClick,
    Clock, Users, PenTool, Dice1, FileText, Layout, Video,
    Globe, Wifi, BarChart3, BookOpen, Timer,
    MessageSquare, GraduationCap, CheckCircle2, Zap, Shield,
    Star, X, Camera, Trophy, Shuffle, FlaskConical, Atom, Ruler, Laptop
} from "lucide-react"
import Link from "next/link"
import Image from "next/image"
import { useRef, useEffect, useState, useMemo, useCallback } from "react"

import OnboardingRoadmap from "@/components/product/sw/OnboardingRoadmap"

const CHECKOUT_ENABLED = process.env.NEXT_PUBLIC_SW_CHECKOUT_ENABLED === "true"
const CHECKOUT_HREF = CHECKOUT_ENABLED ? "/checkout" : "/contact#contact-form"
const CHECKOUT_CTA_LABEL = CHECKOUT_ENABLED ? "지금 바로 결제 시작" : "지금 무료로 시작하기"
const CHECKOUT_SUB_LABEL = CHECKOUT_ENABLED ? "카드·네이버페이로 즉시 시작" : "설치 없이 바로 체험 · 카드 등록 불필요"

const trackCheckoutClick = (location: string) => {
    if (CHECKOUT_ENABLED) {
        trackEvent("begin_checkout", { button: location, page: "/product/sw" })
    } else {
        trackEvent("click_cta", { button: location, page: "/product/sw", destination: "contact_form" })
    }
}
const HERO_CLASSROOM_VIDEO_SRC = "/video/쿼드러닝 수업_클립1.mp4"
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

function EyebrowTag({ children, center = true }: { children: React.ReactNode; center?: boolean }) {
    return (
        <div className={`flex items-center gap-3 mb-4 ${center ? "justify-center" : "justify-start"}`}>
            <div className="h-px w-5 bg-[#22A366]/40 shrink-0" />
            <p className="text-[11px] font-bold text-[#22A366] tracking-[0.2em] uppercase whitespace-nowrap">{children}</p>
            <div className="h-px w-5 bg-[#22A366]/40 shrink-0" />
        </div>
    )
}

function seededFraction(seed: number) {
    const value = Math.sin(seed * 9999) * 10000
    return value - Math.floor(value)
}

function createParticles(count: number) {
    return Array.from({ length: count }, (_, i) => ({
        x: seededFraction(i + 1) * 100,
        size: 3 + seededFraction(i + 101) * 5,
        duration: 8 + seededFraction(i + 201) * 10,
        delayStart: seededFraction(i + 301) * 6,
        key: i,
    }))
}

/* ── Wave Divider ────────────────────────────────────────────────── */
function WaveDivider({ flip = false, color = "#ffffff" }: { flip?: boolean; color?: string }) {
    return (
        <div className={`w-full overflow-hidden leading-[0] ${flip ? "rotate-180" : ""}`}>
            <svg viewBox="0 0 1440 60" preserveAspectRatio="none" className="w-full h-[40px] md:h-[60px]">
                <path d="M0,30 C360,60 720,0 1080,30 C1260,45 1380,20 1440,30 L1440,60 L0,60 Z" fill={color} />
            </svg>
        </div>
    )
}

/* ── CountUp Hook ────────────────────────────────────────────────── */
function useCountUp(target: number, trigger: boolean, duration = 2) {
    const [value, setValue] = useState(0)
    const mv = useMotionValue(0)
    useEffect(() => {
        if (!trigger) return
        const unsub = mv.on("change", (v) => setValue(Math.round(v)))
        animate(mv, target, { duration, ease: "easeOut" })
        return unsub
    }, [trigger, target, duration, mv])
    return value
}

/* ── SlotDigit ───────────────────────────────────────────────────── */
function SlotDigit({ digit, delay, trigger, onDone }: { digit: string; delay: number; trigger: boolean; onDone?: () => void }) {
    const num = Number.parseInt(digit, 10)
    const [done, setDone] = useState(false)
    const cellRef = useRef<HTMLSpanElement>(null)
    const [cellH, setCellH] = useState(0)
    const [displayIndex, setDisplayIndex] = useState(0)
    const [spinTransition, setSpinTransition] = useState<{ duration: number; delay?: number; ease?: [number, number, number, number] }>({ duration: 0 })
    const hasTriggeredRef = useRef(false)
    const pendingNormalizeRef = useRef(false)
    const previousDigitRef = useRef(num)
    const stripDigits = useMemo(() => Array.from({ length: 40 }, (_, i) => i % 10), [])

    useEffect(() => {
        function measure() {
            const nextHeight = cellRef.current?.offsetHeight ?? 0
            if (nextHeight > 0) setCellH(nextHeight)
        }

        measure()
        const frame = window.requestAnimationFrame(measure)

        let observer: ResizeObserver | undefined
        if (typeof ResizeObserver !== "undefined" && cellRef.current) {
            observer = new ResizeObserver(measure)
            observer.observe(cellRef.current)
        }

        void document.fonts?.ready.then(measure)
        window.addEventListener("resize", measure)

        return () => {
            window.cancelAnimationFrame(frame)
            observer?.disconnect()
            window.removeEventListener("resize", measure)
        }
    }, [])

    useEffect(() => {
        if (!trigger || cellH === 0 || Number.isNaN(num)) return

        const isFirstSpin = !hasTriggeredRef.current
        let frame = 0
        if (isFirstSpin) {
            hasTriggeredRef.current = true
            previousDigitRef.current = num
            pendingNormalizeRef.current = true
            frame = window.requestAnimationFrame(() => {
                setSpinTransition({
                    duration: 1.35,
                    delay,
                    ease: [0.16, 1, 0.3, 1],
                })
                setDisplayIndex(30 + num)
            })
            return () => window.cancelAnimationFrame(frame)
        }

        const previous = previousDigitRef.current
        if (previous === num) return

        const currentIndex = 10 + previous
        const delta = (num - previous + 10) % 10

        previousDigitRef.current = num
        pendingNormalizeRef.current = true
        frame = window.requestAnimationFrame(() => {
            setSpinTransition({
                duration: 0.95,
                ease: [0.22, 1, 0.36, 1],
            })
            setDisplayIndex(currentIndex + 10 + delta)
        })

        return () => window.cancelAnimationFrame(frame)
    }, [cellH, delay, num, trigger])

    return (
        <div className="relative h-14 w-9 overflow-hidden rounded-lg border border-[rgba(34,163,102,0.12)] bg-white shadow-[0_4px_24px_rgba(0,0,0,0.06)] sm:h-28 sm:w-20 sm:rounded-xl md:h-36 md:w-28 md:rounded-2xl">
            <div className="absolute inset-0 bg-gradient-to-b from-slate-50/80 to-transparent h-1/2 pointer-events-none z-10"></div>
            <motion.div
                className="absolute left-0 top-0 flex w-full flex-col items-center"
                initial={{ y: 0 }}
                animate={trigger && cellH > 0 ? { y: -(displayIndex * cellH) } : { y: 0 }}
                transition={spinTransition}
                onAnimationComplete={() => {
                    if (!pendingNormalizeRef.current) return
                    pendingNormalizeRef.current = false
                    setSpinTransition({ duration: 0 })
                    setDisplayIndex(10 + previousDigitRef.current)
                    if (!done) {
                        setDone(true)
                        onDone?.()
                    }
                }}
            >
                {stripDigits.map((n, index) => (
                    <span
                        key={`${n}-${index}`}
                        ref={index === 0 ? cellRef : undefined}
                        className={`flex h-14 w-full flex-none items-center justify-center text-3xl font-sans font-semibold leading-none tabular-nums text-[#22A366] sm:h-28 sm:text-6xl md:h-36 md:text-8xl ${done ? "animate-digit-glow" : ""}`}
                    >
                        {n}
                    </span>
                ))}
            </motion.div>
        </div>
    )
}

/* ── StatCard ────────────────────────────────────────────────────── */
function StatCard({ value, suffix, label, icon, delay, trigger }: { value: number; suffix: string; label: string; icon: React.ReactNode; delay: number; trigger: boolean }) {
    const display = useCountUp(value, trigger, 2)
    return (
        <motion.div
            className="bg-white rounded-2xl border border-slate-200/80 shadow-[0_2px_20px_rgba(0,0,0,0.04)] p-5 sm:p-6 text-center flex-1 min-w-[140px] border-t-2 border-t-[#22A366]"
            initial={{ opacity: 0, y: 25, rotateX: 8 }}
            animate={trigger ? { opacity: 1, y: 0, rotateX: 0 } : {}}
            transition={{ type: "spring", stiffness: 200, damping: 25, delay }}
            style={{ perspective: 800 }}
        >
            <div className="flex justify-center mb-3 text-[#22A366]/70">{icon}</div>
            <div className="text-2xl sm:text-3xl font-sans font-bold tabular-nums text-slate-900 mb-1">
                {value >= 100 ? display.toLocaleString() : display}{suffix}
            </div>
            <div className="text-xs sm:text-sm text-slate-400 font-medium leading-snug whitespace-pre-line">{label}</div>
        </motion.div>
    )
}

/* ── Ambient particle ────────────────────────────────────────────── */
function formatParticleValue(value: number) {
    return value.toFixed(3).replace(/\.?0+$/, "")
}

function AmbientParticle({ x, size, duration, delayStart }: { x: number; size: number; duration: number; delayStart: number }) {
    return (
        <motion.div
            className="absolute rounded-full bg-green-300/15 pointer-events-none"
            style={{
                left: `${formatParticleValue(x)}%`,
                bottom: "-10%",
                width: `${formatParticleValue(size)}px`,
                height: `${formatParticleValue(size)}px`,
            }}
            animate={{ y: [0, -600, -1200], opacity: [0, 0.5, 0] }}
            transition={{ duration, delay: delayStart, repeat: Infinity, ease: "easeInOut" }}
        />
    )
}

/* ── Avatar with initials ────────────────────────────────────────── */
function Avatar({ name, gradient }: { name: string; gradient: string }) {
    const initials = name.split(" ").map(n => n[0]).join("").slice(0, 2)
    return (
        <div className={`w-12 h-12 rounded-full flex-shrink-0 flex items-center justify-center text-white font-bold text-sm bg-gradient-to-br ${gradient}`}>
            {initials}
        </div>
    )
}

/* ── Testimonial Card ────────────────────────────────────────────── */
function TestimonialCard({ name, role, quote, rating, gradient, dark = false, delay = 0 }: {
    name: string; role: string; quote: string; rating: number; gradient: string; dark?: boolean; delay?: number
}) {
    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay }}
            className={`p-8 rounded-3xl ${dark ? "bg-[#1a1a19] text-white shadow-[0_10px_40px_rgba(0,0,0,0.08)]" : "bg-[#FDFCF8] shadow-[0_10px_40px_rgba(0,0,0,0.03)] border border-[#f3f0ea]"} hover:shadow-lg transition-shadow`}
        >
            <div className="flex items-center gap-4 mb-4">
                <Avatar name={name} gradient={gradient} />
                <div>
                    <div className={`font-bold ${dark ? "text-white" : "text-slate-900"}`}>{name}</div>
                    <div className={`text-sm ${dark ? "text-slate-400" : "text-slate-500"}`}>{role}</div>
                </div>
            </div>
            <div className="flex gap-0.5 mb-4">
                {[...Array(5)].map((_, i) => (
                    <Star key={i} className={`w-4 h-4 ${i < rating ? "text-amber-400 fill-amber-400" : "text-slate-200"}`} />
                ))}
            </div>
            <p className={`leading-relaxed font-medium ${dark ? "text-slate-200" : "text-slate-600"}`}>
                &ldquo;{quote}&rdquo;
            </p>
        </motion.div>
    )
}

/* ── Final CTA Section ───────────────────────────────────────────── */
function FinalCTASection() {
    const sectionRef = useRef<HTMLElement>(null)
    const { scrollYProgress } = useScroll({ target: sectionRef, offset: ["start end", "end start"] })
    const [phase, setPhase] = useState(0)
    const [slotsDone, setSlotsDone] = useState(false)
    const [liveCount, setLiveCount] = useState(0)
    const [particleCount] = useState(() =>
        typeof window !== "undefined" && window.innerWidth < 640 ? 8 : 15
    )

    useMotionValueEvent(scrollYProgress, "change", (v) => {
        if (v >= 0.55 && phase < 3) setPhase(3)
        else if (v >= 0.35 && phase < 2) setPhase(2)
        else if (v >= 0.15 && phase < 1) setPhase(1)
    })

    const glowOpacity = useTransform(scrollYProgress, [0.1, 0.4], [0, 1])

    useEffect(() => {
        if (!slotsDone) return
        let interval: ReturnType<typeof setInterval>
        const timeout = setTimeout(() => {
            interval = setInterval(() => setLiveCount((p) => p + 1), 4200)
        }, 3000)
        return () => { clearTimeout(timeout); clearInterval(interval) }
    }, [slotsDone])

    const particles = useMemo(() => createParticles(particleCount), [particleCount])

    const handleLastSlotDone = useCallback(() => setSlotsDone(true), [])
    const displayDigits = useMemo(() => (1560000 + liveCount).toString().split(""), [liveCount])

    return (
        <section ref={sectionRef} className="relative py-32 md:py-44 overflow-hidden" style={{ minHeight: "100vh" }}>
            <div className="absolute inset-0 bg-gradient-to-b from-[#F0FDF9] via-[#F0FDF9] to-[#FDFCF8]"></div>
            <div className="absolute top-0 left-0 right-0 h-44 md:h-60 bg-gradient-to-b from-[#FDFCF8] via-[#F0FDF9]/85 to-transparent pointer-events-none"></div>
            <motion.div className="absolute inset-0 pointer-events-none" style={{ opacity: glowOpacity }}>
                <motion.div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[900px] h-[700px] bg-gradient-radial from-green-200/30 via-green-100/10 to-transparent rounded-full blur-3xl" animate={{ x: [0, 30, -20, 0], y: [0, -20, 15, 0] }} transition={{ duration: 20, repeat: Infinity, ease: "easeInOut" }} />
            </motion.div>
            <motion.div className="absolute inset-0 pointer-events-none" initial={{ opacity: 0 }} animate={phase >= 1 ? { opacity: 1 } : {}} transition={{ duration: 1 }}>
                {particles.map(({ key, ...rest }) => <AmbientParticle key={key} {...rest} />)}
            </motion.div>

            <div className="container mx-auto px-4 text-center max-w-5xl relative z-10">
                <motion.p initial={{ opacity: 0, y: 20 }} animate={phase >= 1 ? { opacity: 1, y: 0 } : {}} transition={{ duration: 0.7 }} className="text-xl sm:text-2xl md:text-3xl text-slate-500 font-sans font-medium leading-relaxed mb-3">줌 열고, 녹화 누르고, 숙제 올리고, 각각 연락하고...</motion.p>
                <motion.p initial={{ opacity: 0, y: 20 }} animate={phase >= 1 ? { opacity: 1, y: 0 } : {}} transition={{ duration: 0.7, delay: 0.35 }} className="text-xl sm:text-2xl md:text-3xl text-slate-700 font-sans font-semibold mb-8">수업 하나에 도구만 네 개...</motion.p>
                <motion.p initial={{ opacity: 0, filter: "blur(4px)" }} animate={phase >= 1 ? { opacity: 1, filter: "blur(0px)" } : {}} transition={{ duration: 0.8, delay: 0.7 }} className="text-lg sm:text-xl md:text-2xl text-[#22A366] font-sans font-medium italic mb-10">가르치는 일에만 집중할 수 있다면?</motion.p>
                <motion.div initial={{ opacity: 0, y: 10 }} animate={phase >= 1 ? { opacity: 1, y: 0 } : {}} transition={{ duration: 0.5, delay: 1.0 }} className="flex items-center justify-center gap-2 mb-14">
                    <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-green-50 border border-green-200/60 text-sm font-medium text-[#22A366]"><Clock className="w-3.5 h-3.5" />되찾은 수업 시간</div>
                </motion.div>

                <motion.p initial={{ opacity: 0, y: 10 }} animate={phase >= 2 ? { opacity: 1, y: 0 } : {}} transition={{ duration: 0.5 }} className="text-base sm:text-lg text-slate-400 font-medium mb-8 max-w-xl mx-auto">200개 기업 고객사가 ClassIn으로 되찾은 시간</motion.p>
                <div className="relative">
                    <motion.div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[300px] bg-gradient-radial from-green-300/25 via-green-200/10 to-transparent rounded-full pointer-events-none" initial={{ scale: 0, opacity: 0 }} animate={phase >= 2 ? { scale: [0, 1.2, 1], opacity: [0, 0.7, 0] } : {}} transition={{ duration: 1.5 }} />
                    <motion.div className="flex justify-center mb-5" initial={{ scale: 0.9, opacity: 0.3, filter: "blur(8px)" }} animate={phase >= 2 ? { scale: 1, opacity: 1, filter: "blur(0px)" } : {}} transition={{ type: "spring", stiffness: 120, damping: 20 }}>
                        <div className="relative flex items-center gap-1 select-none sm:gap-2.5">
                            <SlotDigit digit={displayDigits[0]} delay={0.2} trigger={phase >= 2} />
                            <span className="text-3xl font-sans font-semibold tabular-nums text-slate-300 sm:text-6xl md:text-8xl">,</span>
                            <SlotDigit digit={displayDigits[1]} delay={0.35} trigger={phase >= 2} />
                            <SlotDigit digit={displayDigits[2]} delay={0.45} trigger={phase >= 2} />
                            <SlotDigit digit={displayDigits[3]} delay={0.55} trigger={phase >= 2} />
                            <span className="text-3xl font-sans font-semibold tabular-nums text-slate-300 sm:text-6xl md:text-8xl">,</span>
                            <SlotDigit digit={displayDigits[4]} delay={0.65} trigger={phase >= 2} />
                            <SlotDigit digit={displayDigits[5]} delay={0.75} trigger={phase >= 2} />
                            <SlotDigit digit={displayDigits[6]} delay={0.85} trigger={phase >= 2} onDone={handleLastSlotDone} />
                            {slotsDone && <div className="absolute inset-0 overflow-hidden pointer-events-none rounded-2xl"><div className="absolute inset-0 animate-shimmer-sweep bg-gradient-to-r from-transparent via-green-400/15 to-transparent w-1/3 h-full" /></div>}
                        </div>
                    </motion.div>
                </div>
                <motion.p initial={{ opacity: 0 }} animate={phase >= 2 ? { opacity: 1 } : {}} transition={{ delay: 0.5 }} className="mb-3 text-2xl font-semibold tracking-tight text-slate-800 sm:text-4xl md:text-5xl">시간</motion.p>
                <motion.p initial={{ opacity: 0, y: 10 }} animate={phase >= 2 ? { opacity: 1, y: 0 } : {}} transition={{ delay: 0.7 }} className="text-sm sm:text-base text-slate-400 font-medium mb-6">지금 이 순간에도 수업이 진행되고 있습니다</motion.p>

                <motion.div className="w-full max-w-sm mx-auto h-px bg-gradient-to-r from-transparent via-green-300/30 to-transparent mb-14 mt-14" initial={{ scaleX: 0 }} animate={phase >= 3 ? { scaleX: 1 } : {}} transition={{ duration: 0.6 }} style={{ originX: 0.5 }} />
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-14 max-w-3xl mx-auto">
                    <StatCard value={200} suffix="+" label="기업 고객사" icon={<Monitor className="w-5 h-5" />} delay={0} trigger={phase >= 3} />
                    <StatCard value={30} suffix="+" label="인터랙티브 수업 도구" icon={<MousePointerClick className="w-5 h-5" />} delay={0.1} trigger={phase >= 3} />
                    <StatCard value={10} suffix="가지" label={"참여형\n수업 활동"} icon={<Layers className="w-5 h-5" />} delay={0.2} trigger={phase >= 3} />
                    <StatCard value={98} suffix="%" label={`"과거로 못 돌아간다"\n응답률`} icon={<Sparkles className="w-5 h-5" />} delay={0.3} trigger={phase >= 3} />
                </div>
                <motion.p initial={{ opacity: 0, letterSpacing: "0.3em" }} animate={phase >= 3 ? { opacity: 1, letterSpacing: "0.05em" } : {}} transition={{ delay: 0.5, duration: 0.8 }} className="text-lg sm:text-xl font-sans text-slate-600 font-medium mb-10">수업만을 위해 만든 플랫폼, 다음은 당신의 교실입니다</motion.p>
                <motion.div initial={{ opacity: 0, y: 20 }} animate={phase >= 3 ? { opacity: 1, y: 0 } : {}} transition={{ delay: 0.7, type: "spring", stiffness: 200, damping: 25 }} className="flex flex-col items-center gap-4">
                    <Button asChild className="h-14 rounded-full bg-[#009060] px-10 text-base font-bold text-white transition-all hover:scale-105 hover:bg-[#007A52] group">
                        <Link href={CHECKOUT_HREF} onClick={() => trackCheckoutClick("sw_story_checkout")}>{CHECKOUT_CTA_LABEL}<ArrowRight className="w-4 h-4 ml-2 group-hover:translate-x-1 transition-transform" /></Link>
                    </Button>
                    <p className="text-xs sm:text-sm text-slate-400 font-medium">{CHECKOUT_SUB_LABEL}</p>
                </motion.div>
            </div>
        </section>
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
        quote: "ClassIn 이전에도 여러 화상 툴을 써봤습니다. 하지만 영업 데모를 할 때 학생과 교사 모두 ClassIn에 가장 빠르게 반응했어요.",
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
                <motion.div className="mb-16" initial={{ opacity: 0, y: 30 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}>
                    <p className="text-sm font-semibold text-[#6EE7B7]/60 tracking-wider uppercase mb-3">Customer Stories</p>
                    <h2 className="text-3xl md:text-5xl font-sans text-white leading-tight">
                        그들은 이미<br /><span className="text-[#6EE7B7]">바꿨습니다</span>
                    </h2>
                </motion.div>

                <div className="space-y-6">
                    {CINEMATIC_CASES.map((c, i) => (
                        <motion.div
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
                        </motion.div>
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
                        <motion.p
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
                        </motion.p>
                    ))}
                </div>

                <motion.div
                    initial={{ opacity: 0, scaleX: 0 }}
                    whileInView={{ opacity: 1, scaleX: 1 }}
                    viewport={{ once: true }}
                    transition={{ delay: 0.6, duration: 0.6, ease: "easeOut" }}
                    style={{ originX: 0 }}
                    className="w-16 h-[2px] bg-[#22A366] mb-10"
                />

                <motion.div
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
                </motion.div>
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
                    <motion.div initial={{ opacity: 0, x: -30 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true }} transition={{ duration: 0.8 }}>
                        <p className="text-[#6EE7B7]/60 text-sm font-semibold tracking-wider uppercase mb-6">The Future of Education</p>
                        <h2 className="text-4xl md:text-5xl lg:text-6xl font-sans font-bold text-white leading-[1.1] tracking-tight mb-6">
                            2030년의<br />교실은 <span className="text-[#6EE7B7]">달라집니다</span>
                        </h2>
                        <p className="text-lg text-white/50 leading-relaxed">
                            학교의 물리적 벽이 사라지고, AI가 개인 맞춤 교육을 제공하며,
                            세계 어느 곳의 학생도 최고의 교사에게 배울 수 있는 시대.
                            ClassIn은 그 미래를 지금 만들고 있습니다.
                        </p>
                    </motion.div>

                    <div className="grid grid-cols-2 gap-4">
                        {FUTURE_ITEMS.map((item, i) => (
                            <motion.div
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
                            </motion.div>
                        ))}
                    </div>
                </div>
            </div>
        </section>
    )
}

/* ── 미래 제시 2 (퀄리티 3배, 리소스 1/3) ─────────────────── */
function FutureVision2Section() {
    const metricsRef = useRef<HTMLDivElement>(null)
    const inView = useInView(metricsRef, { once: true, margin: "-80px" })

    const q = useCountUp(3, inView, 1.5)
    const r = useCountUp(67, inView, 1.5)

    return (
        <section className="py-24 md:py-40 bg-[#FDFCF8] overflow-hidden">
            <div className="container mx-auto px-4 lg:px-8 max-w-6xl">

                {/* 헤드라인 */}
                <motion.div
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
                        <br className="hidden md:block" />
                        그것이 ClassIn이 교사에게 드리는 약속입니다.
                    </p>
                </motion.div>

                {/* 핵심 수치 */}
                <div ref={metricsRef} className="grid md:grid-cols-2 gap-6 mb-20 max-w-3xl mx-auto">
                    <motion.div
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
                    </motion.div>
                    <motion.div
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
                    </motion.div>
                </div>

                {/* 진정성 텍스트 */}
                <motion.div
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
                        ClassIn은 도구가 아닙니다.<br />
                        <span className="text-[#1a1a19] font-bold">교육이 다시 교육다워지는 환경</span>입니다.
                    </p>
                </motion.div>
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
                <motion.div className="text-center mb-14" {...fadeUp}>
                    <EyebrowTag>LEARNING CYCLE</EyebrowTag>
                    <h2 className="text-3xl md:text-4xl lg:text-5xl font-sans text-[#1a1a19] leading-tight">
                        수업의 처음부터 끝까지,<br /><span className="text-[#22A366]">하나로 연결</span>
                    </h2>
                    <p className="text-lg text-slate-400 mt-4 max-w-xl mx-auto">
                        수업 전 준비 → 수업 중 운영 → 수업 후 관리. 세 단계가 끊기지 않고 이어집니다.
                    </p>
                </motion.div>

                <div className="grid lg:grid-cols-3 gap-6">
                    {CYCLE_PHASES.map((p, i) => (
                        <motion.div
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
                                <p className="text-[11px] font-bold tracking-wider uppercase mb-2" style={{ color: p.accent }}>ClassIn</p>
                                {p.now.map((item) => (
                                    <div key={item} className="flex items-start gap-2 text-sm font-medium text-slate-700">
                                        <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" style={{ color: p.accent }} />
                                        <span>{item}</span>
                                    </div>
                                ))}
                            </div>
                        </motion.div>
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
                    <motion.div initial={{ opacity: 0, x: -30 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true }} transition={{ duration: 0.7 }}>
                        <span className="inline-flex items-center gap-2 bg-[#6EE7B7]/10 text-[#6EE7B7] text-xs font-bold px-3 py-1.5 rounded-full mb-6">
                            ClassIn X · 하드웨어
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
                    </motion.div>

                    {/* Hardware visual */}
                    <motion.div initial={{ opacity: 0, x: 30 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true }} transition={{ duration: 0.7, delay: 0.1 }}>
                        <div className="text-center">
                            <div className="relative aspect-video w-full overflow-hidden rounded-2xl border border-white/10 bg-white/5 shadow-[0_24px_70px_rgba(0,0,0,0.28)]">
                                <Image
                                    src="/images/smartroon.png"
                                    alt="ClassIn 소프트웨어와 연동되는 스마트 교실 구성"
                                    fill
                                    className="object-cover"
                                    sizes="(min-width: 1024px) 44vw, 100vw"
                                />
                                <div className="absolute inset-0 bg-gradient-to-t from-[#1a1a19]/28 via-transparent to-white/8" />
                            </div>
                            <p className="mt-4 text-white/30 text-xs">ClassIn X · 스마트 교실 구성</p>
                        </div>
                    </motion.div>
                </div>
            </div>
        </section>
    )
}

/* ── [C] AI 기능 섹션 ────────────────────────────────────────── */
const AI_FEATURES = [
    { icon: "✍️", title: "AI 첨삭", desc: "학생 제출 과제를 AI가 즉시 분석·채점. 교사의 채점 시간을 획기적으로 줄입니다." },
    { icon: "📝", title: "AI 과제 생성", desc: "학습 수준과 목표에 맞는 맞춤형 과제를 자동으로 만들어줍니다." },
    { icon: "✏️", title: "AI 작문 도우미", desc: "작문 주제와 조건을 입력하면 수준별 예시 답안과 첨삭 가이드를 제공합니다." },
    { icon: "🔢", title: "AI 수식 풀이", desc: "수학·과학 문제의 정답과 풀이 과정을 AI가 즉시 생성합니다." },
    { icon: "📄", title: "AI 문서 정리", desc: "수업 자료 자동 요약, 보고서 작성, 학습 노트 정리를 AI가 처리합니다." },
    { icon: "🎨", title: "AI 이미지 생성", desc: "아이디어를 입력하면 수업에 필요한 시각 자료를 자동으로 생성합니다." },
    { icon: "📚", title: "AI 교안 자동화", desc: "학습 목표를 입력하면 전체 수업 계획안을 자동으로 작성해줍니다." },
    { icon: "💬", title: "AI 질의응답", desc: "과목·언어 관계없이 학생 질문에 24시간 즉시 답변. 자기주도 학습을 지원합니다." },
]

function AIFeaturesSection() {
    return (
        <section className="py-24 md:py-32 bg-[#F6F5F4]">
            <div className="container mx-auto px-4 lg:px-8 max-w-6xl">
                <motion.div className="text-center mb-14" {...fadeUp}>
                    <span className="inline-flex items-center gap-1.5 bg-[#084734] text-[#6EE7B7] text-xs font-bold px-3 py-1.5 rounded-full mb-5">
                        ✦ AI-Powered
                    </span>
                    <h2 className="text-3xl md:text-4xl lg:text-5xl font-sans text-[#1a1a19] leading-tight mb-4">
                        AI가 교사의 시간을<br /><span className="text-[#084734]">돌려드립니다</span>
                    </h2>
                    <p className="text-lg text-slate-500 max-w-xl mx-auto">
                        채점, 교안 작성, 자료 정리 — 반복적인 작업은 AI에게 맡기고
                        교사는 가르치는 일에만 집중할 수 있습니다.
                    </p>
                </motion.div>

                <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
                    {AI_FEATURES.map((f, i) => (
                        <motion.div
                            key={f.title}
                            initial={{ opacity: 0, y: 20 }}
                            whileInView={{ opacity: 1, y: 0 }}
                            viewport={{ once: true }}
                            transition={{ delay: i * 0.07 }}
                            className="bg-white rounded-2xl border border-[rgba(0,0,0,0.06)] p-6 hover:shadow-[0_8px_24px_rgba(34,163,102,0.09)] hover:border-[rgba(34,163,102,0.2)] hover:-translate-y-0.5 transition-all group relative overflow-hidden"
                        >
                            <div className="absolute top-0 left-0 w-full h-[2px] bg-gradient-to-r from-[#22A366]/0 via-[#22A366]/20 to-[#22A366]/0 opacity-0 group-hover:opacity-100 transition-opacity" />
                            <div className="w-9 h-9 rounded-lg bg-[#ECFDF5] border border-[rgba(34,163,102,0.15)] flex items-center justify-center mb-4 text-lg">{f.icon}</div>
                            <h3 className="text-sm font-bold text-[#111110] mb-1.5 tracking-tight">{f.title}</h3>
                            <p className="text-xs text-[#615D59] leading-relaxed">{f.desc}</p>
                        </motion.div>
                    ))}
                </div>

                <motion.div
                    initial={{ opacity: 0 }}
                    whileInView={{ opacity: 1 }}
                    viewport={{ once: true }}
                    transition={{ delay: 0.5 }}
                    className="mt-10 bg-[#084734] rounded-2xl p-6 flex flex-col sm:flex-row items-center justify-between gap-4 text-white"
                >
                    <div>
                        <p className="font-bold text-base mb-0.5">AI 기능 모두 기본 포함</p>
                        <p className="text-white/50 text-sm">별도 AI 툴 구독 없이 ClassIn 하나로 사용 가능합니다.</p>
                    </div>
                    <Link
                        href="/contact"
                        onClick={() => trackEvent("click_cta", { button: "sw_ai_freetrial", page: "/product/sw" })}
                        className="shrink-0 inline-flex items-center gap-2 bg-white text-[#084734] font-bold text-sm px-5 py-2.5 rounded-full hover:bg-white/90 transition-colors"
                    >
                        무료 체험 시작 <ArrowRight className="w-4 h-4" />
                    </Link>
                </motion.div>
            </div>
        </section>
    )
}

/* ── [D] 도입 프로세스 섹션 → components/product/sw/OnboardingRoadmap.tsx 로 추출됨 ──────────── */

/* ── [E] FAQ 섹션 ────────────────────────────────────────────── */
const FAQS = [
    {
        q: "Zoom과 비교해서 실제로 어떻게 다른가요?",
        a: "Zoom은 비즈니스 회의를 위해 설계됐습니다. 학생이 화면 안에서 직접 참여(판서, 문제 풀기, 퀴즈 대결)하는 기능이 없습니다. ClassIn은 수업 전용으로 설계돼 30가지 교육 도구, LMS, 자동 녹화까지 하나로 통합되어 있습니다.",
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
        a: "자체 네트워크 최적화 기술로 일반 화상 회의보다 낮은 대역폭에서도 안정적으로 작동합니다. 글로벌 CDN을 통해 전 세계 어디서든 100ms 이하의 지연 시간을 보장합니다.",
    },
    {
        q: "수업 녹화본의 저작권은 누가 갖나요?",
        a: "수업 녹화본의 저작권은 해당 기관과 강사에게 있습니다. ClassIn은 앱 내 재생만 허용하고 외부 다운로드를 차단하며, 재생 시 워터마크를 제공해 무단 배포를 막습니다.",
    },
    {
        q: "요금제는 어떻게 구성되나요?",
        a: "학원 규모, 수강생 수, 필요 기능에 따라 맞춤 요금제를 제공합니다. 소규모 학원부터 대형 교육 그룹까지 적합한 플랜이 있으며, 2주 무료 체험 후 결정하실 수 있습니다.",
    },
]

function FAQSection() {
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
                            className="bg-white rounded-xl border border-[rgba(0,0,0,0.06)] overflow-hidden shadow-[0_1px_4px_rgba(0,0,0,0.04)] hover:border-[rgba(34,163,102,0.15)] transition-colors"
                        >
                            <button
                                onClick={() => setOpenItems((items) => items.includes(i) ? items.filter((item) => item !== i) : [...items, i])}
                                className="w-full flex items-center justify-between gap-5 px-8 py-6 text-left md:px-10 lg:px-12"
                            >
                                <span className="text-base font-semibold text-slate-800 leading-snug md:text-lg">{faq.q}</span>
                                <motion.span
                                    animate={{ rotate: openItems.includes(i) ? 45 : 0 }}
                                    transition={{ duration: 0.2 }}
                                    className="w-7 h-7 rounded-full border border-[rgba(34,163,102,0.2)] text-[#22A366] text-base font-bold shrink-0 leading-none flex items-center justify-center bg-[#ECFDF5]/50"
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
                                <p className="px-8 pb-6 text-base text-slate-500 leading-relaxed border-t border-slate-50 pt-5 md:px-10 lg:px-12">
                                    {faq.a}
                                </p>
                            </motion.div>
                        </motion.div>
                    ))}
                </div>
            </div>
        </section>
    )
}

/* ── ① 텍스트 임팩트 섹션 ────────────────────────────────────── */
function ImpactTextSection() {
    return (
        <section className="py-24 md:py-36 bg-[#FDFCF8]">
            <div className="container mx-auto px-4 max-w-3xl">
                <motion.div
                    initial={{ opacity: 0, y: 30 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    transition={{ duration: 0.7 }}
                    className="space-y-6"
                >
                    <p className="text-sm font-semibold text-slate-400 tracking-widest uppercase">Before ClassIn</p>
                    <div className="space-y-4 text-2xl sm:text-3xl md:text-4xl font-sans text-slate-700 leading-snug">
                        <p>화면을 켜놓고 딴짓하는 학생.</p>
                        <p>녹화 파일을 공유하느라 허비하는 10분.</p>
                        <p className="text-slate-400">숙제는 카톡으로, 출결은 엑셀로,</p>
                        <p className="text-slate-400">성적은 또 다른 스프레드시트로.</p>
                    </div>
                    <motion.p
                        initial={{ opacity: 0 }}
                        whileInView={{ opacity: 1 }}
                        viewport={{ once: true }}
                        transition={{ delay: 0.4, duration: 0.7 }}
                        className="text-xl sm:text-2xl md:text-3xl font-sans text-slate-900 pt-4 border-t border-slate-100"
                    >
                        수업은 했는데,{" "}
                        <span className="text-[#22A366] font-bold">교육은 안 된 하루.</span>
                    </motion.p>
                    <motion.p
                        initial={{ opacity: 0, y: 10 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true }}
                        transition={{ delay: 0.7, duration: 0.6 }}
                        className="text-base sm:text-lg text-slate-500 leading-relaxed max-w-xl pt-2"
                    >
                        회의용 도구는 회의를 위해 만들어졌습니다.
                        교육은 그것과 다른 무언가가 필요합니다.
                        학생이 화면 안에서 <em className="not-italic font-semibold text-slate-700">직접 참여</em>할 수 있어야 합니다.
                    </motion.p>
                </motion.div>
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
                <motion.div
                    initial={{ opacity: 0, y: 40 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    transition={{ duration: 0.9 }}
                >
                    <div className="text-[#6EE7B7]/60 text-5xl font-sans mb-8 leading-none select-none">&ldquo;</div>
                    <blockquote className="text-2xl sm:text-3xl md:text-4xl font-sans text-white leading-[1.4] tracking-tight mb-10">
                        하이브리드 수업은 팬데믹의 임시방편이 아닙니다.
                        <br className="hidden md:block" />
                        <span className="text-[#6EE7B7]">교육의 새로운 표준</span>이 될 것입니다.
                    </blockquote>
                    <div className="flex flex-col items-center gap-1">
                        <div className="w-8 h-px bg-[#6EE7B7]/40 mb-3" />
                        <p className="text-[#6EE7B7]/70 text-sm font-semibold tracking-wider">왕보 (王博)</p>
                        <p className="text-white/40 text-sm">북경대학교 부총장 · ClassIn 글로벌 파트너</p>
                    </div>
                </motion.div>

                <motion.div
                    initial={{ opacity: 0 }}
                    whileInView={{ opacity: 1 }}
                    viewport={{ once: true }}
                    transition={{ delay: 0.5, duration: 0.7 }}
                    className="mx-auto mt-14 grid max-w-2xl grid-cols-1 gap-5 border-t border-white/10 pt-10 sm:mt-16 sm:grid-cols-3 sm:gap-8 sm:pt-12"
                >
                    {[
                        { value: "287개", label: "하이브리드 수업 (2021 가을학기 단 한 학기)" },
                        { value: "160+", label: "협력 국가" },
                        { value: "8만+", label: "글로벌 파트너 기관" },
                    ].map((s) => (
                        <div key={s.label} className="text-center">
                            <div className="text-2xl sm:text-3xl font-sans font-bold tabular-nums text-white mb-1">{s.value}</div>
                            <div className="text-xs text-white/40 leading-relaxed">{s.label}</div>
                        </div>
                    ))}
                </motion.div>
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
        body: "오프라인 수업만 하던 입시학원이 ClassIn의 하이브리드 강의를 도입한 뒤, 부천 외 지역 학생 유치가 가능해졌습니다. 학생이 화면에서 직접 판서하며 풀이하는 방식으로 집중도가 올라갔고, TeacherIn으로 저장한 수업 콘티 덕분에 신규 강사 온보딩 시간도 크게 단축됐습니다.",
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
        body: "필리핀 튜터와 전 세계 학습자를 연결하는 ESL 플랫폼 Acadsoc는 2017년 ClassIn을 도입한 이후 Series A → C까지 투자를 유치했습니다. 현재도 영업팀과 강사진이 고객 데모에 ClassIn을 1순위로 사용할 만큼 수업 경험의 품질이 검증됐습니다.",
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
        body: "과거에는 지점마다 수업 품질이 달랐습니다. ClassIn 도입 후 전국 모든 수업 데이터가 실시간으로 본사에 집계됩니다. 어떤 강사가 어떤 수업을 어떻게 진행했는지 모니터링이 가능해지면서 교육 품질 편차가 현저히 줄었습니다.",
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
                <motion.div className="text-center mb-16" {...fadeUp}>
                    <EyebrowTag>CASE STUDY</EyebrowTag>
                    <h2 className="text-3xl md:text-4xl lg:text-5xl font-sans text-[#1a1a19] leading-tight">
                        실제 교육 현장의 <span className="text-[#22A366]">변화</span>
                    </h2>
                    <p className="text-lg text-slate-400 mt-4 max-w-xl mx-auto">도입 후 실제로 달라진 것들을 현장의 언어로 전달합니다.</p>
                </motion.div>

                <div className="grid lg:grid-cols-3 gap-6">
                    {CASES.map((c, i) => (
                        <motion.div
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
                        </motion.div>
                    ))}
                </div>
            </div>
        </section>
    )
}

/* ── ④ 가격 가치 제안 섹션 ───────────────────────────────────── */
const INCLUDED = [
    "양방향 블랙보드 · 50페이지 판서 공간",
    "30가지 인터랙티브 수업 도구",
    "10가지 참여형 수업 활동",
    "수업 자동 녹화 · 클라우드 저장",
    "LMS (숙제 · 출결 · 성적 · 평가)",
    "학습 데이터 리포트 및 분석",
    "1:1부터 최대 1,000명 대형 강의까지",
    "12개 언어 지원 · 160개국 서비스",
    "AI 첨삭 · AI 과제 생성 · AI 교안",
    "전담 고객 지원 · 전문가 온보딩",
]

function PricingValueSection() {
    return (
        <section className="py-24 md:py-32 bg-white">
            <div className="container mx-auto px-4 lg:px-8 max-w-5xl">
                <motion.div className="text-center mb-14" {...fadeUp}>
                    <EyebrowTag>PRICING VALUE</EyebrowTag>
                    <h2 className="text-3xl md:text-4xl lg:text-5xl font-sans text-[#1a1a19] leading-tight mb-4">
                        이 가격에,{" "}
                        <span className="text-[#22A366]">이 모든 것을</span>
                    </h2>
                    <p className="text-lg text-slate-500 max-w-xl mx-auto">
                        LMS 따로, 화상 도구 따로, 녹화 툴 따로 — 세 가지를 각각 쓰면
                        월 수십만 원이 넘습니다. ClassIn은 하나로 전부 해결합니다.
                    </p>
                </motion.div>

                <div className="grid lg:grid-cols-[2fr_3fr] gap-10">
                    {/* Included list */}
                    <motion.div
                        initial={{ opacity: 0, x: -20 }}
                        whileInView={{ opacity: 1, x: 0 }}
                        viewport={{ once: true }}
                        transition={{ duration: 0.6 }}
                        className="bg-[#FDFCF8] rounded-2xl border border-slate-100 p-8"
                    >
                        <p className="text-xs font-bold text-slate-400 tracking-wider uppercase mb-5">구독 하나로 포함되는 것들</p>
                        <ul className="space-y-3">
                            {INCLUDED.map((item, i) => (
                                <motion.li
                                    key={item}
                                    initial={{ opacity: 0, x: -10 }}
                                    whileInView={{ opacity: 1, x: 0 }}
                                    viewport={{ once: true }}
                                    transition={{ delay: i * 0.04 }}
                                    className="flex items-start gap-3 text-sm text-slate-700"
                                >
                                    <div className="w-4 h-4 rounded-full bg-[#ECFDF5] border border-[rgba(34,163,102,0.25)] flex items-center justify-center shrink-0 mt-0.5">
                                        <div className="w-1.5 h-1.5 rounded-full bg-[#22A366]" />
                                    </div>
                                    {item}
                                </motion.li>
                            ))}
                        </ul>
                    </motion.div>

                    {/* Value framing */}
                    <motion.div
                        initial={{ opacity: 0, x: 20 }}
                        whileInView={{ opacity: 1, x: 0 }}
                        viewport={{ once: true }}
                        transition={{ duration: 0.6, delay: 0.1 }}
                        className="space-y-5"
                    >
                        {[
                            { label: "일반 화상 도구", note: "Zoom · Teams 등", scope: "화상 수업만", line: true },
                            { label: "+ LMS 별도 구독", note: "Canvas · Classting Pro 등", scope: "출결 · 과제 · 평가만", line: true },
                            { label: "+ 녹화 · 클라우드 스토리지", note: "별도 저장소 + 관리", scope: "영상 보관만", line: true },
                            { label: "+ AI 기능 별도 구독", note: "ChatGPT Team · AI 첨삭 도구 등", scope: "AI 도구만", line: true },
                            { label: "ClassIn 하나로", note: "도구마다 다른 계약 · 다른 로그인 없이", scope: "전부 한 번에", line: false, highlight: true },
                        ].map((row) => (
                            <div key={row.label} className={`flex items-center justify-between ${row.line ? "pb-4 border-b border-slate-100" : ""} ${row.highlight ? "bg-[#F0FDF9] border border-[#22A366]/15 rounded-2xl px-6 py-6 -mx-4 mt-2" : ""}`}>
                                <div>
                                    <p className={`font-bold ${row.highlight ? "text-xl text-[#22A366]" : "text-sm font-semibold text-slate-700"}`}>{row.label}</p>
                                    <p className={`${row.highlight ? "text-sm text-slate-500" : "text-xs text-slate-400"}`}>{row.note}</p>
                                </div>
                                <p className={`font-bold ${row.highlight ? "text-lg text-[#22A366]" : "text-xs text-slate-500"}`}>{row.scope}</p>
                            </div>
                        ))}
                    </motion.div>
                </div>

                {/* Full-width pricing callout */}
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    transition={{ duration: 0.6, delay: 0.2 }}
                    className="bg-[#1a1a19] text-white rounded-2xl px-6 md:px-10 py-6 md:py-7 mt-10"
                >
                    <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6 lg:gap-10">
                        {/* Heading */}
                        <div className="text-center lg:text-left lg:shrink-0">
                            <p className="text-slate-300 text-sm font-bold uppercase tracking-[0.18em] mb-1.5">ClassIn 하나로</p>
                            <p className="font-sans font-bold text-white leading-tight">
                                <span className="text-2xl md:text-3xl">이 모든 기능</span>
                                <span className="text-sm md:text-base font-medium text-slate-300 ml-2 align-middle">+ AI 기능까지</span>
                            </p>
                        </div>

                        {/* Tier prices + note */}
                        <div className="flex flex-col items-center gap-2 lg:flex-1">
                            <div className="flex items-center gap-5 sm:gap-7">
                                <div className="text-center">
                                    <p className="text-[11px] text-slate-400 uppercase tracking-[0.16em] mb-1">Standard</p>
                                    <p className="text-lg font-sans font-bold tabular-nums text-white whitespace-nowrap">
                                        $99<span className="text-xs text-slate-300 font-medium ml-0.5">/계정/월</span>
                                    </p>
                                </div>
                                <div className="w-px h-10 bg-white/10" />
                                <div className="text-center">
                                    <p className="text-[11px] text-slate-400 uppercase tracking-[0.16em] mb-1">Plus</p>
                                    <p className="text-lg font-sans font-bold tabular-nums text-white whitespace-nowrap">
                                        $199<span className="text-xs text-slate-300 font-medium ml-0.5">/계정/월</span>
                                    </p>
                                </div>
                                <div className="w-px h-10 bg-white/10" />
                                <div className="text-center">
                                    <p className="text-[11px] text-slate-400 uppercase tracking-[0.16em] mb-1">Enterprise</p>
                                    <p className="text-lg font-bold text-white whitespace-nowrap">맞춤 견적</p>
                                </div>
                            </div>
                            <p className="text-[#22A366] text-xs font-medium">연 결제 시 약 2개월 절감</p>
                        </div>

                        {/* CTAs */}
                        <div className="flex flex-col sm:flex-row gap-2 justify-center lg:justify-end lg:shrink-0">
                            <Link
                                href={CHECKOUT_HREF}
                                onClick={() => trackCheckoutClick("sw_pricing_checkout")}
                                className="inline-flex items-center justify-center gap-2 rounded-full bg-[#009060] px-5 py-2.5 text-sm font-bold text-white transition-all hover:scale-105 hover:bg-[#007A52] whitespace-nowrap"
                            >
                                {CHECKOUT_CTA_LABEL} <ArrowRight className="w-4 h-4" />
                            </Link>
                            <Link
                                href="/contact#contact-form"
                                onClick={() => trackEvent("click_cta", { button: "sw_pricing_consultation", page: "/product/sw" })}
                                className="inline-flex items-center justify-center gap-2 rounded-full border border-white/20 bg-white/[0.04] px-5 py-2.5 text-sm font-bold text-white transition-all hover:bg-white/[0.08] whitespace-nowrap"
                            >
                                도입 상담
                            </Link>
                        </div>
                    </div>
                </motion.div>
            </div>
        </section>
    )
}

/* ══════════════════════════════════════════════════════════════════
   MAIN PAGE
══════════════════════════════════════════════════════════════════ */
export default function ProductPage() {
    const heroMetricRef = useRef(null)
    const heroMetricInView = useInView(heroMetricRef, { once: true })
    const networkRef = useRef(null)
    const networkInView = useInView(networkRef, { once: true })

    const metric30 = useCountUp(30, heroMetricInView)
    const metric10 = useCountUp(10, heroMetricInView)
    const metric150 = useCountUp(150, heroMetricInView)
    const metric2400 = useCountUp(2400, heroMetricInView)

    const net150 = useCountUp(150, networkInView)
    const net99 = useCountUp(99, networkInView)

    return (
        <div className="bg-[#FDFCF8] min-h-screen text-slate-900 font-sans selection:bg-green-200 pt-20">

            {/* ================================================================
                HERO — "수업을, 더 수업답게"
            ================================================================ */}
            <section className="relative min-h-[720px] overflow-hidden bg-[#07110d] text-white sm:min-h-[700px] md:h-[calc(100svh-4rem)] md:min-h-[760px] md:max-h-[840px]">
                <video
                    className="absolute inset-0 h-full w-full object-cover"
                    src={HERO_CLASSROOM_VIDEO_SRC}
                    autoPlay
                    muted
                    loop
                    playsInline
                    preload="metadata"
                    aria-hidden="true"
                />
                <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(3,10,8,0.70)_0%,rgba(3,10,8,0.42)_42%,rgba(3,10,8,0.78)_100%)] pointer-events-none" />
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(3,10,8,0.10)_0%,rgba(3,10,8,0.50)_78%)] pointer-events-none" />

                <div className="container relative z-10 mx-auto flex min-h-[720px] items-center px-4 py-14 sm:min-h-[700px] lg:px-8 md:h-full md:min-h-0 md:py-20">
                    <div className="max-w-4xl mx-auto text-center">
                        <motion.div initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7 }}>
                            <div className="inline-flex items-center gap-2.5 px-5 py-2 rounded-full bg-white/12 border border-white/18 shadow-[0_2px_18px_rgba(0,0,0,0.18)] text-[#6EE7B7] text-xs font-bold mb-8 tracking-widest uppercase backdrop-blur-sm">
                                <span className="w-1.5 h-1.5 rounded-full bg-[#22A366] animate-pulse"></span>
                                교육 전용 플랫폼
                            </div>

                            <h1 className="text-4xl sm:text-5xl lg:text-6xl xl:text-7xl font-sans font-bold leading-[1.1] mb-8 text-white drop-shadow-[0_3px_20px_rgba(0,0,0,0.35)]">
                                수업을, 더{" "}
                                <span className="text-[#6EE7B7]">수업답게</span>
                            </h1>

                            <p className="text-xl md:text-2xl text-white/78 leading-relaxed font-medium max-w-2xl mx-auto mb-8 drop-shadow-[0_2px_14px_rgba(0,0,0,0.35)]">
                                30여 가지 수업 도구와 10가지 수업 활동으로
                                <br className="hidden md:block" />
                                교사와 학생이 함께 만들어가는 교육 전용 플랫폼.
                            </p>

                            {/* Animated hero metrics */}
                            <div ref={heroMetricRef} className="flex flex-wrap justify-center gap-6 md:gap-12 mb-12">
                                {[
                                    { value: metric30, suffix: "+", label: "수업 도구" },
                                    { value: metric10, suffix: "+", label: "수업 활동" },
                                    { value: metric150, suffix: "+", label: "지원 국가" },
                                    { value: metric2400.toLocaleString(), suffix: "+", label: "도입 학원", raw: true },
                                ].map((m, i) => (
                                    <motion.div key={i} initial={{ opacity: 0, y: 15 }} animate={heroMetricInView ? { opacity: 1, y: 0 } : {}} transition={{ delay: i * 0.1 + 0.3 }} className="min-w-[84px] text-center">
                                        <div className="text-2xl md:text-3xl font-sans font-bold tabular-nums text-[#6EE7B7] drop-shadow-[0_2px_12px_rgba(0,0,0,0.35)]">
                                            {m.raw ? m.value : m.value}{m.suffix}
                                        </div>
                                        <div className="text-[11px] md:text-xs text-white/62 mt-0.5 font-semibold">{m.label}</div>
                                    </motion.div>
                                ))}
                            </div>

                            <div className="flex flex-col items-stretch justify-center gap-3 sm:flex-row sm:items-center sm:gap-4">
                                <Button asChild className="h-[3.25rem] rounded-full bg-[#009060] px-7 text-base font-bold text-white shadow-[0_8px_20px_rgba(0,144,96,0.24)] transition-all hover:scale-105 hover:bg-[#007A52] hover:shadow-[0_12px_25px_rgba(0,144,96,0.32)] group sm:h-14 sm:px-8">
                                    <Link
                                        href={CHECKOUT_HREF}
                                        onClick={() => trackCheckoutClick("sw_final_checkout")}
                                    >
                                    {CHECKOUT_CTA_LABEL}
                                    <ArrowRight className="w-4 h-4 ml-2 group-hover:translate-x-1 transition-transform" />
                                    </Link>
                                </Button>
                                <Button asChild variant="outline" className="h-[3.25rem] rounded-full border-white/35 bg-white/8 px-7 text-base font-bold text-white backdrop-blur-sm transition-all hover:scale-105 hover:border-white/55 hover:bg-white/16 sm:h-14 sm:px-8">
                                    <a
                                        href={BROCHURE_URL}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        onClick={() => trackEvent("download_materials", { asset_id: "sw_brochure", page: "/product/sw" })}
                                    >
                                    <Play className="w-4 h-4 mr-2" />
                                    서비스 소개서 보기
                                    </a>
                                </Button>
                            </div>
                        </motion.div>
                    </div>
                </div>
            </section>

            <ImpactTextSection />

            <WaveDivider color="#ffffff" />

            {/* ================================================================
                COMPARISON — Zoom vs ClassIn (staggered rows, visual contrast)
            ================================================================ */}
            <section className="py-16 md:py-24 bg-white">
                <div className="container mx-auto px-4 lg:px-8">
                    <motion.div className="text-center mb-16" {...fadeUp}>
                        <EyebrowTag>WHY CLASSIN</EyebrowTag>
                        <h2 className="text-3xl md:text-4xl lg:text-5xl font-sans text-[#1a1a19] leading-tight">
                            회의용 도구로 수업하던 시대는
                            <br className="hidden sm:block" />
                            <span className="text-[#22A366]">끝났습니다</span>
                        </h2>
                    </motion.div>

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
                                                    ClassIn
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
                                            <motion.tr
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
                                            </motion.tr>
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
                            <motion.div {...fadeUp}>
                                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#22A366]/5 text-[#22A366] text-sm font-bold mb-6">
                                    <PenTool className="w-4 h-4" />양방향 블랙보드
                                </div>
                                <h2 className="text-3xl md:text-5xl font-sans text-[#1a1a19] mb-6 leading-tight">
                                    교사만 쓰는 칠판은<br /><span className="text-[#22A366]">칠판이 아닙니다</span>
                                </h2>
                                <p className="text-lg text-slate-500 leading-relaxed font-medium mb-10">교사의 판서를 보기만 하던 시대는 끝났습니다. 학생에게 권한을 주어 직접 문제를 풀고, 그림을 그리고, 아이디어를 표현하게 하세요.</p>
                            </motion.div>
                            <div className="space-y-5">
                                {[
                                    { icon: <Users className="w-5 h-5" />, label: "학생 동시 판서", detail: "여러 학생이 동시에 같은 화면에서 필기합니다. 그룹 토론과 협업이 자연스럽게." },
                                    { icon: <Layers className="w-5 h-5" />, label: "레이어 기반 교구", detail: "단순 그리기가 아닌, 레이어·도형·수식 편집기를 갖춘 전문 교육 도구." },
                                    { icon: <BookOpen className="w-5 h-5" />, label: "교재 위에 직접 풀기", detail: "PDF, PPT 교재를 올리고 그 위에 바로 필기. 종이 프린트가 필요 없습니다." },
                                ].map((f, i) => (
                                    <motion.div key={i} {...stagger(i)} className="flex items-center gap-4 bg-white border border-[rgba(0,0,0,0.06)] rounded-xl p-4 shadow-[0_1px_4px_rgba(0,0,0,0.04)] hover:shadow-[0_4px_18px_rgba(0,0,0,0.07)] hover:border-[rgba(34,163,102,0.18)] transition-all group">
                                        <div className="w-11 h-11 rounded-xl bg-[#ECFDF5] border border-[rgba(34,163,102,0.15)] text-[#22A366] flex items-center justify-center shrink-0">{f.icon}</div>
                                        <div className="flex-1 min-w-0"><h4 className="font-bold text-slate-900 mb-0.5 text-sm">{f.label}</h4><p className="text-xs text-slate-500 leading-relaxed">{f.detail}</p></div>
                                        <ArrowRight className="w-4 h-4 text-slate-200 group-hover:text-[#22A366]/40 shrink-0 transition-colors" />
                                    </motion.div>
                                ))}
                            </div>
                        </div>

                        {/* Blackboard classroom video */}
                        <div className="flex-1 w-full max-w-lg">
                            <motion.div {...fadeUp} className="relative">
                                <div className="relative aspect-[3/2] overflow-hidden rounded-3xl border border-slate-200/80 bg-white shadow-[0_24px_60px_rgba(15,23,42,0.14)]">
                                    <video
                                        className="absolute inset-0 h-full w-full object-cover"
                                        src={BLACKBOARD_VIDEO_SRC}
                                        autoPlay
                                        muted
                                        loop
                                        playsInline
                                        preload="metadata"
                                        aria-label="교사와 학생이 함께 참여하는 ClassIn 양방향 블랙보드 수업 장면"
                                    />
                                    <div className="absolute inset-0 bg-gradient-to-t from-[#084734]/18 via-transparent to-white/12" />
                                    <div className="absolute left-5 top-5 rounded-full border border-white/70 bg-white/88 px-3 py-1.5 text-xs font-semibold text-[#084734] shadow-[0_10px_30px_rgba(15,23,42,0.08)] backdrop-blur-sm">
                                        실제 수업 화면
                                    </div>
                                </div>
                                <motion.div initial={{ opacity: 0, scale: 0.8 }} whileInView={{ opacity: 1, scale: 1 }} viewport={{ once: true }} transition={{ delay: 0.5, type: "spring" }} className="absolute -bottom-4 -left-4 rounded-2xl border border-slate-100 bg-white px-4 py-3 shadow-[0_16px_40px_rgba(15,23,42,0.12)]">
                                    <div className="text-xs font-medium text-slate-400 mb-1">양방향 수업</div>
                                    <div className="text-lg font-bold text-[#22A366]">학생도 화면 위에서 함께 풉니다</div>
                                </motion.div>
                            </motion.div>
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
                    <motion.div className="text-center mb-12" {...fadeUp}>
                        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-bold mb-6 bg-[#ECFDF5] border border-[rgba(34,163,102,0.2)] text-[#22A366] tracking-wide">
                            <Dice1 className="w-4 h-4" />수업 도구 · 수업 활동
                        </div>
                        <h2 className="text-3xl md:text-5xl font-sans text-[#1a1a19] mb-4 leading-tight">
                            수업이 지루할 틈이 <span className="text-[#22A366]">없습니다</span>
                        </h2>
                        <p className="text-lg text-slate-500 max-w-2xl mx-auto">타이머, 미러링, 스톱워치, 개인칠판 등 30여 가지 수업 도구를 수업 화면 안에서 바로 꺼내 씁니다.</p>
                    </motion.div>

                    {/* 30+ 수업 도구 — actual product tool board */}
                    <div className="max-w-6xl mx-auto mb-20">
                        <motion.div
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
                                    <motion.div
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
                                    </motion.div>
                                ))}
                            </div>
                        </motion.div>
                    </div>

                    {/* 10가지 수업 활동 */}
                    <div className="max-w-5xl mx-auto">
                        <motion.h3 {...fadeUp} className="text-sm font-bold text-slate-400 tracking-wider uppercase mb-6 text-center">10가지 수업 활동</motion.h3>
                        <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-12 gap-4">
                            {LESSON_ACTIVITIES.map((act, i) => (
                                <motion.div
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
                                </motion.div>
                            ))}
                        </div>
                        <motion.p {...fadeUp} className="mt-6 text-center text-sm text-slate-400">
                            활동 단위로 수업을 설계하고, 자료 공유부터 평가와 피드백까지 한 흐름으로 연결됩니다.
                        </motion.p>
                    </div>
                </div>
            </section>

            <WaveDivider flip color="#FDFCF8" />

            {/* ================================================================
                다양한 수업 형태 (3D tilt, people visualization)
            ================================================================ */}
            <section className="py-24 md:py-32">
                <div className="container mx-auto px-4 lg:px-8">
                    <motion.div className="text-center mb-16" {...fadeUp}>
                        <EyebrowTag>FLEXIBLE FORMAT</EyebrowTag>
                        <h2 className="text-3xl md:text-4xl lg:text-5xl font-sans text-[#1a1a19] leading-tight">
                            1:1 과외부터 수백 명 강의까지,<br /><span className="text-[#22A366]">하나의 플랫폼</span>
                        </h2>
                    </motion.div>

                    <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5 max-w-5xl mx-auto">
                        {[
                            { icon: <Users className="w-7 h-7" />, title: "1:1 과외", desc: "개인 맞춤 수업에 최적화된 집중 환경", people: 1, color: "bg-[#ECFDF5] border-[#D1FAE5] text-[#084734]", dotColor: "bg-[#084734]" },
                            { icon: <MessageSquare className="w-7 h-7" />, title: "소그룹 토론", desc: "그룹별 방 분리, 동시 판서, 발표 기능", people: 6, color: "bg-green-50 border-green-100 text-green-600", dotColor: "bg-green-400" },
                            { icon: <Monitor className="w-7 h-7" />, title: "일반 수업", desc: "학원 · 학교의 표준 수업 형태", people: 12, color: "bg-[#D1FAE5] border-[#D1FAE5] text-[#065c41]", dotColor: "bg-[#065c41]" },
                            { icon: <GraduationCap className="w-7 h-7" />, title: "대형 강의", desc: "수백 명이 동시 참여하는 라이브 강의", people: 20, color: "bg-green-50 border-green-100 text-green-700", dotColor: "bg-green-500" },
                        ].map((item, i) => (
                            <motion.div
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
                                        <motion.div
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
                            </motion.div>
                        ))}
                    </div>
                </div>
            </section>

            <HardwareTeaserSection />

            <FullscreenQuoteSection />

            {/* ================================================================
                안정성 & 네트워크 (world map dots, count-up)
            ================================================================ */}
            <section className="py-24 md:py-32 bg-slate-900 text-white relative overflow-hidden">
                {/* World map dots background */}
                <div className="absolute inset-0 pointer-events-none opacity-20">
                    <svg className="w-full h-full" viewBox="0 0 1000 500" fill="none">
                        {/* Simplified world map dots */}
                        {[[200,100],[220,95],[240,110],[260,105],[280,120],[300,115],[320,130],[180,150],[200,145],[220,160],[240,155],[260,170],[280,165],[300,180],[350,140],[370,135],[390,150],[410,145],[430,160],[450,155],[470,145],[500,120],[520,115],[540,130],[560,125],[580,140],[600,135],[620,150],[640,145],[660,130],[680,125],[700,140],[720,135],[750,160],[770,155],[790,170],[500,200],[520,195],[540,210],[560,205],[580,220],[600,215],[620,230],[640,225],[660,240],[680,235],[300,250],[320,245],[340,260],[360,255],[380,270],[400,265],[420,280],[440,275],[150,200],[170,205],[190,210],[210,215],[230,220],[250,225],[800,180],[820,175],[840,190],[860,185],[880,200]].map(([cx, cy], i) => (
                            <circle key={i} cx={cx} cy={cy} r="2" fill="white" className="animate-dot-pulse" style={{ animationDelay: `${i * 0.15}s` }} />
                        ))}
                        {/* Connection lines */}
                        <line x1="300" y1="180" x2="500" y2="120" stroke="white" strokeWidth="0.5" strokeOpacity="0.3" />
                        <line x1="500" y1="120" x2="700" y2="140" stroke="white" strokeWidth="0.5" strokeOpacity="0.3" />
                        <line x1="200" y1="145" x2="500" y2="200" stroke="white" strokeWidth="0.5" strokeOpacity="0.3" />
                    </svg>
                </div>

                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-[#22A366]/5 rounded-full blur-[120px] pointer-events-none" />

                <div className="container mx-auto px-4 lg:px-8 relative" ref={networkRef}>
                    <motion.div className="text-center mb-16" {...fadeUp}>
                        <EyebrowTag>GLOBAL NETWORK</EyebrowTag>
                        <h2 className="text-3xl md:text-4xl lg:text-5xl font-sans leading-tight">전 세계 어디서든,<br /><span className="text-[#22A366]">끊김 없이</span></h2>
                        <p className="text-lg text-slate-400 mt-6 max-w-2xl mx-auto">자체 네트워크 기술로 낮은 지연 시간과 고화질 수업을 보장합니다.</p>
                    </motion.div>

                    <div className="grid sm:grid-cols-3 gap-5 max-w-4xl mx-auto">
                        {[
                            { icon: <Globe className="w-7 h-7" />, value: `${net150}+`, label: "지원 국가", desc: "글로벌 CDN으로 어디서든 빠르게" },
                            { icon: <Zap className="w-7 h-7" />, value: "< 100ms", label: "지연 시간", desc: "실시간 상호작용이 가능한 속도" },
                            { icon: <Shield className="w-7 h-7" />, value: `${net99}.9%`, label: "가동률", desc: "중단 없는 안정적인 수업 환경" },
                        ].map((item, i) => (
                            <motion.div key={i} {...stagger(i)} className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-2xl p-8 text-center hover:bg-white/10 transition-colors relative overflow-hidden group">
                                {/* Pulse line between cards */}
                                {i < 2 && <div className="absolute right-0 top-1/2 -translate-y-1/2 w-px h-1/2 bg-gradient-to-b from-transparent via-[#22A366]/20 to-transparent hidden sm:block" />}
                                <div className="w-14 h-14 rounded-xl bg-white/10 border border-white/15 text-[#6EE7B7] flex items-center justify-center mx-auto mb-4 group-hover:scale-110 transition-transform shadow-[inset_0_1px_0_rgba(255,255,255,0.1)]">{item.icon}</div>
                                <div className="text-3xl font-sans font-bold tabular-nums text-white mb-1">{item.value}</div>
                                <div className="text-sm font-bold text-[#22A366] mb-2">{item.label}</div>
                                <p className="text-sm text-slate-400">{item.desc}</p>
                            </motion.div>
                        ))}
                    </div>
                </div>
            </section>

            {/* ================================================================
                관리 & 분석 (multiple charts, animated progress, floating tags)
            ================================================================ */}
            <section className="py-24 md:py-32">
                <div className="container mx-auto px-4 lg:px-8">
                    <div className="flex flex-col lg:flex-row items-center gap-16 lg:gap-20 max-w-7xl mx-auto">
                        <div className="flex-1 max-w-xl">
                            <motion.div {...fadeUp}>
                                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#084734]/5 text-[#084734] text-sm font-bold mb-6"><BarChart3 className="w-4 h-4" />데이터 & LMS</div>
                                <h2 className="text-3xl md:text-5xl font-sans text-[#1a1a19] mb-6 leading-tight">수업이 끝나도<br /><span className="text-[#084734]">학습은 계속됩니다</span></h2>
                                <p className="text-lg text-slate-500 leading-relaxed font-medium mb-10">자동 녹화, 학습 데이터 분석, 숙제·출결·평가까지. 수업 전후의 모든 학사 행정을 하나의 플랫폼에서.</p>
                            </motion.div>
                            <div className="space-y-5">
                                {[
                                    { icon: <Video className="w-5 h-5" />, label: "자동 녹화 · 복습", detail: "수업 종료 후 클라우드에 자동 저장. 학생이 언제든 다시 볼 수 있습니다." },
                                    { icon: <BarChart3 className="w-5 h-5" />, label: "학습 데이터 리포트", detail: "집중도, 발언 횟수, 참여 시간을 데이터로. 학부모 상담이 객관적으로 바뀝니다." },
                                    { icon: <FileText className="w-5 h-5" />, label: "LMS 올인원", detail: "숙제 제출, 평가, 출결 관리 — 별도 LMS 없이 ClassIn 안에서 모두 해결." },
                                ].map((f, i) => (
                                    <motion.div key={i} {...stagger(i)} className="flex items-center gap-4 bg-white border border-[rgba(0,0,0,0.06)] rounded-xl p-4 shadow-[0_1px_4px_rgba(0,0,0,0.04)] hover:shadow-[0_4px_18px_rgba(0,0,0,0.07)] hover:border-[rgba(8,71,52,0.15)] transition-all group">
                                        <div className="w-11 h-11 rounded-xl bg-[#ECFDF5] border border-[rgba(34,163,102,0.15)] text-[#084734] flex items-center justify-center shrink-0">{f.icon}</div>
                                        <div className="flex-1 min-w-0"><h4 className="font-bold text-slate-900 mb-0.5 text-sm">{f.label}</h4><p className="text-xs text-slate-500 leading-relaxed">{f.detail}</p></div>
                                        <ArrowRight className="w-4 h-4 text-slate-200 group-hover:text-[#22A366]/40 shrink-0 transition-colors" />
                                    </motion.div>
                                ))}
                            </div>
                        </div>

                        {/* Analytics mockup — enhanced */}
                        <div className="flex-1 w-full max-w-lg relative">
                            <motion.div {...fadeUp}>
                                <div className="bg-[#1a1a19] p-6 sm:p-10 rounded-[2rem] shadow-2xl relative overflow-hidden">
                                    <div className="flex justify-between items-end mb-8">
                                        <div>
                                            <div className="text-slate-400 text-sm font-medium mb-1">이번 달 종합 성취도</div>
                                            <div className="text-white text-3xl font-sans font-bold tabular-nums">상위 15%</div>
                                        </div>
                                    </div>

                                    {/* Bar chart */}
                                    <div className="h-44 flex items-end justify-between gap-3 border-b border-slate-700/50 pb-4 mb-4 relative">
                                        <div className="absolute w-full border-b border-dashed border-slate-700/30 top-1/2 -translate-y-1/2"></div>
                                        {[30, 45, 60, 50, 75, 90, 85].map((h, i) => (
                                            <motion.div key={i} initial={{ height: 0 }} whileInView={{ height: `${h}%` }} viewport={{ once: true }} transition={{ delay: 0.3 + i * 0.1, duration: 0.8, type: "spring" }} className="w-full bg-gradient-to-t from-[#084734]/20 to-[#6EE7B7] rounded-t-md relative z-10 group">
                                                <div className="absolute -top-6 left-1/2 -translate-x-1/2 text-[9px] font-sans tabular-nums text-[#6EE7B7] opacity-0 group-hover:opacity-100 transition-opacity">{h}%</div>
                                            </motion.div>
                                        ))}
                                    </div>
                                    <div className="flex justify-between text-slate-500 text-[10px] font-sans tabular-nums px-1 mb-6">
                                        <span>W1</span><span>W2</span><span>W3</span><span>W4</span><span>W5</span><span>W6</span><span>W7</span>
                                    </div>

                                    {/* Mini stat row */}
                                    <div className="grid grid-cols-3 gap-3">
                                        {[
                                            { label: "집중도", value: "87%", color: "text-green-400" },
                                            { label: "발언", value: "12회", color: "text-[#6EE7B7]" },
                                            { label: "참여 시간", value: "48분", color: "text-[#084734]" },
                                        ].map((s, i) => (
                                            <div key={i} className="bg-white/5 rounded-xl p-3 text-center">
                                                <div className={`text-lg font-sans font-bold tabular-nums ${s.color}`}>{s.value}</div>
                                                <div className="text-[10px] text-slate-500">{s.label}</div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </motion.div>

                            {/* Floating A+ badge with animated circle */}
                            <motion.div animate={{ y: [0, 12, 0] }} transition={{ repeat: Infinity, duration: 5 }} className="absolute -left-4 md:-left-8 -bottom-6 w-24 h-24 bg-white rounded-3xl shadow-xl flex items-center justify-center border border-slate-100 p-3 z-20">
                                <div className="relative w-full h-full flex items-center justify-center">
                                    <svg className="absolute w-full h-full transform -rotate-90" viewBox="0 0 100 100">
                                        <circle cx="50" cy="50" r="40" stroke="#e2e8f0" strokeWidth="4" fill="none" />
                                        <motion.circle cx="50" cy="50" r="40" stroke="#2563EB" strokeWidth="4" fill="none" strokeLinecap="round" strokeDasharray="251" initial={{ strokeDashoffset: 251 }} whileInView={{ strokeDashoffset: 63 }} viewport={{ once: true }} transition={{ duration: 1.5, delay: 0.5, ease: "easeOut" }} />
                                    </svg>
                                    <div className="font-bold text-slate-800 text-xl">A+</div>
                                </div>
                            </motion.div>

                            {/* Floating data tags */}
                            <motion.div initial={{ opacity: 0 }} whileInView={{ opacity: 1 }} viewport={{ once: true }} transition={{ delay: 1 }} className="absolute -right-2 md:-right-6 top-8 bg-white rounded-xl shadow-lg border border-slate-100 px-3 py-2 z-20 animate-float-tag">
                                <div className="text-[10px] text-slate-400">집중도</div>
                                <div className="text-sm font-sans font-bold tabular-nums text-green-500">87%</div>
                            </motion.div>
                        </div>
                    </div>
                </div>
            </section>

            <AIFeaturesSection />

            <CaseStudiesSection />

            <WaveDivider color="#ffffff" />

            {/* ================================================================
                TESTIMONIALS (avatars, star ratings, marquee option)
            ================================================================ */}
            <section className="py-24 md:py-32 bg-white relative">
                <div className="container mx-auto px-4 max-w-6xl">
                    <motion.div className="text-center mb-20" {...fadeUp}>
                        <h2 className="text-3xl md:text-5xl font-sans text-[#1a1a19] leading-tight">
                            전국의 교육자들이 <span className="text-[#22A366]">인정하는</span> 솔루션
                        </h2>
                    </motion.div>

                    <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6 md:gap-8 items-start">
                        <div className="space-y-6 md:space-y-8">
                            <TestimonialCard name="John Kim" role="대치 A수학 대표원장" quote="줌에서 옮긴 뒤로 학생들의 수업 참여도가 확 달라졌습니다. 판서를 학생에게 넘길 수 있다는 것만으로도 수업의 질이 완전히 바뀌었어요." rating={5} gradient="from-[#22A366] to-green-500" />
                            <TestimonialCard name="Sarah Lee" role="분당 어학원 원장" quote="LMS를 따로 쓸 필요가 없어졌어요. 출결, 숙제, 성적이 한 곳에 모이니까 행정 시간이 반 이상 줄었습니다." rating={5} gradient="from-emerald-500 to-teal-400" delay={0.1} />
                        </div>
                        <div className="space-y-6 md:space-y-8 md:mt-12">
                            <TestimonialCard name="David Park" role="목동 과학학원 강사" quote="학생들이 직접 화면에 실험 결과를 그리고 발표하는 게 가능해졌어요. 줌에서는 상상도 못했던 수업 방식입니다." rating={5} gradient="from-blue-500 to-indigo-400" delay={0.2} />
                            <TestimonialCard name="Stella Choi" role="프랜차이즈 교육 본부장" quote="전국 30개 지점의 수업 데이터가 실시간으로 본사에 모입니다. 수업 품질 관리가 이전과는 차원이 달라졌어요." rating={5} gradient="from-purple-500 to-pink-400" dark delay={0.3} />
                        </div>
                        <div className="space-y-6 md:space-y-8 lg:mt-6">
                            <TestimonialCard name="민지 학부모" role="초등 3학년 학부모" quote="아이가 화면에서 직접 문제를 풀 수 있으니까 집중력이 확실히 올라갔어요. 녹화 영상으로 복습하는 것도 정말 좋습니다." rating={5} gradient="from-pink-500 to-rose-400" delay={0.4} />
                            <TestimonialCard name="Peter Jung" role="에듀테크 컨설턴트" quote="교육용으로 설계된 플랫폼과 회의용 도구를 억지로 쓰는 건 차원이 다릅니다. 새로 개원하는 분들에게 1순위로 추천합니다." rating={5} gradient="from-slate-700 to-slate-500" delay={0.5} />
                        </div>
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
