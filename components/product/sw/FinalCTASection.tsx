"use client"

import { motion, useMotionValueEvent, useScroll, useTransform } from "framer-motion"
import { ArrowRight, Clock, Layers, Monitor, MousePointerClick, Sparkles } from "lucide-react"
import Link from "next/link"
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react"

import { Button } from "@/components/ui/button"

import { CHECKOUT_CTA_LABEL, CHECKOUT_HREF, CHECKOUT_SUB_LABEL, trackCheckoutClick } from "./sw-checkout"
import { useCountUp } from "./useCountUp"

// SSR/hydration 불일치 없이 클라이언트 마운트 여부를 읽는다 (effect 내 setState 회피)
const noopSubscribe = () => () => {}
const useIsClient = () => useSyncExternalStore(noopSubscribe, () => true, () => false)

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

function AmbientParticle({
    x,
    size,
    duration,
    delayStart,
    className = "",
}: {
    x: number
    size: number
    duration: number
    delayStart: number
    className?: string
}) {
    return (
        <motion.div
            className={`absolute rounded-full bg-green-300/15 pointer-events-none ${className}`}
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

/* ── Final CTA Section ───────────────────────────────────────────── */
export default function FinalCTASection() {
    const sectionRef = useRef<HTMLElement>(null)
    const { scrollYProgress } = useScroll({ target: sectionRef, offset: ["start end", "end start"] })
    const [phase, setPhase] = useState(0)
    const [slotsDone, setSlotsDone] = useState(false)
    const [liveCount, setLiveCount] = useState(0)
    const particlesMounted = useIsClient()

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

    const particles = useMemo(() => createParticles(15), [])

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
                {particlesMounted
                    ? particles.map(({ key, ...rest }) => (
                        <AmbientParticle key={key} className={key >= 8 ? "hidden sm:block" : ""} {...rest} />
                    ))
                    : null}
            </motion.div>

            <div className="container mx-auto px-4 text-center max-w-5xl relative z-10">
                <motion.p initial={{ opacity: 0, y: 20 }} animate={phase >= 1 ? { opacity: 1, y: 0 } : {}} transition={{ duration: 0.7 }} className="text-xl sm:text-2xl md:text-3xl text-slate-500 font-sans font-medium leading-relaxed mb-3">줌 열고, 녹화 누르고, 숙제 올리고, 각각 연락하고...</motion.p>
                <motion.p initial={{ opacity: 0, y: 20 }} animate={phase >= 1 ? { opacity: 1, y: 0 } : {}} transition={{ duration: 0.7, delay: 0.35 }} className="text-xl sm:text-2xl md:text-3xl text-slate-700 font-sans font-semibold mb-8">수업 하나에 도구만 네 개...</motion.p>
                <motion.p initial={{ opacity: 0, filter: "blur(4px)" }} animate={phase >= 1 ? { opacity: 1, filter: "blur(0px)" } : {}} transition={{ duration: 0.8, delay: 0.7 }} className="text-lg sm:text-xl md:text-2xl text-[#22A366] font-sans font-medium italic mb-10">가르치는 일에만 집중할 수 있다면?</motion.p>
                <motion.div initial={{ opacity: 0, y: 10 }} animate={phase >= 1 ? { opacity: 1, y: 0 } : {}} transition={{ duration: 0.5, delay: 1.0 }} className="flex items-center justify-center gap-2 mb-14">
                    <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-green-50 border border-green-200/60 text-sm font-medium text-[#22A366]"><Clock className="w-3.5 h-3.5" />되찾은 수업 시간</div>
                </motion.div>

                <motion.p initial={{ opacity: 0, y: 10 }} animate={phase >= 2 ? { opacity: 1, y: 0 } : {}} transition={{ duration: 0.5 }} className="text-base sm:text-lg text-slate-400 font-medium mb-8 max-w-xl mx-auto">200개 기업 고객사가 Classin으로 되찾은 시간</motion.p>
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

