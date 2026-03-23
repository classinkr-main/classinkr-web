"use client"

import { Button } from "@/components/ui/button"
import { motion, useInView, useMotionValue, useTransform, useScroll, useMotionValueEvent, animate } from "framer-motion"
import {
    Play, ArrowRight, Sparkles, Monitor, Layers, MousePointerClick,
    Clock, Users, PenTool, Dice1, FileText, Layout, Video,
    Globe, Wifi, BarChart3, BookOpen, Cloud, Timer, Mic,
    MessageSquare, GraduationCap, CheckCircle2, Zap, Shield,
    Star, X
} from "lucide-react"
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
    return (
        <div className="w-14 sm:w-20 md:w-28 h-[4.5rem] sm:h-28 md:h-36 bg-white border border-slate-200/80 shadow-[0_2px_20px_rgba(0,0,0,0.04)] rounded-xl md:rounded-2xl flex items-center justify-center relative overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-b from-slate-50/80 to-transparent h-1/2"></div>
            <motion.div
                className="flex flex-col items-center"
                initial={{ y: 0 }}
                animate={trigger ? { y: -(num * 10) + "%" } : {}}
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
            interval = setInterval(() => setLiveCount((p) => p + 1), 3000 + Math.random() * 2000)
        }, 3000)
        return () => { clearTimeout(timeout); clearInterval(interval) }
    }, [slotsDone])

    const particles = useMemo(() => {
        const count = typeof window !== "undefined" && window.innerWidth < 640 ? 8 : 15
        return Array.from({ length: count }, (_, i) => ({
            x: Math.random() * 100, size: 3 + Math.random() * 5,
            duration: 8 + Math.random() * 10, delayStart: Math.random() * 6, key: i,
        }))
    }, [])

    const handleLastSlotDone = useCallback(() => setSlotsDone(true), [])
    const displayDigits = useMemo(() => (1341483 + liveCount).toString().split(""), [liveCount])

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

                <motion.p initial={{ opacity: 0, y: 10 }} animate={phase >= 2 ? { opacity: 1, y: 0 } : {}} transition={{ duration: 0.5 }} className="text-base sm:text-lg text-slate-400 font-medium mb-8 max-w-xl mx-auto">하나의 플랫폼으로 수업한 전국 2,400개 학원이 되찾은 시간</motion.p>
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
                    <StatCard value={2400} suffix="+" label="줌 대신 선택한 학원" icon={<Monitor className="w-5 h-5" />} delay={0} trigger={phase >= 3} />
                    <StatCard value={30} suffix="+" label="인터랙티브 수업 도구" icon={<MousePointerClick className="w-5 h-5" />} delay={0.1} trigger={phase >= 3} />
                    <StatCard value={10} suffix="가지" label={"참여형\n수업 활동"} icon={<Layers className="w-5 h-5" />} delay={0.2} trigger={phase >= 3} />
                    <StatCard value={98} suffix="%" label={`"과거로 못 돌아간다"\n응답률`} icon={<Sparkles className="w-5 h-5" />} delay={0.3} trigger={phase >= 3} />
                </div>
                <motion.p initial={{ opacity: 0, letterSpacing: "0.3em" }} animate={phase >= 3 ? { opacity: 1, letterSpacing: "0.05em" } : {}} transition={{ delay: 0.5, duration: 0.8 }} className="text-lg sm:text-xl font-serif text-slate-600 font-medium mb-10">수업만을 위해 만든 플랫폼, 다음은 당신의 교실입니다</motion.p>
                <motion.div initial={{ opacity: 0, y: 20 }} animate={phase >= 3 ? { opacity: 1, y: 0 } : {}} transition={{ delay: 0.7, type: "spring", stiffness: 200, damping: 25 }} className="flex flex-col items-center gap-4">
                    <Button className="bg-[#E05024] hover:bg-[#C9431A] text-white rounded-full px-10 h-14 text-base font-bold animate-glow-pulse transition-all hover:scale-105 group">지금 무료로 시작하기<ArrowRight className="w-4 h-4 ml-2 group-hover:translate-x-1 transition-transform" /></Button>
                    <p className="text-xs sm:text-sm text-slate-400 font-medium">설치 없이 바로 체험 · 카드 등록 불필요</p>
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
                                <Button className="bg-[#E05024] hover:bg-[#C9431A] text-white rounded-full px-8 h-14 text-base font-bold shadow-[0_8px_20px_rgba(224,80,36,0.3)] hover:shadow-[0_12px_25px_rgba(224,80,36,0.4)] transition-all hover:scale-105 group">
                                    무료로 시작하기
                                    <ArrowRight className="w-4 h-4 ml-2 group-hover:translate-x-1 transition-transform" />
                                </Button>
                                <Button variant="outline" className="rounded-full px-8 h-14 text-base font-bold border-slate-300 text-slate-700 hover:bg-slate-50 hover:border-slate-400 transition-all hover:scale-105">
                                    <Play className="w-4 h-4 mr-2" />
                                    3분 데모 영상
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
                            <Users className="w-6 h-6 text-blue-500" />
                        </motion.div>
                    </motion.div>
                </div>
            </section>

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
                                color: "border-red-100",
                                tools: [
                                    { icon: <PenTool className="w-5 h-5" />, label: "판서 펜", color: "text-red-500", featured: true },
                                    { icon: <Layout className="w-5 h-5" />, label: "화이트보드", color: "text-blue-500", featured: true },
                                    { icon: <Layers className="w-5 h-5" />, label: "레이어", color: "text-teal-500" },
                                    { icon: <FileText className="w-5 h-5" />, label: "수식 편집기", color: "text-indigo-600" },
                                    { icon: <Layout className="w-5 h-5" />, label: "도형 도구", color: "text-pink-400" },
                                    { icon: <MousePointerClick className="w-5 h-5" />, label: "포인터", color: "text-red-500" },
                                ],
                            },
                            {
                                category: "게임 & 참여",
                                color: "border-violet-100",
                                tools: [
                                    { icon: <Timer className="w-5 h-5" />, label: "타이머", color: "text-violet-500", featured: true },
                                    { icon: <Dice1 className="w-5 h-5" />, label: "주사위", color: "text-indigo-500" },
                                    { icon: <Users className="w-5 h-5" />, label: "랜덤 뽑기", color: "text-green-500" },
                                    { icon: <Sparkles className="w-5 h-5" />, label: "슬롯머신", color: "text-orange-500" },
                                    { icon: <Zap className="w-5 h-5" />, label: "응답기", color: "text-yellow-500" },
                                    { icon: <Sparkles className="w-5 h-5" />, label: "보상 스티커", color: "text-yellow-500" },
                                ],
                            },
                            {
                                category: "미디어 & 공유",
                                color: "border-blue-100",
                                tools: [
                                    { icon: <FileText className="w-5 h-5" />, label: "PDF 뷰어", color: "text-rose-500" },
                                    { icon: <Cloud className="w-5 h-5" />, label: "클라우드", color: "text-sky-500" },
                                    { icon: <Video className="w-5 h-5" />, label: "녹화", color: "text-red-400" },
                                    { icon: <Mic className="w-5 h-5" />, label: "오디오", color: "text-emerald-500" },
                                    { icon: <Monitor className="w-5 h-5" />, label: "화면 공유", color: "text-cyan-500" },
                                    { icon: <Play className="w-5 h-5" />, label: "영상 재생", color: "text-violet-400" },
                                    { icon: <Wifi className="w-5 h-5" />, label: "미러링", color: "text-cyan-600" },
                                    { icon: <Cloud className="w-5 h-5" />, label: "EDB 교구", color: "text-orange-400" },
                                ],
                            },
                            {
                                category: "관리 & 소통",
                                color: "border-green-100",
                                tools: [
                                    { icon: <MessageSquare className="w-5 h-5" />, label: "채팅", color: "text-blue-400" },
                                    { icon: <BarChart3 className="w-5 h-5" />, label: "투표", color: "text-purple-500" },
                                    { icon: <BookOpen className="w-5 h-5" />, label: "교재 업로드", color: "text-amber-500" },
                                    { icon: <GraduationCap className="w-5 h-5" />, label: "퀴즈", color: "text-pink-500", featured: true },
                                    { icon: <Globe className="w-5 h-5" />, label: "웹 브라우저", color: "text-slate-500" },
                                    { icon: <Shield className="w-5 h-5" />, label: "잠금", color: "text-gray-500" },
                                    { icon: <Clock className="w-5 h-5" />, label: "스톱워치", color: "text-blue-600" },
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
                                { label: "그룹 토론", desc: "방 분리 후 동시 토론", icon: <MessageSquare className="w-5 h-5" />, color: "from-blue-50 to-sky-50", border: "border-blue-100", iconColor: "text-blue-500" },
                                { label: "1:1 퀴즈 대결", desc: "실시간 맞대결 형식", icon: <Zap className="w-5 h-5" />, color: "from-red-50 to-rose-50", border: "border-red-100", iconColor: "text-red-500" },
                                { label: "팀 프로젝트", desc: "공동 판서 협업", icon: <Users className="w-5 h-5" />, color: "from-green-50 to-emerald-50", border: "border-green-100", iconColor: "text-green-500" },
                                { label: "발표 수업", desc: "학생 화면 공유 발표", icon: <Monitor className="w-5 h-5" />, color: "from-purple-50 to-violet-50", border: "border-purple-100", iconColor: "text-purple-500" },
                                { label: "실시간 투표", desc: "의견 수렴 · 결과 시각화", icon: <BarChart3 className="w-5 h-5" />, color: "from-amber-50 to-yellow-50", border: "border-amber-100", iconColor: "text-amber-500" },
                                { label: "릴레이 풀이", desc: "순서대로 문제 풀기", icon: <ArrowRight className="w-5 h-5" />, color: "from-cyan-50 to-sky-50", border: "border-cyan-100", iconColor: "text-cyan-600" },
                                { label: "타임어택", desc: "제한 시간 내 문제 풀기", icon: <Timer className="w-5 h-5" />, color: "from-orange-50 to-amber-50", border: "border-orange-100", iconColor: "text-orange-500" },
                                { label: "모둠 경쟁", desc: "팀별 점수 대결", icon: <Sparkles className="w-5 h-5" />, color: "from-pink-50 to-rose-50", border: "border-pink-100", iconColor: "text-pink-500" },
                                { label: "자유 판서", desc: "전체 학생 동시 판서", icon: <PenTool className="w-5 h-5" />, color: "from-indigo-50 to-blue-50", border: "border-indigo-100", iconColor: "text-indigo-500" },
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
                            { icon: <Users className="w-7 h-7" />, title: "1:1 과외", desc: "개인 맞춤 수업에 최적화된 집중 환경", people: 1, color: "bg-blue-50 border-blue-100 text-blue-600", dotColor: "bg-blue-400" },
                            { icon: <MessageSquare className="w-7 h-7" />, title: "소그룹 토론", desc: "그룹별 방 분리, 동시 판서, 발표 기능", people: 6, color: "bg-green-50 border-green-100 text-green-600", dotColor: "bg-green-400" },
                            { icon: <Monitor className="w-7 h-7" />, title: "일반 수업", desc: "학원 · 학교의 표준 수업 형태", people: 12, color: "bg-purple-50 border-purple-100 text-purple-600", dotColor: "bg-purple-400" },
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
                                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-600/5 text-blue-600 text-sm font-bold mb-6"><BarChart3 className="w-4 h-4" />데이터 & LMS</div>
                                <h2 className="text-3xl md:text-5xl font-serif text-[#1a1a19] mb-6 leading-tight">수업이 끝나도<br /><span className="text-[#2563EB]">학습은 계속됩니다</span></h2>
                                <p className="text-lg text-slate-500 leading-relaxed font-medium mb-10">자동 녹화, 학습 데이터 분석, 숙제·출결·평가까지. 수업 전후의 모든 학사 행정을 하나의 플랫폼에서.</p>
                            </motion.div>
                            <div className="space-y-5">
                                {[
                                    { icon: <Video className="w-5 h-5" />, label: "자동 녹화 · 복습", detail: "수업 종료 후 클라우드에 자동 저장. 학생이 언제든 다시 볼 수 있습니다." },
                                    { icon: <BarChart3 className="w-5 h-5" />, label: "학습 데이터 리포트", detail: "집중도, 발언 횟수, 참여 시간을 데이터로. 학부모 상담이 객관적으로 바뀝니다." },
                                    { icon: <FileText className="w-5 h-5" />, label: "LMS 올인원", detail: "숙제 제출, 평가, 출결 관리 — 별도 LMS 없이 ClassIn 안에서 모두 해결." },
                                ].map((f, i) => (
                                    <motion.div key={i} {...stagger(i)} className="flex items-start gap-4">
                                        <div className="w-11 h-11 rounded-xl bg-blue-600/5 text-blue-600 flex items-center justify-center shrink-0">{f.icon}</div>
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
                                            <motion.div key={i} initial={{ height: 0 }} whileInView={{ height: `${h}%` }} viewport={{ once: true }} transition={{ delay: 0.3 + i * 0.1, duration: 0.8, type: "spring" }} className="w-full bg-gradient-to-t from-blue-500/20 to-blue-400 rounded-t-md relative z-10 group">
                                                <div className="absolute -top-6 left-1/2 -translate-x-1/2 text-[9px] text-blue-300 font-mono opacity-0 group-hover:opacity-100 transition-opacity">{h}%</div>
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
                                            { label: "발언", value: "12회", color: "text-blue-400" },
                                            { label: "참여 시간", value: "48분", color: "text-purple-400" },
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

            {/* ================================================================
                FINAL CTA
            ================================================================ */}
            <FinalCTASection />

        </div>
    )
}
