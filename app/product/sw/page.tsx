"use client"

import { Button } from "@/components/ui/button"
import { BROCHURE_URL } from "@/lib/marketing-links"
import { motion, useInView, useMotionValue, useTransform, useScroll, useMotionValueEvent, animate } from "framer-motion"
import {
    Play, ArrowRight, Sparkles, Monitor, Layers, MousePointerClick,
    Clock, Users, PenTool, Dice1, FileText, Layout, Video,
    Globe, Wifi, BarChart3, BookOpen, Cloud, Timer, Mic,
    MessageSquare, GraduationCap, CheckCircle2, Zap, Shield,
    Star, X
} from "lucide-react"
import Link from "next/link"
import { useRef, useEffect, useState, useMemo, useCallback } from "react"

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
    const num = parseInt(digit)
    const [done, setDone] = useState(false)
    const containerRef = useRef<HTMLDivElement>(null)
    const [cellH, setCellH] = useState(0)

    useEffect(() => {
        function measure() {
            const firstSpan = containerRef.current?.querySelector("span")
            if (firstSpan) setCellH(firstSpan.getBoundingClientRect().height)
        }
        measure()
        window.addEventListener("resize", measure)
        return () => window.removeEventListener("resize", measure)
    }, [])

    return (
        <div className="w-14 sm:w-20 md:w-28 h-[4.5rem] sm:h-28 md:h-36 bg-white border border-slate-200/80 shadow-[0_2px_20px_rgba(0,0,0,0.04)] rounded-xl md:rounded-2xl flex items-center justify-center relative overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-b from-slate-50/80 to-transparent h-1/2 pointer-events-none z-10"></div>
            <motion.div
                ref={containerRef}
                className="flex flex-col items-center"
                initial={{ y: 0 }}
                animate={trigger && cellH > 0 ? { y: -(num * cellH) } : {}}
                transition={{ duration: 1.2, delay, ease: [0.25, 0.46, 0.45, 0.94] }}
                onAnimationComplete={() => { if (trigger) { setDone(true); onDone?.() } }}
            >
                {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => (
                    <span key={n} className={`h-[4.5rem] sm:h-28 md:h-36 flex items-center justify-center text-4xl sm:text-6xl md:text-8xl font-serif text-[#E05024] font-light ${done ? "animate-digit-glow" : ""}`}>{n}</span>
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
            className="bg-white rounded-2xl border border-slate-200/80 shadow-[0_2px_20px_rgba(0,0,0,0.04)] p-5 sm:p-6 text-center flex-1 min-w-[140px]"
            initial={{ opacity: 0, y: 25, rotateX: 8 }}
            animate={trigger ? { opacity: 1, y: 0, rotateX: 0 } : {}}
            transition={{ type: "spring", stiffness: 200, damping: 25, delay }}
            style={{ perspective: 800 }}
        >
            <div className="flex justify-center mb-3 text-[#E05024]/70">{icon}</div>
            <div className="text-2xl sm:text-3xl font-bold text-slate-900 mb-1 font-serif">
                {value >= 100 ? display.toLocaleString() : display}{suffix}
            </div>
            <div className="text-xs sm:text-sm text-slate-400 font-medium leading-snug whitespace-pre-line">{label}</div>
        </motion.div>
    )
}

/* ── Ambient particle ────────────────────────────────────────────── */
function AmbientParticle({ x, size, duration, delayStart }: { x: number; size: number; duration: number; delayStart: number }) {
    return (
        <motion.div
            className="absolute rounded-full bg-orange-300/15 pointer-events-none"
            style={{ left: `${x}%`, bottom: "-10%", width: size, height: size }}
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
    const displayDigits = useMemo(() => (1411800 + liveCount).toString().split(""), [liveCount])

    return (
        <section ref={sectionRef} className="relative py-32 md:py-44 overflow-hidden" style={{ minHeight: "100vh" }}>
            <div className="absolute inset-0 bg-gradient-to-b from-[#FFF9F5] via-[#FFFAF7] to-[#FDFCF8]"></div>
            <motion.div className="absolute inset-0 pointer-events-none" style={{ opacity: glowOpacity }}>
                <motion.div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[900px] h-[700px] bg-gradient-radial from-orange-200/30 via-orange-100/10 to-transparent rounded-full blur-3xl" animate={{ x: [0, 30, -20, 0], y: [0, -20, 15, 0] }} transition={{ duration: 20, repeat: Infinity, ease: "easeInOut" }} />
            </motion.div>
            <div className="absolute top-0 left-0 w-full h-px bg-gradient-to-r from-transparent via-orange-300/20 to-transparent"></div>
            <motion.div className="absolute inset-0 pointer-events-none" initial={{ opacity: 0 }} animate={phase >= 1 ? { opacity: 1 } : {}} transition={{ duration: 1 }}>
                {particles.map(({ key, ...rest }) => <AmbientParticle key={key} {...rest} />)}
            </motion.div>

            <div className="container mx-auto px-4 text-center max-w-5xl relative z-10">
                <motion.p initial={{ opacity: 0, y: 20 }} animate={phase >= 1 ? { opacity: 1, y: 0 } : {}} transition={{ duration: 0.7 }} className="text-xl sm:text-2xl md:text-3xl text-slate-500 font-medium font-serif leading-relaxed mb-3">줌 열고, 녹화 누르고, 숙제 올리고—</motion.p>
                <motion.p initial={{ opacity: 0, y: 20 }} animate={phase >= 1 ? { opacity: 1, y: 0 } : {}} transition={{ duration: 0.7, delay: 0.35 }} className="text-xl sm:text-2xl md:text-3xl text-slate-700 font-semibold font-serif mb-8">수업 하나에 도구만 네 개.</motion.p>
                <motion.p initial={{ opacity: 0, filter: "blur(4px)" }} animate={phase >= 1 ? { opacity: 1, filter: "blur(0px)" } : {}} transition={{ duration: 0.8, delay: 0.7 }} className="text-lg sm:text-xl md:text-2xl text-[#E05024] font-medium font-serif italic mb-10">가르치는 일에만 집중할 수 있다면?</motion.p>
                <motion.div initial={{ opacity: 0, y: 10 }} animate={phase >= 1 ? { opacity: 1, y: 0 } : {}} transition={{ duration: 0.5, delay: 1.0 }} className="flex items-center justify-center gap-2 mb-14">
                    <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-orange-50 border border-orange-200/60 text-sm font-medium text-[#E05024]"><Clock className="w-3.5 h-3.5" />되찾은 수업 시간</div>
                </motion.div>

                <motion.p initial={{ opacity: 0, y: 10 }} animate={phase >= 2 ? { opacity: 1, y: 0 } : {}} transition={{ duration: 0.5 }} className="text-base sm:text-lg text-slate-400 font-medium mb-8 max-w-xl mx-auto">181개 기업 고객사가 ClassIn으로 되찾은 시간</motion.p>
                <div className="relative">
                    <motion.div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[300px] bg-gradient-radial from-orange-300/25 via-orange-200/10 to-transparent rounded-full pointer-events-none" initial={{ scale: 0, opacity: 0 }} animate={phase >= 2 ? { scale: [0, 1.2, 1], opacity: [0, 0.7, 0] } : {}} transition={{ duration: 1.5 }} />
                    <motion.div className="flex justify-center mb-5" initial={{ scale: 0.9, opacity: 0.3, filter: "blur(8px)" }} animate={phase >= 2 ? { scale: 1, opacity: 1, filter: "blur(0px)" } : {}} transition={{ type: "spring", stiffness: 120, damping: 20 }}>
                        <div className="flex items-center gap-1.5 sm:gap-2.5 select-none relative">
                            <SlotDigit digit={displayDigits[0]} delay={0.2} trigger={phase >= 2} />
                            <span className="text-4xl sm:text-6xl md:text-8xl font-serif text-slate-300 font-light">,</span>
                            <SlotDigit digit={displayDigits[1]} delay={0.35} trigger={phase >= 2} />
                            <SlotDigit digit={displayDigits[2]} delay={0.45} trigger={phase >= 2} />
                            <SlotDigit digit={displayDigits[3]} delay={0.55} trigger={phase >= 2} />
                            <span className="text-4xl sm:text-6xl md:text-8xl font-serif text-slate-300 font-light">,</span>
                            <SlotDigit digit={displayDigits[4]} delay={0.65} trigger={phase >= 2} />
                            <SlotDigit digit={displayDigits[5]} delay={0.75} trigger={phase >= 2} />
                            <SlotDigit digit={displayDigits[6]} delay={0.85} trigger={phase >= 2} onDone={handleLastSlotDone} />
                            {slotsDone && <div className="absolute inset-0 overflow-hidden pointer-events-none rounded-2xl"><div className="absolute inset-0 animate-shimmer-sweep bg-gradient-to-r from-transparent via-orange-400/15 to-transparent w-1/3 h-full" /></div>}
                        </div>
                    </motion.div>
                </div>
                <motion.p initial={{ opacity: 0 }} animate={phase >= 2 ? { opacity: 1 } : {}} transition={{ delay: 0.5 }} className="text-3xl sm:text-4xl md:text-5xl font-serif text-slate-800 font-light tracking-tight mb-3">시간</motion.p>
                <motion.p initial={{ opacity: 0, y: 10 }} animate={phase >= 2 ? { opacity: 1, y: 0 } : {}} transition={{ delay: 0.7 }} className="text-sm sm:text-base text-slate-400 font-medium mb-6">지금 이 순간에도 수업이 진행되고 있습니다</motion.p>

                <motion.div className="w-full max-w-sm mx-auto h-px bg-gradient-to-r from-transparent via-orange-300/30 to-transparent mb-14 mt-14" initial={{ scaleX: 0 }} animate={phase >= 3 ? { scaleX: 1 } : {}} transition={{ duration: 0.6 }} style={{ originX: 0.5 }} />
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-14 max-w-3xl mx-auto">
                    <StatCard value={181} suffix="+" label="기업 고객사" icon={<Monitor className="w-5 h-5" />} delay={0} trigger={phase >= 3} />
                    <StatCard value={30} suffix="+" label="인터랙티브 수업 도구" icon={<MousePointerClick className="w-5 h-5" />} delay={0.1} trigger={phase >= 3} />
                    <StatCard value={10} suffix="가지" label={"참여형\n수업 활동"} icon={<Layers className="w-5 h-5" />} delay={0.2} trigger={phase >= 3} />
                    <StatCard value={98} suffix="%" label={`"과거로 못 돌아간다"\n응답률`} icon={<Sparkles className="w-5 h-5" />} delay={0.3} trigger={phase >= 3} />
                </div>
                <motion.p initial={{ opacity: 0, letterSpacing: "0.3em" }} animate={phase >= 3 ? { opacity: 1, letterSpacing: "0.05em" } : {}} transition={{ delay: 0.5, duration: 0.8 }} className="text-lg sm:text-xl font-serif text-slate-600 font-medium mb-10">수업만을 위해 만든 플랫폼, 다음은 당신의 교실입니다</motion.p>
                <motion.div initial={{ opacity: 0, y: 20 }} animate={phase >= 3 ? { opacity: 1, y: 0 } : {}} transition={{ delay: 0.7, type: "spring", stiffness: 200, damping: 25 }} className="flex flex-col items-center gap-4">
                    <Button asChild className="bg-[#E05024] hover:bg-[#C9431A] text-white rounded-full px-10 h-14 text-base font-bold animate-glow-pulse transition-all hover:scale-105 group">
                        <Link href="/contact#contact-form">지금 무료로 시작하기<ArrowRight className="w-4 h-4 ml-2 group-hover:translate-x-1 transition-transform" /></Link>
                    </Button>
                    <p className="text-xs sm:text-sm text-slate-400 font-medium">설치 없이 바로 체험 · 카드 등록 불필요</p>
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
                    <h2 className="text-3xl md:text-5xl font-serif text-white leading-tight">
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
                                    <div className="text-4xl font-serif font-bold text-[#6EE7B7] mb-1">{c.num}</div>
                                    <div className="text-xs text-white/30 leading-snug">{c.numLabel}</div>
                                </div>
                            </div>

                            {/* Center: quote */}
                            <div className="bg-white/[0.02] p-8 lg:p-10 flex flex-col justify-center border-x border-white/[0.07]">
                                <div className="text-[#6EE7B7]/30 text-4xl font-serif mb-4 leading-none">&ldquo;</div>
                                <blockquote className="text-lg font-serif text-white/80 leading-relaxed mb-5">{c.quote}</blockquote>
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
                            className={`text-[clamp(2rem,5vw,4rem)] font-serif leading-[1.15] tracking-tight ${
                                line.accent ? "text-[#E05024]" : "text-[#1a1a19]"
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
                    className="w-16 h-[2px] bg-[#E05024] mb-10"
                />

                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    transition={{ delay: 0.8, duration: 0.6 }}
                    className="max-w-lg"
                >
                    <p className="text-xl md:text-2xl font-serif text-slate-600 leading-relaxed mb-2">
                        교사가 <span className="font-bold text-slate-900">잘 가르칠 수 있을 때</span>,
                    </p>
                    <p className="text-xl md:text-2xl font-serif text-slate-600 leading-relaxed">
                        학생은 <span className="font-bold text-[#E05024]">더 깊이 배웁니다.</span>
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
                        <h2 className="text-4xl md:text-5xl lg:text-6xl font-serif text-white leading-[1.1] tracking-tight mb-6">
                            2030년의<br />교실은<br /><span className="text-[#6EE7B7]">달라집니다</span>
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
                    <p className="text-sm font-semibold text-[#E05024] tracking-wider uppercase mb-4">The Real Goal</p>
                    <h2 className="text-[clamp(2rem,5vw,4.5rem)] font-serif text-[#1a1a19] leading-[1.1] tracking-tight mb-6">
                        아이들과의<br />
                        <span className="text-[#E05024]">진정한 교육</span>
                    </h2>
                    <p className="text-xl md:text-2xl text-slate-500 font-serif max-w-2xl mx-auto leading-relaxed">
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
                        <div className="text-[72px] md:text-[88px] font-serif font-bold text-[#6EE7B7] leading-none mb-2">
                            {q}x
                        </div>
                        <div className="text-white/80 text-lg font-semibold mb-1">수업 퀄리티</div>
                        <div className="text-white/30 text-sm">쌍방향 참여 · AI 지원 · 학습 데이터 기반</div>
                    </motion.div>
                    <motion.div
                        initial={{ opacity: 0, scale: 0.9 }}
                        animate={inView ? { opacity: 1, scale: 1 } : {}}
                        transition={{ duration: 0.7, delay: 0.15, type: "spring", stiffness: 150 }}
                        className="bg-[#E05024] rounded-3xl p-10 text-center"
                    >
                        <div className="text-[72px] md:text-[88px] font-serif font-bold text-white leading-none mb-2">
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
                                <div className="w-6 h-[2px] bg-[#E05024] mb-4" />
                                <h3 className="text-base font-bold text-[#1a1a19] mb-2">{item.headline}</h3>
                                <p className="text-sm text-slate-500 leading-relaxed">{item.body}</p>
                            </div>
                        ))}
                    </div>

                    <p className="text-xl md:text-2xl font-serif text-slate-600 leading-relaxed">
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
        color: "bg-[#FEF3EE] border-[#F6D5C5]",
        accent: "#B85C33",
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
                    <p className="text-sm font-semibold text-[#E05024] tracking-wider uppercase mb-3">LEARNING CYCLE</p>
                    <h2 className="text-3xl md:text-4xl lg:text-5xl font-serif text-[#1a1a19] leading-tight">
                        수업의 처음부터 끝까지,<br /><span className="text-[#E05024]">하나로 연결</span>
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
            <div className="container mx-auto px-4 lg:px-8 max-w-6xl relative">
                <div className="grid lg:grid-cols-2 gap-14 items-center">
                    <motion.div initial={{ opacity: 0, x: -30 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true }} transition={{ duration: 0.7 }}>
                        <span className="inline-flex items-center gap-2 bg-[#6EE7B7]/10 text-[#6EE7B7] text-xs font-bold px-3 py-1.5 rounded-full mb-6">
                            ClassIn X · 하드웨어
                        </span>
                        <h2 className="text-3xl md:text-4xl lg:text-5xl font-serif text-white leading-tight mb-5">
                            소프트웨어만으로<br />부족하다면
                        </h2>
                        <p className="text-lg text-white/50 leading-relaxed mb-8">
                            AI 전자칠판 + 모션 트래킹 카메라 + AI 노이즈 캔슬링 마이크.
                            클래스인 소프트웨어와 완벽하게 연동되는 스마트 교실을 구축하세요.
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
                        <div className="relative bg-white/5 rounded-2xl border border-white/10 p-8 text-center">
                            <div className="w-full aspect-[4/3] bg-gradient-to-br from-[#084734]/30 to-[#1a1a19] rounded-xl border border-white/10 flex items-center justify-center mb-6 relative overflow-hidden">
                                <div className="absolute inset-0 flex items-center justify-center">
                                    <div className="w-4/5 aspect-video bg-[#0f0f0f] rounded-lg border-4 border-[#6EE7B7]/20 shadow-2xl flex items-center justify-center relative">
                                        <span className="text-[#6EE7B7]/30 text-xs font-mono">AI Interactive Board</span>
                                        {/* Camera indicator */}
                                        <div className="absolute -top-3 left-1/2 -translate-x-1/2 w-6 h-6 bg-[#1a1a19] border border-white/10 rounded-full flex items-center justify-center">
                                            <div className="w-2 h-2 rounded-full bg-[#6EE7B7]/60" />
                                        </div>
                                    </div>
                                </div>
                                {/* Mic dots */}
                                <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-2">
                                    {[...Array(5)].map((_, i) => (
                                        <motion.div key={i} className="w-1.5 h-1.5 rounded-full bg-[#6EE7B7]/40"
                                            animate={{ opacity: [0.3, 1, 0.3] }}
                                            transition={{ duration: 1.5, delay: i * 0.2, repeat: Infinity }} />
                                    ))}
                                </div>
                            </div>
                            <p className="text-white/30 text-xs">ClassIn X · 스마트 교실 구성</p>
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
                    <h2 className="text-3xl md:text-4xl lg:text-5xl font-serif text-[#1a1a19] leading-tight mb-4">
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
                            className="bg-white rounded-2xl border border-[rgba(0,0,0,0.06)] p-6 hover:shadow-[0_8px_30px_rgba(0,0,0,0.07)] hover:-translate-y-1 transition-all"
                        >
                            <div className="text-3xl mb-3">{f.icon}</div>
                            <h3 className="text-sm font-bold text-[#111110] mb-2">{f.title}</h3>
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
                    <Link href="/contact" className="shrink-0 inline-flex items-center gap-2 bg-white text-[#084734] font-bold text-sm px-5 py-2.5 rounded-full hover:bg-white/90 transition-colors">
                        무료 체험 시작 <ArrowRight className="w-4 h-4" />
                    </Link>
                </motion.div>
            </div>
        </section>
    )
}

/* ── [D] 도입 프로세스 섹션 ──────────────────────────────────── */
const ONBOARDING_STEPS = [
    {
        step: "01",
        title: "상담 신청",
        desc: "기관 규모와 수업 방식을 공유해주시면 전담 매니저가 맞춤 플랜을 안내합니다.",
        duration: "당일 회신",
    },
    {
        step: "02",
        title: "무료 체험",
        desc: "실제 수업 환경에서 직접 사용해보세요. 설치 없이 브라우저에서 바로 시작합니다.",
        duration: "2주 무료",
    },
    {
        step: "03",
        title: "팀 온보딩",
        desc: "강사진 교육부터 시스템 설정까지. 전담 온보딩 팀이 처음부터 함께합니다.",
        duration: "1–3일",
    },
    {
        step: "04",
        title: "수업 시작",
        desc: "준비 완료. 학생들과 함께 첫 수업을 시작하세요. 이후에도 전담 지원이 이어집니다.",
        duration: "바로 시작",
    },
]

function OnboardingSection() {
    return (
        <section className="py-24 md:py-32 bg-white">
            <div className="container mx-auto px-4 lg:px-8 max-w-5xl">
                <motion.div className="text-center mb-16" {...fadeUp}>
                    <p className="text-sm font-semibold text-[#E05024] tracking-wider uppercase mb-3">GET STARTED</p>
                    <h2 className="text-3xl md:text-4xl lg:text-5xl font-serif text-[#1a1a19] leading-tight">
                        도입은 생각보다<br /><span className="text-[#E05024]">쉽습니다</span>
                    </h2>
                    <p className="text-lg text-slate-400 mt-4 max-w-md mx-auto">
                        상담부터 첫 수업까지, 빠르면 하루 안에 시작할 수 있습니다.
                    </p>
                </motion.div>

                <div className="relative">
                    {/* 연결선 */}
                    <div className="hidden lg:block absolute top-9 left-[calc(12.5%+20px)] right-[calc(12.5%+20px)] h-px bg-gradient-to-r from-[#E05024]/20 via-[#E05024]/40 to-[#E05024]/20" />

                    <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
                        {ONBOARDING_STEPS.map((s, i) => (
                            <motion.div
                                key={s.step}
                                initial={{ opacity: 0, y: 25 }}
                                whileInView={{ opacity: 1, y: 0 }}
                                viewport={{ once: true }}
                                transition={{ delay: i * 0.12 }}
                                className="flex flex-col items-center text-center"
                            >
                                <div className="w-[52px] h-[52px] rounded-full bg-[#E05024] text-white font-bold text-lg flex items-center justify-center mb-5 shadow-[0_8px_20px_rgba(224,80,36,0.25)] relative z-10">
                                    {s.step}
                                </div>
                                <span className="inline-block bg-[#E05024]/5 text-[#E05024] text-xs font-bold px-3 py-1 rounded-full mb-3">
                                    {s.duration}
                                </span>
                                <h3 className="text-base font-bold text-slate-900 mb-2">{s.title}</h3>
                                <p className="text-sm text-slate-500 leading-relaxed">{s.desc}</p>
                            </motion.div>
                        ))}
                    </div>
                </div>
            </div>
        </section>
    )
}

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
    const [open, setOpen] = useState<number | null>(null)
    return (
        <section className="py-24 md:py-32 bg-[#FDFCF8]">
            <div className="container mx-auto px-4 lg:px-8 max-w-3xl">
                <motion.div className="text-center mb-14" {...fadeUp}>
                    <p className="text-sm font-semibold text-[#E05024] tracking-wider uppercase mb-3">FAQ</p>
                    <h2 className="text-3xl md:text-4xl font-serif text-[#1a1a19] leading-tight">
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
                            className="bg-white rounded-xl border border-[rgba(0,0,0,0.07)] overflow-hidden"
                        >
                            <button
                                onClick={() => setOpen(open === i ? null : i)}
                                className="w-full flex items-center justify-between gap-4 px-6 py-5 text-left"
                            >
                                <span className="text-sm font-semibold text-slate-800 leading-snug">{faq.q}</span>
                                <motion.span
                                    animate={{ rotate: open === i ? 45 : 0 }}
                                    transition={{ duration: 0.2 }}
                                    className="text-[#E05024] text-xl font-light shrink-0 leading-none"
                                >
                                    +
                                </motion.span>
                            </button>
                            <motion.div
                                initial={false}
                                animate={{ height: open === i ? "auto" : 0, opacity: open === i ? 1 : 0 }}
                                transition={{ duration: 0.25 }}
                                className="overflow-hidden"
                            >
                                <p className="px-6 pb-5 text-sm text-slate-500 leading-relaxed border-t border-slate-50 pt-4">
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
                    <div className="space-y-4 text-2xl sm:text-3xl md:text-4xl font-serif text-slate-700 leading-snug">
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
                        className="text-xl sm:text-2xl md:text-3xl font-serif text-slate-900 pt-4 border-t border-slate-100"
                    >
                        수업은 했는데,{" "}
                        <span className="text-[#E05024] font-bold">교육은 안 된 하루.</span>
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
                    <div className="text-[#6EE7B7]/60 text-5xl font-serif mb-8 leading-none select-none">&ldquo;</div>
                    <blockquote className="text-2xl sm:text-3xl md:text-4xl font-serif text-white leading-[1.4] tracking-tight mb-10">
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
                    className="mt-16 grid grid-cols-3 gap-8 max-w-2xl mx-auto border-t border-white/10 pt-12"
                >
                    {[
                        { value: "287개", label: "하이브리드 수업 (2021 가을학기 단 한 학기)" },
                        { value: "160+", label: "협력 국가" },
                        { value: "8만+", label: "글로벌 파트너 기관" },
                    ].map((s) => (
                        <div key={s.label} className="text-center">
                            <div className="text-2xl sm:text-3xl font-serif font-bold text-white mb-1">{s.value}</div>
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
                    <p className="text-sm font-semibold text-[#E05024] tracking-wider uppercase mb-3">CASE STUDY</p>
                    <h2 className="text-3xl md:text-4xl lg:text-5xl font-serif text-[#1a1a19] leading-tight">
                        실제 교육 현장의 <span className="text-[#E05024]">변화</span>
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
                                        <div className={`text-sm font-bold ${c.accent}`}>{r.value}</div>
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
    "1:1부터 수백 명 대형 강의까지",
    "12개 언어 지원 · 160개국 서비스",
    "AI 첨삭 · AI 과제 생성 · AI 교안",
    "전담 고객 지원 · 전문가 온보딩",
]

function PricingValueSection() {
    return (
        <section className="py-24 md:py-32 bg-white">
            <div className="container mx-auto px-4 lg:px-8 max-w-5xl">
                <motion.div className="text-center mb-14" {...fadeUp}>
                    <p className="text-sm font-semibold text-[#E05024] tracking-wider uppercase mb-3">PRICING VALUE</p>
                    <h2 className="text-3xl md:text-4xl lg:text-5xl font-serif text-[#1a1a19] leading-tight mb-4">
                        이 가격에,{" "}
                        <span className="text-[#E05024]">이 모든 것을</span>
                    </h2>
                    <p className="text-lg text-slate-500 max-w-xl mx-auto">
                        LMS 따로, 화상 도구 따로, 녹화 툴 따로 — 세 가지를 각각 쓰면
                        월 수십만 원이 넘습니다. ClassIn은 하나로 전부 해결합니다.
                    </p>
                </motion.div>

                <div className="grid lg:grid-cols-2 gap-10 items-center">
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
                                    <CheckCircle2 className="w-4 h-4 text-[#E05024] shrink-0 mt-0.5" />
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
                            { label: "일반 화상 도구", note: "Zoom · Teams 등", cost: "~₩20,000/월", line: true },
                            { label: "+ LMS 별도 구독", note: "Classting · Google Classroom Pro 등", cost: "~₩30,000/월", line: true },
                            { label: "+ 녹화 · 클라우드 스토리지", note: "별도 저장소 + 관리 비용", cost: "~₩10,000/월", line: true },
                            { label: "합계", note: "그래도 기능은 분산됨", cost: "₩60,000+/월", line: false, highlight: true },
                        ].map((row) => (
                            <div key={row.label} className={`flex items-center justify-between pb-4 ${row.line ? "border-b border-slate-100" : ""} ${row.highlight ? "bg-[#FFF9F7] rounded-xl px-4 py-3 -mx-4" : ""}`}>
                                <div>
                                    <p className={`text-sm font-semibold ${row.highlight ? "text-[#E05024]" : "text-slate-700"}`}>{row.label}</p>
                                    <p className="text-xs text-slate-400">{row.note}</p>
                                </div>
                                <p className={`font-bold font-mono text-sm ${row.highlight ? "text-[#E05024]" : "text-slate-500 line-through"}`}>{row.cost}</p>
                            </div>
                        ))}

                        <div className="bg-[#1a1a19] text-white rounded-2xl p-6 text-center mt-4">
                            <p className="text-slate-400 text-sm mb-1">ClassIn 하나로</p>
                            <p className="text-2xl font-serif font-bold text-white mb-1">위의 모든 것 + AI 기능까지</p>
                            <p className="text-[#E05024] text-sm font-bold mb-5">기관 규모에 맞춘 맞춤 요금제</p>
                            <Link href="/pricing" className="inline-flex items-center gap-2 bg-[#E05024] hover:bg-[#C9431A] text-white font-bold text-sm px-6 py-2.5 rounded-full transition-all hover:scale-105">
                                요금제 확인하기 <ArrowRight className="w-4 h-4" />
                            </Link>
                        </div>
                    </motion.div>
                </div>
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
        <div className="bg-[#FDFCF8] min-h-screen text-slate-900 font-sans selection:bg-orange-200 pt-20">

            {/* ================================================================
                HERO — "수업을, 더 수업답게"
            ================================================================ */}
            <section className="relative overflow-hidden">
                {/* Dot pattern background */}
                <div className="absolute inset-0 pointer-events-none" style={{
                    backgroundImage: "radial-gradient(circle, rgba(224,80,36,0.06) 1px, transparent 1px)",
                    backgroundSize: "24px 24px",
                }} />
                <div className="absolute inset-0 bg-gradient-to-b from-[#FDFCF8] via-[#FFF9F7]/90 to-[#FDFCF8] pointer-events-none" />

                <div className="container mx-auto px-4 lg:px-8 pt-12 md:pt-24 pb-8 md:pb-16 relative">
                    <div className="max-w-4xl mx-auto text-center">
                        <motion.div initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7 }}>
                            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-[#E05024]/5 text-[#E05024] text-sm font-semibold mb-8 border border-[#E05024]/10">
                                <span className="w-2 h-2 rounded-full bg-[#E05024] animate-pulse"></span>
                                교육 전용 플랫폼
                            </div>

                            <h1 className="text-4xl sm:text-5xl lg:text-6xl xl:text-7xl font-serif leading-[1.1] tracking-tight mb-8 text-[#1a1a19]">
                                수업을, 더{" "}
                                <span className="text-[#E05024]">수업답게</span>
                            </h1>

                            <p className="text-xl md:text-2xl text-slate-500 leading-relaxed font-medium max-w-2xl mx-auto mb-8">
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
                                    <motion.div key={i} initial={{ opacity: 0, y: 15 }} animate={heroMetricInView ? { opacity: 1, y: 0 } : {}} transition={{ delay: i * 0.1 + 0.3 }} className="text-center">
                                        <div className="text-2xl md:text-3xl font-serif font-bold text-[#E05024]">
                                            {m.raw ? m.value : m.value}{m.suffix}
                                        </div>
                                        <div className="text-xs md:text-sm text-slate-400 mt-1 font-medium">{m.label}</div>
                                    </motion.div>
                                ))}
                            </div>

                            <div className="flex flex-wrap items-center justify-center gap-4">
                                <Button asChild className="bg-[#E05024] hover:bg-[#C9431A] text-white rounded-full px-8 h-14 text-base font-bold shadow-[0_8px_20px_rgba(224,80,36,0.3)] hover:shadow-[0_12px_25px_rgba(224,80,36,0.4)] transition-all hover:scale-105 group">
                                    <Link href="/contact#contact-form">
                                    무료로 시작하기
                                    <ArrowRight className="w-4 h-4 ml-2 group-hover:translate-x-1 transition-transform" />
                                    </Link>
                                </Button>
                                <Button asChild variant="outline" className="rounded-full px-8 h-14 text-base font-bold border-slate-300 text-slate-700 hover:bg-slate-50 hover:border-slate-400 transition-all hover:scale-105">
                                    <a href={BROCHURE_URL} target="_blank" rel="noopener noreferrer">
                                    <Play className="w-4 h-4 mr-2" />
                                    서비스 소개서 보기
                                    </a>
                                </Button>
                            </div>
                        </motion.div>
                    </div>
                </div>

                {/* Hero classroom mockup */}
                <div className="container mx-auto px-4 lg:px-8 pb-12 md:pb-24 relative">
                    <motion.div
                        initial={{ opacity: 0, y: 50, scale: 0.95 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        transition={{ duration: 0.9, delay: 0.4, type: "spring", bounce: 0.15 }}
                        className="max-w-5xl mx-auto"
                    >
                        <div className="relative bg-white rounded-2xl shadow-[0_30px_60px_rgba(0,0,0,0.08)] border border-slate-100 p-2 overflow-hidden">
                            <div className="bg-slate-50 rounded-xl overflow-hidden border border-slate-100 flex h-[300px] sm:h-[400px] lg:h-[480px]">
                                {/* Sidebar */}
                                <div className="w-1/4 border-r border-slate-200 bg-white p-4 hidden sm:flex flex-col">
                                    <div className="w-20 h-3 bg-slate-200 rounded mb-6"></div>
                                    <div className="space-y-3 flex-1">
                                        {[1, 2, 3, 4, 5, 6].map(i => (
                                            <div key={i} className="flex items-center gap-3">
                                                <div className={`w-6 h-6 rounded-md ${i === 1 ? "bg-[#E05024]/10" : "bg-slate-100"}`}></div>
                                                <div className={`h-3 rounded ${i === 1 ? "w-16 bg-[#E05024]/20" : "w-14 bg-slate-100"}`}></div>
                                            </div>
                                        ))}
                                    </div>
                                    <div className="flex items-center gap-2 pt-4 border-t border-slate-100">
                                        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-[#E05024] to-orange-400"></div>
                                        <div className="w-16 h-3 bg-slate-100 rounded"></div>
                                    </div>
                                </div>
                                {/* Main content area — blackboard */}
                                <div className="flex-1 bg-[#1e1e1e] p-4 sm:p-6 flex flex-col">
                                    {/* Toolbar */}
                                    <div className="flex items-center gap-2 mb-4 pb-3 border-b border-white/10">
                                        {["#E05024", "#3B82F6", "#10B981", "#F59E0B"].map(c => (
                                            <div key={c} className="w-5 h-5 rounded-full border-2 border-white/20" style={{ backgroundColor: c }} />
                                        ))}
                                        <div className="ml-auto flex gap-2">
                                            <div className="px-2 py-1 rounded bg-white/10 text-[10px] text-white/40 font-mono">T 2:30</div>
                                            <div className="px-2 py-1 rounded bg-[#E05024]/20 text-[10px] text-[#E05024] font-mono">LIVE</div>
                                        </div>
                                    </div>
                                    {/* Board content with animated lines */}
                                    <div className="flex-1 relative">
                                        <svg className="absolute inset-0 w-full h-full" viewBox="0 0 400 250" fill="none">
                                            <motion.path d="M30,40 Q80,20 130,45 T230,35" stroke="white" strokeWidth="2" strokeOpacity="0.3" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 2, delay: 1 }} />
                                            <motion.path d="M30,80 Q100,60 170,85 T300,70" stroke="#3B82F6" strokeWidth="2" strokeOpacity="0.4" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 2, delay: 1.5 }} />
                                            <motion.path d="M30,120 L120,120 L120,180 L200,180" stroke="#E05024" strokeWidth="2" strokeOpacity="0.35" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 2, delay: 2 }} />
                                            <motion.path d="M250,130 Q280,110 310,135 T370,120" stroke="#10B981" strokeWidth="2" strokeOpacity="0.4" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 1.5, delay: 2.5 }} />
                                        </svg>
                                        {/* Animated cursors */}
                                        <motion.div animate={{ x: [120, 160, 180], y: [70, 55, 75] }} transition={{ duration: 3, repeat: Infinity, repeatType: "reverse" }} className="absolute w-3 h-3">
                                            <div className="w-3 h-3 rounded-full bg-[#3B82F6] animate-cursor-blink shadow-[0_0_8px_rgba(59,130,246,0.5)]" />
                                            <div className="absolute -top-4 left-3 text-[8px] text-[#3B82F6] font-mono whitespace-nowrap">학생 B</div>
                                        </motion.div>
                                        <motion.div animate={{ x: [250, 280, 300], y: [115, 105, 125] }} transition={{ duration: 4, repeat: Infinity, repeatType: "reverse", delay: 1 }} className="absolute w-3 h-3">
                                            <div className="w-3 h-3 rounded-full bg-[#10B981] animate-cursor-blink shadow-[0_0_8px_rgba(16,185,129,0.5)]" />
                                            <div className="absolute -top-4 left-3 text-[8px] text-[#10B981] font-mono whitespace-nowrap">학생 C</div>
                                        </motion.div>
                                    </div>
                                    {/* Bottom bar */}
                                    <div className="flex items-center justify-between pt-3 border-t border-white/10">
                                        <div className="flex -space-x-2">
                                            {[
                                                "from-[#E05024] to-orange-400",
                                                "from-blue-500 to-cyan-400",
                                                "from-green-500 to-emerald-400",
                                                "from-purple-500 to-pink-400",
                                            ].map((g, i) => (
                                                <div key={i} className={`w-7 h-7 rounded-full bg-gradient-to-br ${g} border-2 border-[#1e1e1e] flex items-center justify-center text-[8px] text-white font-bold`}>
                                                    {["T", "A", "B", "C"][i]}
                                                </div>
                                            ))}
                                        </div>
                                        <div className="text-xs text-white/20 font-mono">4명 참여 중</div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Floating elements */}
                        <motion.div animate={{ y: [0, -10, 0] }} transition={{ repeat: Infinity, duration: 4 }} className="absolute -left-4 lg:-left-10 top-12 lg:top-20 w-14 h-14 bg-white rounded-2xl shadow-xl flex items-center justify-center border border-slate-50 z-20">
                            <PenTool className="w-7 h-7 text-[#E05024]" />
                        </motion.div>
                        <motion.div animate={{ y: [0, 12, 0] }} transition={{ repeat: Infinity, duration: 5, delay: 1 }} className="absolute -right-4 lg:-right-10 top-28 lg:top-40 w-12 h-12 bg-white rounded-2xl shadow-xl flex items-center justify-center border border-slate-50 z-20">
                            <Users className="w-6 h-6 text-[#084734]" />
                        </motion.div>
                    </motion.div>
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
                        <p className="text-sm font-semibold text-[#E05024] tracking-wider uppercase mb-3">WHY CLASSIN</p>
                        <h2 className="text-3xl md:text-4xl lg:text-5xl font-serif text-[#1a1a19] leading-tight">
                            회의용 도구로 수업하던 시대는
                            <br className="hidden sm:block" />
                            <span className="text-[#E05024]">끝났습니다</span>
                        </h2>
                    </motion.div>

                    <div className="max-w-4xl mx-auto">
                        <div className="bg-white rounded-2xl border border-slate-200/60 shadow-lg overflow-hidden">
                            <div className="overflow-x-auto">
                                <table className="w-full text-sm">
                                    <thead>
                                        <tr className="bg-slate-50 border-b border-slate-100">
                                            <th className="text-left py-4 px-6 font-semibold text-slate-500 w-[30%]">구분</th>
                                            <th className="text-center py-4 px-6 font-semibold text-slate-400 w-[35%]">일반 화상 도구 (Zoom 등)</th>
                                            <th className="text-center py-4 px-6 font-bold text-[#E05024] w-[35%] border-l-2 border-[#E05024]/20">
                                                <span className="inline-flex items-center gap-1.5">
                                                    ClassIn
                                                    <span className="text-[10px] bg-[#E05024] text-white px-1.5 py-0.5 rounded-full font-bold">추천</span>
                                                </span>
                                            </th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {[
                                            { label: "주요 목적", zoom: "비즈니스 회의 · 정보 전달", classin: "실시간 상호작용 · 교육" },
                                            { label: "판서 기능", zoom: "기본적인 그리기 위주", classin: "레이어 기반 전문 교구 활용" },
                                            { label: "학생 참여", zoom: "채팅 또는 음소거 해제", classin: "교재 직접 조작 · 능동 참여" },
                                            { label: "수업 도구", zoom: "화면 공유 + 기본 그리기", classin: "30여 가지 인터랙티브 도구" },
                                            { label: "수업 활동", zoom: "없음 (별도 앱 필요)", classin: "10가지 참여형 수업 활동" },
                                            { label: "학습 관리", zoom: "별도 LMS 필요", classin: "플랫폼 내 학습 데이터 축적" },
                                            { label: "수업 형태", zoom: "화상 회의 1가지", classin: "1:1 ~ 수백 명 대형 강의" },
                                            { label: "녹화 · 복습", zoom: "파일 수동 관리", classin: "클라우드 자동 저장 · 복습" },
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
                                                <td className="py-4 px-6 text-center text-slate-400">
                                                    <span className="inline-flex items-center gap-1.5">
                                                        <X className="w-3.5 h-3.5 text-slate-300 shrink-0" />
                                                        {row.zoom}
                                                    </span>
                                                </td>
                                                <td className="py-4 px-6 text-center text-slate-900 font-medium bg-[#E05024]/[0.02] border-l-2 border-[#E05024]/10">
                                                    <span className="inline-flex items-center gap-1.5">
                                                        <CheckCircle2 className="w-4 h-4 text-[#E05024] shrink-0" />
                                                        {row.classin}
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
                                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#E05024]/5 text-[#E05024] text-sm font-bold mb-6">
                                    <PenTool className="w-4 h-4" />양방향 블랙보드
                                </div>
                                <h2 className="text-3xl md:text-5xl font-serif text-[#1a1a19] mb-6 leading-tight">
                                    교사만 쓰는 칠판은<br /><span className="text-[#E05024]">칠판이 아닙니다</span>
                                </h2>
                                <p className="text-lg text-slate-500 leading-relaxed font-medium mb-10">교사의 판서를 보기만 하던 시대는 끝났습니다. 학생에게 권한을 주어 직접 문제를 풀고, 그림을 그리고, 아이디어를 표현하게 하세요.</p>
                            </motion.div>
                            <div className="space-y-5">
                                {[
                                    { icon: <Users className="w-5 h-5" />, label: "학생 동시 판서", detail: "여러 학생이 동시에 같은 화면에서 필기합니다. 그룹 토론과 협업이 자연스럽게." },
                                    { icon: <Layers className="w-5 h-5" />, label: "레이어 기반 교구", detail: "단순 그리기가 아닌, 레이어·도형·수식 편집기를 갖춘 전문 교육 도구." },
                                    { icon: <BookOpen className="w-5 h-5" />, label: "교재 위에 직접 풀기", detail: "PDF, PPT 교재를 올리고 그 위에 바로 필기. 종이 프린트가 필요 없습니다." },
                                ].map((f, i) => (
                                    <motion.div key={i} {...stagger(i)} className="flex items-start gap-4">
                                        <div className="w-11 h-11 rounded-xl bg-[#E05024]/5 text-[#E05024] flex items-center justify-center shrink-0">{f.icon}</div>
                                        <div><h4 className="font-bold text-slate-900 mb-1">{f.label}</h4><p className="text-sm text-slate-500 leading-relaxed">{f.detail}</p></div>
                                    </motion.div>
                                ))}
                            </div>
                        </div>

                        {/* Blackboard mockup with SVG drawing */}
                        <div className="flex-1 w-full max-w-lg">
                            <motion.div {...fadeUp} className="relative">
                                <div className="aspect-[4/3] rounded-3xl bg-gradient-to-br from-slate-800 to-slate-900 border border-slate-700/50 shadow-2xl overflow-hidden p-6 md:p-8 flex flex-col">
                                    <div className="flex gap-2 mb-4">
                                        {["#E05024", "#3B82F6", "#10B981", "#F59E0B"].map(c => (
                                            <div key={c} className="w-5 h-5 rounded-full border-2 border-white/20" style={{ backgroundColor: c }} />
                                        ))}
                                    </div>
                                    <div className="flex-1 relative">
                                        <svg className="w-full h-full" viewBox="0 0 300 200" fill="none">
                                            <motion.path d="M20,30 C60,10 100,50 140,30 S220,40 280,25" stroke="white" strokeWidth="2.5" strokeOpacity="0.4" strokeLinecap="round" initial={{ pathLength: 0 }} whileInView={{ pathLength: 1 }} viewport={{ once: true }} transition={{ duration: 2, delay: 0.3 }} />
                                            <motion.path d="M20,70 L80,70 L80,120 L140,120 L140,90" stroke="#3B82F6" strokeWidth="2" strokeOpacity="0.5" strokeLinecap="round" initial={{ pathLength: 0 }} whileInView={{ pathLength: 1 }} viewport={{ once: true }} transition={{ duration: 2, delay: 0.8 }} />
                                            <motion.path d="M180,80 C200,60 230,100 260,75" stroke="#10B981" strokeWidth="2.5" strokeOpacity="0.5" strokeLinecap="round" initial={{ pathLength: 0 }} whileInView={{ pathLength: 1 }} viewport={{ once: true }} transition={{ duration: 1.5, delay: 1.3 }} />
                                            <motion.circle cx="60" cy="160" r="20" stroke="#E05024" strokeWidth="2" strokeOpacity="0.4" fill="none" initial={{ pathLength: 0 }} whileInView={{ pathLength: 1 }} viewport={{ once: true }} transition={{ duration: 1.5, delay: 1.8 }} />
                                            <motion.path d="M120,150 L160,170 L200,145 L240,165" stroke="#F59E0B" strokeWidth="2" strokeOpacity="0.4" strokeLinecap="round" initial={{ pathLength: 0 }} whileInView={{ pathLength: 1 }} viewport={{ once: true }} transition={{ duration: 1.5, delay: 2.2 }} />
                                        </svg>
                                        {/* Animated cursors */}
                                        <motion.div animate={{ x: [170, 210, 250], y: [65, 50, 70] }} transition={{ duration: 3, repeat: Infinity, repeatType: "reverse" }} className="absolute w-3 h-3">
                                            <div className="w-3 h-3 rounded-full bg-[#10B981] animate-cursor-blink shadow-[0_0_10px_rgba(16,185,129,0.6)]" />
                                            <div className="absolute -top-5 left-4 text-[9px] text-[#10B981] font-mono bg-[#10B981]/10 px-1.5 py-0.5 rounded whitespace-nowrap">학생 A</div>
                                        </motion.div>
                                        <motion.div animate={{ x: [110, 150, 190], y: [140, 155, 140] }} transition={{ duration: 4, repeat: Infinity, repeatType: "reverse", delay: 1 }} className="absolute w-3 h-3">
                                            <div className="w-3 h-3 rounded-full bg-[#F59E0B] animate-cursor-blink shadow-[0_0_10px_rgba(245,158,11,0.6)]" />
                                            <div className="absolute -top-5 left-4 text-[9px] text-[#F59E0B] font-mono bg-[#F59E0B]/10 px-1.5 py-0.5 rounded whitespace-nowrap">학생 B</div>
                                        </motion.div>
                                    </div>
                                    <div className="flex items-center justify-between pt-3 border-t border-white/10">
                                        <div className="flex -space-x-2">
                                            {["T", "A", "B", "C"].map((l, i) => (
                                                <div key={i} className={`w-7 h-7 rounded-full bg-gradient-to-br ${["from-[#E05024] to-orange-400", "from-blue-500 to-cyan-400", "from-green-500 to-emerald-400", "from-yellow-500 to-amber-400"][i]} border-2 border-slate-800 flex items-center justify-center text-[8px] text-white font-bold`}>{l}</div>
                                            ))}
                                        </div>
                                        <motion.div animate={{ opacity: [0.5, 1, 0.5] }} transition={{ duration: 2, repeat: Infinity }} className="text-xs text-white/30 font-mono">4명 참여 중</motion.div>
                                    </div>
                                </div>
                                {/* Floating badge with count-up */}
                                <motion.div initial={{ opacity: 0, scale: 0.8 }} whileInView={{ opacity: 1, scale: 1 }} viewport={{ once: true }} transition={{ delay: 0.5, type: "spring" }} className="absolute -top-3 -right-3 bg-white rounded-2xl shadow-lg border border-slate-100 px-4 py-2.5">
                                    <div className="text-xs text-slate-400 mb-0.5">동시 판서</div>
                                    <div className="text-lg font-bold text-[#E05024]">4명</div>
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
                        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-sm font-bold mb-6" style={{ backgroundColor: "#7C3AED10", color: "#7C3AED" }}>
                            <Dice1 className="w-4 h-4" />수업 도구 · 수업 활동
                        </div>
                        <h2 className="text-3xl md:text-5xl font-serif text-[#1a1a19] mb-4 leading-tight">
                            수업이 지루할 틈이 <span className="text-[#7C3AED]">없습니다</span>
                        </h2>
                        <p className="text-lg text-slate-500 max-w-2xl mx-auto">30여 가지 인터랙티브 도구와 10가지 참여형 수업 활동이 교실에 활력을 불어넣습니다.</p>
                    </motion.div>

                    {/* 30+ 수업 도구 — categorized grid */}
                    <div className="max-w-5xl mx-auto mb-20">
                        <motion.h3 {...fadeUp} className="text-sm font-bold text-slate-400 tracking-wider uppercase mb-6 text-center">30+ 수업 도구</motion.h3>
                        {[
                            {
                                category: "판서 & 교구",
                                color: "border-[#e8e8e4]",
                                tools: [
                                    { icon: <PenTool className="w-5 h-5" />, label: "판서 펜", color: "text-[#B85C33]", featured: true },
                                    { icon: <Layout className="w-5 h-5" />, label: "화이트보드", color: "text-[#084734]", featured: true },
                                    { icon: <Layers className="w-5 h-5" />, label: "레이어", color: "text-teal-500" },
                                    { icon: <FileText className="w-5 h-5" />, label: "수식 편집기", color: "text-[#084734]" },
                                    { icon: <Layout className="w-5 h-5" />, label: "도형 도구", color: "text-[#A39E98]" },
                                    { icon: <MousePointerClick className="w-5 h-5" />, label: "포인터", color: "text-[#B85C33]" },
                                ],
                            },
                            {
                                category: "게임 & 참여",
                                color: "border-[#e8e8e4]",
                                tools: [
                                    { icon: <Timer className="w-5 h-5" />, label: "타이머", color: "text-[#084734]", featured: true },
                                    { icon: <Dice1 className="w-5 h-5" />, label: "주사위", color: "text-[#065c41]" },
                                    { icon: <Users className="w-5 h-5" />, label: "랜덤 뽑기", color: "text-green-500" },
                                    { icon: <Sparkles className="w-5 h-5" />, label: "슬롯머신", color: "text-orange-500" },
                                    { icon: <Zap className="w-5 h-5" />, label: "응답기", color: "text-yellow-500" },
                                    { icon: <Sparkles className="w-5 h-5" />, label: "보상 스티커", color: "text-yellow-500" },
                                ],
                            },
                            {
                                category: "미디어 & 공유",
                                color: "border-[#e8e8e4]",
                                tools: [
                                    { icon: <FileText className="w-5 h-5" />, label: "PDF 뷰어", color: "text-[#B85C33]" },
                                    { icon: <Cloud className="w-5 h-5" />, label: "클라우드", color: "text-[#084734]" },
                                    { icon: <Video className="w-5 h-5" />, label: "녹화", color: "text-[#B85C33]" },
                                    { icon: <Mic className="w-5 h-5" />, label: "오디오", color: "text-emerald-500" },
                                    { icon: <Monitor className="w-5 h-5" />, label: "화면 공유", color: "text-[#065c41]" },
                                    { icon: <Play className="w-5 h-5" />, label: "영상 재생", color: "text-[#084734]" },
                                    { icon: <Wifi className="w-5 h-5" />, label: "미러링", color: "text-[#065c41]" },
                                    { icon: <Cloud className="w-5 h-5" />, label: "EDB 교구", color: "text-orange-400" },
                                ],
                            },
                            {
                                category: "관리 & 소통",
                                color: "border-green-100",
                                tools: [
                                    { icon: <MessageSquare className="w-5 h-5" />, label: "채팅", color: "text-[#084734]" },
                                    { icon: <BarChart3 className="w-5 h-5" />, label: "투표", color: "text-[#065c41]" },
                                    { icon: <BookOpen className="w-5 h-5" />, label: "교재 업로드", color: "text-amber-500" },
                                    { icon: <GraduationCap className="w-5 h-5" />, label: "퀴즈", color: "text-[#084734]", featured: true },
                                    { icon: <Globe className="w-5 h-5" />, label: "웹 브라우저", color: "text-slate-500" },
                                    { icon: <Shield className="w-5 h-5" />, label: "잠금", color: "text-gray-500" },
                                    { icon: <Clock className="w-5 h-5" />, label: "스톱워치", color: "text-[#084734]" },
                                    { icon: <CheckCircle2 className="w-5 h-5" />, label: "출석 체크", color: "text-green-600" },
                                    { icon: <BookOpen className="w-5 h-5" />, label: "노트 저장", color: "text-emerald-400" },
                                    { icon: <ArrowRight className="w-5 h-5" />, label: "화면 이동", color: "text-slate-400" },
                                ],
                            },
                        ].map((group, gi) => (
                            <div key={gi} className="mb-8">
                                <motion.div {...fadeUp} className="flex items-center gap-2 mb-3">
                                    <div className={`h-px flex-1 border-t ${group.color}`} />
                                    <span className="text-xs font-bold text-slate-400 tracking-wider uppercase px-2">{group.category}</span>
                                    <div className={`h-px flex-1 border-t ${group.color}`} />
                                </motion.div>
                                <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-6 gap-3">
                                    {group.tools.map((tool, ti) => (
                                        <motion.div
                                            key={ti}
                                            initial={{ opacity: 0, scale: 0.85 }}
                                            whileInView={{ opacity: 1, scale: 1 }}
                                            viewport={{ once: true }}
                                            transition={{ delay: (gi * 6 + ti) * 0.02 }}
                                            className={`flex flex-col items-center gap-2 rounded-xl bg-white border border-slate-100 hover:shadow-md hover:scale-105 transition-all cursor-pointer group ${tool.featured ? "p-4 col-span-1 sm:col-span-1 ring-1 ring-[#7C3AED]/10 bg-[#7C3AED]/[0.02]" : "p-3"}`}
                                        >
                                            <div className={`${tool.color} group-hover:scale-110 transition-transform`}>{tool.icon}</div>
                                            <span className={`font-bold text-slate-600 text-center leading-tight ${tool.featured ? "text-xs" : "text-[11px]"}`}>{tool.label}</span>
                                        </motion.div>
                                    ))}
                                </div>
                            </div>
                        ))}
                    </div>

                    {/* 10가지 수업 활동 */}
                    <div className="max-w-5xl mx-auto">
                        <motion.h3 {...fadeUp} className="text-sm font-bold text-slate-400 tracking-wider uppercase mb-6 text-center">10가지 수업 활동</motion.h3>
                        <div className="grid sm:grid-cols-2 lg:grid-cols-5 gap-4">
                            {[
                                { label: "그룹 토론", desc: "방 분리 후 동시 토론", icon: <MessageSquare className="w-5 h-5" />, color: "from-[#ECFDF5] to-[#D1FAE5]", border: "border-[#D1FAE5]", iconColor: "text-[#084734]" },
                                { label: "1:1 퀴즈 대결", desc: "실시간 맞대결 형식", icon: <Zap className="w-5 h-5" />, color: "from-[#FEF3EE] to-[#f0f0ec]", border: "border-[#F6D5C5]", iconColor: "text-[#B85C33]" },
                                { label: "팀 프로젝트", desc: "공동 판서 협업", icon: <Users className="w-5 h-5" />, color: "from-green-50 to-emerald-50", border: "border-green-100", iconColor: "text-green-500" },
                                { label: "발표 수업", desc: "학생 화면 공유 발표", icon: <Monitor className="w-5 h-5" />, color: "from-[#D1FAE5] to-[#ECFDF5]", border: "border-[#D1FAE5]", iconColor: "text-[#065c41]" },
                                { label: "실시간 투표", desc: "의견 수렴 · 결과 시각화", icon: <BarChart3 className="w-5 h-5" />, color: "from-amber-50 to-yellow-50", border: "border-amber-100", iconColor: "text-amber-500" },
                                { label: "릴레이 풀이", desc: "순서대로 문제 풀기", icon: <ArrowRight className="w-5 h-5" />, color: "from-[#ECFDF5] to-[#f7f7f5]", border: "border-[#e8e8e4]", iconColor: "text-[#084734]" },
                                { label: "타임어택", desc: "제한 시간 내 문제 풀기", icon: <Timer className="w-5 h-5" />, color: "from-orange-50 to-amber-50", border: "border-orange-100", iconColor: "text-orange-500" },
                                { label: "모둠 경쟁", desc: "팀별 점수 대결", icon: <Sparkles className="w-5 h-5" />, color: "from-[#FEF3EE] to-[#f0f0ec]", border: "border-[#F6D5C5]", iconColor: "text-[#B85C33]" },
                                { label: "자유 판서", desc: "전체 학생 동시 판서", icon: <PenTool className="w-5 h-5" />, color: "from-[#ECFDF5] to-[#D1FAE5]", border: "border-[#D1FAE5]", iconColor: "text-[#065c41]" },
                                { label: "피드백 라운드", desc: "상호 평가 · 코멘트", icon: <CheckCircle2 className="w-5 h-5" />, color: "from-teal-50 to-green-50", border: "border-teal-100", iconColor: "text-teal-500" },
                            ].map((act, i) => (
                                <motion.div key={i} {...stagger(i)} className={`rounded-2xl bg-gradient-to-br ${act.color} border ${act.border} p-5 hover:shadow-lg transition-all cursor-pointer text-center group`}>
                                    <div className={`${act.iconColor} mb-2 flex justify-center group-hover:scale-110 transition-transform`}>{act.icon}</div>
                                    <h4 className="font-bold text-slate-900 mb-1 text-sm">{act.label}</h4>
                                    <p className="text-[11px] text-slate-500">{act.desc}</p>
                                </motion.div>
                            ))}
                        </div>
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
                        <p className="text-sm font-semibold text-[#E05024] tracking-wider uppercase mb-3">FLEXIBLE FORMAT</p>
                        <h2 className="text-3xl md:text-4xl lg:text-5xl font-serif text-[#1a1a19] leading-tight">
                            1:1 과외부터 수백 명 강의까지,<br /><span className="text-[#E05024]">하나의 플랫폼</span>
                        </h2>
                    </motion.div>

                    <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5 max-w-5xl mx-auto">
                        {[
                            { icon: <Users className="w-7 h-7" />, title: "1:1 과외", desc: "개인 맞춤 수업에 최적화된 집중 환경", people: 1, color: "bg-[#ECFDF5] border-[#D1FAE5] text-[#084734]", dotColor: "bg-[#084734]" },
                            { icon: <MessageSquare className="w-7 h-7" />, title: "소그룹 토론", desc: "그룹별 방 분리, 동시 판서, 발표 기능", people: 6, color: "bg-green-50 border-green-100 text-green-600", dotColor: "bg-green-400" },
                            { icon: <Monitor className="w-7 h-7" />, title: "일반 수업", desc: "학원 · 학교의 표준 수업 형태", people: 12, color: "bg-[#D1FAE5] border-[#D1FAE5] text-[#065c41]", dotColor: "bg-[#065c41]" },
                            { icon: <GraduationCap className="w-7 h-7" />, title: "대형 강의", desc: "수백 명이 동시 참여하는 라이브 강의", people: 20, color: "bg-orange-50 border-orange-100 text-orange-600", dotColor: "bg-orange-400" },
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
                                <div className="w-14 h-14 rounded-2xl bg-white/80 flex items-center justify-center mx-auto mb-4 shadow-sm">{item.icon}</div>
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

                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-[#E05024]/5 rounded-full blur-[120px] pointer-events-none" />

                <div className="container mx-auto px-4 lg:px-8 relative" ref={networkRef}>
                    <motion.div className="text-center mb-16" {...fadeUp}>
                        <p className="text-sm font-semibold text-[#E05024] tracking-wider uppercase mb-3">GLOBAL NETWORK</p>
                        <h2 className="text-3xl md:text-4xl lg:text-5xl font-serif leading-tight">전 세계 어디서든,<br /><span className="text-[#E05024]">끊김 없이</span></h2>
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
                                {i < 2 && <div className="absolute right-0 top-1/2 -translate-y-1/2 w-px h-1/2 bg-gradient-to-b from-transparent via-[#E05024]/20 to-transparent hidden sm:block" />}
                                <div className="w-14 h-14 rounded-xl bg-[#E05024]/15 text-[#E05024] flex items-center justify-center mx-auto mb-4 group-hover:scale-110 transition-transform">{item.icon}</div>
                                <div className="text-3xl font-serif font-bold text-white mb-1">{item.value}</div>
                                <div className="text-sm font-bold text-[#E05024] mb-2">{item.label}</div>
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
                                <h2 className="text-3xl md:text-5xl font-serif text-[#1a1a19] mb-6 leading-tight">수업이 끝나도<br /><span className="text-[#084734]">학습은 계속됩니다</span></h2>
                                <p className="text-lg text-slate-500 leading-relaxed font-medium mb-10">자동 녹화, 학습 데이터 분석, 숙제·출결·평가까지. 수업 전후의 모든 학사 행정을 하나의 플랫폼에서.</p>
                            </motion.div>
                            <div className="space-y-5">
                                {[
                                    { icon: <Video className="w-5 h-5" />, label: "자동 녹화 · 복습", detail: "수업 종료 후 클라우드에 자동 저장. 학생이 언제든 다시 볼 수 있습니다." },
                                    { icon: <BarChart3 className="w-5 h-5" />, label: "학습 데이터 리포트", detail: "집중도, 발언 횟수, 참여 시간을 데이터로. 학부모 상담이 객관적으로 바뀝니다." },
                                    { icon: <FileText className="w-5 h-5" />, label: "LMS 올인원", detail: "숙제 제출, 평가, 출결 관리 — 별도 LMS 없이 ClassIn 안에서 모두 해결." },
                                ].map((f, i) => (
                                    <motion.div key={i} {...stagger(i)} className="flex items-start gap-4">
                                        <div className="w-11 h-11 rounded-xl bg-[#084734]/5 text-[#084734] flex items-center justify-center shrink-0">{f.icon}</div>
                                        <div><h4 className="font-bold text-slate-900 mb-1">{f.label}</h4><p className="text-sm text-slate-500 leading-relaxed">{f.detail}</p></div>
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
                                            <div className="text-white text-3xl font-bold">상위 15%</div>
                                        </div>
                                    </div>

                                    {/* Bar chart */}
                                    <div className="h-44 flex items-end justify-between gap-3 border-b border-slate-700/50 pb-4 mb-4 relative">
                                        <div className="absolute w-full border-b border-dashed border-slate-700/30 top-1/2 -translate-y-1/2"></div>
                                        {[30, 45, 60, 50, 75, 90, 85].map((h, i) => (
                                            <motion.div key={i} initial={{ height: 0 }} whileInView={{ height: `${h}%` }} viewport={{ once: true }} transition={{ delay: 0.3 + i * 0.1, duration: 0.8, type: "spring" }} className="w-full bg-gradient-to-t from-[#084734]/20 to-[#6EE7B7] rounded-t-md relative z-10 group">
                                                <div className="absolute -top-6 left-1/2 -translate-x-1/2 text-[9px] text-[#6EE7B7] font-mono opacity-0 group-hover:opacity-100 transition-opacity">{h}%</div>
                                            </motion.div>
                                        ))}
                                    </div>
                                    <div className="flex justify-between text-slate-500 text-[10px] font-mono px-1 mb-6">
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
                                                <div className={`text-lg font-bold font-mono ${s.color}`}>{s.value}</div>
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
                                <div className="text-sm font-bold text-green-500 font-mono">87%</div>
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
                        <h2 className="text-3xl md:text-5xl font-serif text-[#1a1a19] leading-tight">
                            전국의 교육자들이 <span className="text-[#E05024]">인정하는</span> 솔루션
                        </h2>
                    </motion.div>

                    <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6 md:gap-8 items-start">
                        <div className="space-y-6 md:space-y-8">
                            <TestimonialCard name="John Kim" role="대치 A수학 대표원장" quote="줌에서 옮긴 뒤로 학생들의 수업 참여도가 확 달라졌습니다. 판서를 학생에게 넘길 수 있다는 것만으로도 수업의 질이 완전히 바뀌었어요." rating={5} gradient="from-[#E05024] to-orange-400" />
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

            <OnboardingSection />

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
