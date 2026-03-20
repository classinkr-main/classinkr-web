"use client"

import * as React from "react"
import { Slider } from "@/components/ui/slider"
import { Info, Sparkles } from "lucide-react"

// ── Border-draw entrance animation ─────────────────────────────────────────
function AnimatedBorder({ containerRef }: { containerRef: React.RefObject<HTMLDivElement | null> }) {
    const [dims, setDims] = React.useState<{ w: number; h: number } | null>(null)

    React.useEffect(() => {
        const el = containerRef.current
        if (!el) return
        const measure = () => {
            const { width, height } = el.getBoundingClientRect()
            if (width > 0) setDims({ w: width, h: height })
        }
        measure()
        // Fallback for SSR hydration delay
        const t = setTimeout(measure, 80)
        return () => clearTimeout(t)
    }, [containerRef])

    if (!dims) return null

    const rx = 40
    const straight = 2 * (dims.w - 2 * rx + dims.h - 2 * rx)
    const perimeter = straight + 2 * Math.PI * rx

    return (
        <svg
            style={{
                position: "absolute",
                inset: 0,
                width: "100%",
                height: "100%",
                pointerEvents: "none",
                zIndex: 50,
                overflow: "visible",
            }}
            xmlns="http://www.w3.org/2000/svg"
            aria-hidden
        >
            <defs>
                <linearGradient id="calc-border-grad" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="#818cf8" />
                    <stop offset="45%" stopColor="#a855f7" />
                    <stop offset="100%" stopColor="#38bdf8" />
                </linearGradient>
                <filter id="calc-border-glow">
                    <feGaussianBlur stdDeviation="4" result="blur" />
                    <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
                </filter>
            </defs>

            {/* Glow layer — fades out after draw */}
            <rect
                x={2} y={2}
                width={dims.w - 4} height={dims.h - 4}
                rx={rx} ry={rx}
                fill="none"
                stroke="url(#calc-border-grad)"
                strokeWidth={6}
                filter="url(#calc-border-glow)"
                style={{
                    strokeDasharray: perimeter,
                    strokeDashoffset: perimeter,
                    ["--border-perimeter" as string]: `${perimeter}`,
                    animation: `calculator-border-draw 1.4s cubic-bezier(0.4,0,0.2,1) 0.15s forwards, calculator-glow-fade 0.6s ease-in 1.7s forwards`,
                    opacity: 0.6,
                }}
            />

            {/* Sharp crisp border — stays briefly then fades */}
            <rect
                x={1} y={1}
                width={dims.w - 2} height={dims.h - 2}
                rx={rx} ry={rx}
                fill="none"
                stroke="url(#calc-border-grad)"
                strokeWidth={2}
                style={{
                    strokeDasharray: perimeter,
                    strokeDashoffset: perimeter,
                    ["--border-perimeter" as string]: `${perimeter}`,
                    animation: `calculator-border-draw 1.4s cubic-bezier(0.4,0,0.2,1) 0.15s forwards, calculator-glow-fade 0.5s ease-in 2s forwards`,
                }}
            />
        </svg>
    )
}

const EXCHANGE_RATE_CASH = 200;
const EXCHANGE_RATE_USD = 1440;
const MIN_BUSINESS_CASH = 10000;

export function PricingCalculator() {
    const containerRef = React.useRef<HTMLDivElement>(null)
    const [visible, setVisible] = React.useState(false)

    React.useEffect(() => {
        // Tiny delay so the layout is painted before we measure & animate
        const t = setTimeout(() => setVisible(true), 30)
        return () => clearTimeout(t)
    }, [])

    const [students, setStudents] = React.useState([10]) // On-stage students
    const [teachers, setTeachers] = React.useState([5])
    const [classCount, setClassCount] = React.useState(100)
    const [classDuration, setClassDuration] = React.useState(1)
    const [quality, setQuality] = React.useState("SD")
    const [hasRecord, setHasRecord] = React.useState(false)
    const [hasAssistant, setHasAssistant] = React.useState(false)
    const [hasWebLive, setHasWebLive] = React.useState(false)

    const studentsNum = students[0]
    const teachersNum = teachers[0]

    const pricing = React.useMemo(() => {
        const billedHoursPerClass = Math.ceil(classDuration / 0.5) * 0.5
        const totalBilledHours = classCount * billedHoursPerClass

        // [A] Business Model Calculation
        let perUserCost = 0
        if (studentsNum === 0) perUserCost = 1
        else if (studentsNum === 1) {
            if (quality === 'SD') perUserCost = 2
            else if (quality === 'HD') perUserCost = 4
            else if (quality === 'FHD') perUserCost = 8
        } else {
            if (quality === 'SD') perUserCost = 4
            else if (quality === 'HD') perUserCost = 12
            else if (quality === 'FHD') perUserCost = 20
        }

        const billedStudents = Math.min(studentsNum, 200)
        const totalBilledUsers = billedStudents + 1

        const classCashCost = perUserCost * totalBilledUsers * totalBilledHours

        let assistantCashCost = 0
        if (hasAssistant) {
            let astCost = 6
            if (quality === 'HD') astCost = 10
            else if (quality === 'FHD') astCost = 20
            assistantCashCost = astCost * totalBilledHours
        }

        let recordCashCost = 0
        if (hasRecord) recordCashCost = 2 * totalBilledHours

        const totalMonthlyCash = classCashCost + assistantCashCost + recordCashCost
        let finalBusinessCash = totalMonthlyCash
        let isMinCash = false
        if (finalBusinessCash < MIN_BUSINESS_CASH) {
            finalBusinessCash = MIN_BUSINESS_CASH
            isMinCash = true
        }
        const totalBusinessKRW = finalBusinessCash * EXCHANGE_RATE_CASH

        // [B] Subscription Model Calculation
        let tier = 'Standard'
        let subReasons: string[] = []

        if (studentsNum > 50 || classDuration > 4 || quality === 'HD' || studentsNum > 6) {
            tier = 'Plus'
            if (studentsNum > 50) subReasons.push("온스테이지 50명 초과")
            else if (studentsNum > 6) subReasons.push("1v6 인원 초과")
            if (classDuration > 4) subReasons.push("4시간 초과")
            if (quality === 'HD') subReasons.push("HD 화질")
        }

        if (studentsNum > 1000 || classDuration > 12 || quality === 'FHD' || hasWebLive) {
            tier = 'Enterprise'
            subReasons = []
            if (studentsNum > 1000) subReasons.push("학생 1000명 이상")
            if (classDuration > 12) subReasons.push("12시간 초과")
            if (quality === 'FHD') subReasons.push("FHD 초고화질")
            if (hasWebLive) subReasons.push("웹라이브 환경")
        }

        let usdPricePerTeacher = 99
        if (tier === 'Plus') usdPricePerTeacher = 199
        if (tier === 'Enterprise') usdPricePerTeacher = 299

        const totalSubscriptionUSD = usdPricePerTeacher * teachersNum
        const totalSubscriptionKRW = totalSubscriptionUSD * EXCHANGE_RATE_USD

        return {
            totalMonthlyCash, finalBusinessCash, isMinCash, totalBusinessKRW,
            tier, subReasons, usdPricePerTeacher, totalSubscriptionUSD, totalSubscriptionKRW,
            isBusinessRecom: totalBusinessKRW <= totalSubscriptionKRW,
        }
    }, [studentsNum, teachersNum, classCount, classDuration, quality, hasRecord, hasAssistant, hasWebLive])

    const { totalMonthlyCash, finalBusinessCash, isMinCash, totalBusinessKRW, tier, subReasons, usdPricePerTeacher, totalSubscriptionUSD, totalSubscriptionKRW, isBusinessRecom } = pricing
    const formatCurrency = (amt: number) => Math.round(amt).toLocaleString('ko-KR')

    return (
        <div
            ref={containerRef}
            className="w-full max-w-[68rem] mx-auto rounded-[2.5rem] bg-white shadow-[0_20px_50px_rgba(0,0,0,0.06)] border border-slate-100/50 overflow-hidden relative"
        >
            {/* Entrance border-draw animation — renders once dims are known */}
            {visible && <AnimatedBorder containerRef={containerRef} />}

            {/* Content fades in slightly after border starts drawing.
                opacity:0 is the base; animation overrides it once visible=true. */}
            <div
                style={{
                    opacity: 0,
                    animation: visible
                        ? "calculator-fade-in 0.9s cubic-bezier(0.4,0,0.2,1) 0.5s forwards"
                        : "none",
                }}
            >

            <div className="bg-white p-8 md:p-12 pb-6 md:pb-8 text-center relative z-10">
                <h2 className="text-3xl md:text-4xl tracking-tight text-slate-900 font-extrabold mb-4">월 예상 견적 최적화 계산기</h2>
                <p className="text-slate-500 text-[17px] max-w-xl mx-auto leading-relaxed">
                    운영 패턴을 설정하시면 우리 학원에 가장 유리한 요금제를 <span className="font-semibold text-primary">원화(KRW) 기준</span>으로 명확하게 비교해 드립니다.
                </p>
            </div>

            <div className="grid lg:grid-cols-[1.1fr_1fr] relative divide-y lg:divide-y-0 lg:divide-x divide-slate-100 border-t border-slate-100">

                {/* Left: Input Selection (Clean White Unified Layout) */}
                <div className="p-8 md:p-12 space-y-12 bg-white">

                    {/* Sliders Container */}
                    <div className="space-y-10">
                        {/* Student Slider (On-Stage) */}
                        <div className="space-y-6">
                            <div className="flex justify-between items-center">
                                <div className="flex items-center gap-2 group cursor-help relative">
                                    <span className="text-[16px] font-bold text-slate-900">학생 수 (온스테이지)</span>
                                    <Info className="w-[18px] h-[18px] text-slate-400 group-hover:text-primary transition-colors" />
                                    <div className="absolute left-0 top-[130%] w-[280px] sm:w-[320px] bg-slate-800 text-white text-[13.5px] leading-relaxed p-4 rounded-xl shadow-xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-50 pointer-events-none">
                                        <span className="font-bold text-amber-300 block mb-1.5 flex items-center gap-1.5">💡 온스테이지(1v@)란?</span>
                                        전체 시청, 참가 인원이 아닌, 실제로 동시에 집중 비디오/오디오를 켜고 <b>화면에 띄워 소통하는 학생 수</b>를 말합니다. (예: 1v6, 1v12)
                                    </div>
                                </div>
                                <div className="px-4 py-1.5 bg-primary/10 text-primary font-bold rounded-xl text-lg">
                                    {studentsNum}명
                                </div>
                            </div>
                            <Slider
                                defaultValue={[10]} max={50} step={1} value={students}
                                onValueChange={setStudents}
                                className="py-4 cursor-pointer [&>span:first-child]:h-3 [&>span:first-child]:!bg-slate-200 [&_[role=slider]]:h-7 [&_[role=slider]]:w-7 [&_[role=slider]]:border-[4px] [&_[role=slider]]:border-primary [&_[role=slider]]:bg-white [&_[role=slider]]:shadow-md"
                            />
                        </div>

                        {/* Teacher Slider */}
                        <div className="space-y-6">
                            <div className="flex justify-between items-center">
                                <span className="text-[16px] font-bold text-slate-900">필요 강사수 (아이디 수)</span>
                                <div className="px-4 py-1.5 bg-slate-100 text-slate-800 font-bold rounded-xl text-lg">
                                    {teachersNum}명
                                </div>
                            </div>
                            <Slider
                                defaultValue={[5]} max={100} step={1} value={teachers}
                                onValueChange={setTeachers}
                                className="py-4 cursor-pointer [&>span:first-child]:h-3 [&>span:first-child]:!bg-slate-200 [&_[role=slider]]:h-7 [&_[role=slider]]:w-7 [&_[role=slider]]:border-[4px] [&_[role=slider]]:border-primary [&_[role=slider]]:bg-white [&_[role=slider]]:shadow-md"
                            />
                        </div>
                    </div>

                    <hr className="border-slate-100" />

                    {/* General Limits Block */}
                    <div className="space-y-8">
                        <div className="grid grid-cols-2 gap-5">
                            <div className="space-y-3">
                                <label className="text-sm font-bold text-slate-700 block">월 평균 수업 횟수</label>
                                <div className="relative">
                                    <input type="number" min="1" value={classCount} onChange={e => setClassCount(Number(e.target.value) || 1)} className="w-full h-[3.5rem] bg-white border border-slate-200 focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none transition-all rounded-xl pl-4 pr-12 text-slate-900 font-bold" />
                                    <span className="absolute right-8 top-1/2 -translate-y-1/2 text-slate-500 font-bold text-sm pointer-events-none bg-white pl-2">회</span>
                                </div>
                            </div>
                            <div className="space-y-3">
                                <label className="text-sm font-bold text-slate-700 block">1회 평균 수업시간</label>
                                <div className="relative">
                                    <input type="number" min="0.5" step="0.5" value={classDuration} onChange={e => setClassDuration(Number(e.target.value) || 0)} className="w-full h-[3.5rem] bg-white border border-slate-200 focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none transition-all rounded-xl pl-4 pr-14 text-slate-900 font-bold" />
                                    <span className="absolute right-8 top-1/2 -translate-y-1/2 text-slate-500 font-bold text-sm pointer-events-none bg-white pl-2 text-right">시간</span>
                                </div>
                            </div>
                        </div>

                        <div className="space-y-3">
                            <label className="text-sm font-bold text-slate-700 block">최대 송출 화질 (선택)</label>
                            <div className="relative">
                                <select value={quality} onChange={e => setQuality(e.target.value)} className="w-full h-[3.5rem] bg-white border border-slate-200 focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none transition-all rounded-xl px-4 pr-10 text-slate-900 font-bold appearance-none cursor-pointer">
                                    <option value="SD">SD (표준 화질 - 권장)</option>
                                    <option value="HD">HD (고화질)</option>
                                    <option value="FHD">FHD (초고화질)</option>
                                </select>
                                <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400">
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6" /></svg>
                                </div>
                            </div>
                        </div>

                        <div className="space-y-3 pt-2">
                            <label className="text-sm font-bold text-slate-700 block mb-3">필요 추가 옵션</label>
                            <div className="grid sm:grid-cols-2 gap-3">
                                <label className={`flex items-start gap-3 p-4 border-2 rounded-[1.2rem] cursor-pointer transition-all select-none ${hasRecord ? 'border-primary bg-primary/5 shadow-[0_4px_12px_rgb(79,70,229,0.08)]' : 'border-slate-100 bg-white hover:border-slate-200'}`}>
                                    <input type="checkbox" checked={hasRecord} onChange={e => setHasRecord(e.target.checked)} className="mt-[2px] w-4 h-4 accent-primary" />
                                    <span className={`text-[14px] font-bold ${hasRecord ? 'text-primary' : 'text-slate-700'}`}>클라우드 수업 녹화</span>
                                </label>
                                <label className={`flex items-start gap-3 p-4 border-2 rounded-[1.2rem] cursor-pointer transition-all select-none ${hasAssistant ? 'border-primary bg-primary/5 shadow-[0_4px_12px_rgb(79,70,229,0.08)]' : 'border-slate-100 bg-white hover:border-slate-200'}`}>
                                    <input type="checkbox" checked={hasAssistant} onChange={e => setHasAssistant(e.target.checked)} className="mt-[2px] w-4 h-4 accent-primary" />
                                    <span className={`text-[14px] font-bold ${hasAssistant ? 'text-primary' : 'text-slate-700'}`}>조교 계정 동석</span>
                                </label>
                                <label className={`sm:col-span-2 flex items-start gap-3 p-4 border-2 rounded-[1.2rem] cursor-pointer transition-all select-none ${hasWebLive ? 'border-primary bg-primary/5 shadow-[0_4px_12px_rgb(79,70,229,0.08)]' : 'border-slate-100 bg-white hover:border-slate-200'}`}>
                                    <input type="checkbox" checked={hasWebLive} onChange={e => setHasWebLive(e.target.checked)} className="mt-[2px] w-4 h-4 accent-primary" />
                                    <span className={`text-[14px] font-bold ${hasWebLive ? 'text-primary' : 'text-slate-700'}`}>웹 라이브 (대규모 외부 송출용)</span>
                                </label>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Right: Results Comparison */}
                <div className="p-8 md:p-12 bg-slate-50/50 flex flex-col justify-center gap-7 relative z-10 w-full h-full">

                    {/* Business Plan Result */}
                    <div className={`relative rounded-[1.6rem] transition-all duration-500 w-full ${isBusinessRecom ? 'scale-[1.03] z-20' : 'opacity-85 z-10'}`}>
                        {/* Glow Gradient Layer (Only active when recommended) */}
                        {isBusinessRecom && (
                            <div className="absolute -inset-[4px] bg-gradient-to-r from-blue-400 via-indigo-500 to-purple-500 rounded-[1.8rem] blur-[12px] opacity-40 animate-pulse"></div>
                        )}
                        <div className={`relative w-full h-full p-8 rounded-[1.5rem] bg-white border border-slate-200 transition-all duration-300 ${isBusinessRecom ? '!border-transparent shadow-xl' : 'shadow-sm'}`}>
                            {isBusinessRecom && (
                                <div className="absolute -top-3.5 right-6 bg-gradient-to-r from-indigo-500 to-purple-600 text-white text-[11.5px] uppercase tracking-wider font-extrabold px-4 py-1.5 rounded-full shadow-lg flex items-center gap-1.5">
                                    <Sparkles className="w-3.5 h-3.5" /> BEST VALUE
                                </div>
                            )}
                            <h4 className="text-xl font-extrabold text-slate-800 mb-4 tracking-tight">
                                기본 충전형 (Business)
                            </h4>
                            <div className="text-[2.5rem] font-black text-slate-900 mb-2 truncate tracking-tight">
                                {formatCurrency(totalBusinessKRW)}<span className="text-xl font-semibold text-slate-400 ml-1.5 font-sans">원 / 월</span>
                            </div>
                            {isMinCash && (
                                <div className="inline-block bg-amber-50 border border-amber-200 text-amber-800 text-[11px] font-bold px-2 py-0.5 rounded uppercase tracking-wide mb-4">
                                    기본 요금 10,000c 적용됨
                                </div>
                            )}

                            <p className={`text-[13.5px] leading-relaxed mt-2 ${isBusinessRecom ? 'text-indigo-900 font-bold' : 'text-slate-500 font-medium'}`}>
                                {isBusinessRecom
                                    ? "✨ 소규모 수업부터 단기로 사용하여 쓰신 만큼만 정확히 과금되는 가장 매력적인 합리적 선택입니다!"
                                    : "비교적 넉넉한 수업 환경을 구성할 경우 전체 예산 관리를 위해 다소 부담이 될 수 있으므로 정액형을 권합니다."}
                            </p>
                            <div className="mt-6 pt-4 border-t border-slate-100 text-[12px] text-slate-400 font-bold flex justify-between tracking-wide">
                                <span>과금 산정량: {formatCurrency(totalMonthlyCash)}c</span>
                                <span>결제 청구: {formatCurrency(finalBusinessCash)}c</span>
                            </div>
                        </div>
                    </div>

                    {/* Subscription Plan Result */}
                    <div className={`relative rounded-[1.6rem] transition-all duration-500 w-full ${!isBusinessRecom ? 'scale-[1.03] z-20' : 'opacity-85 z-10'}`}>
                        {/* Glow Gradient Layer (Only active when recommended) */}
                        {!isBusinessRecom && (
                            <div className="absolute -inset-[4px] bg-gradient-to-r from-blue-400 via-indigo-500 to-purple-500 rounded-[1.8rem] blur-[12px] opacity-40 animate-pulse"></div>
                        )}
                        <div className={`relative w-full h-full p-8 rounded-[1.5rem] bg-white border border-slate-200 transition-all duration-300 ${!isBusinessRecom ? '!border-transparent shadow-xl' : 'shadow-sm'}`}>
                            {!isBusinessRecom && (
                                <div className="absolute -top-3.5 right-6 bg-gradient-to-r from-indigo-500 to-purple-600 text-white text-[11.5px] uppercase tracking-wider font-extrabold px-4 py-1.5 rounded-full shadow-lg flex items-center gap-1.5">
                                    <Sparkles className="w-3.5 h-3.5" /> BEST VALUE
                                </div>
                            )}
                            <h4 className="text-xl font-extrabold text-slate-800 mb-4 tracking-tight flex items-center gap-2">
                                무제한 구독형 <span className="text-[13px] px-2.5 py-1 bg-slate-100 text-slate-600 rounded-lg ml-1 font-bold">{tier}</span>
                            </h4>
                            <div className="text-[2.5rem] font-black text-slate-900 mb-2 truncate tracking-tight">
                                {formatCurrency(totalSubscriptionKRW)}<span className="text-xl font-semibold text-slate-400 ml-1.5 font-sans">원 / 월</span>
                            </div>

                            <p className={`text-[13.5px] leading-relaxed mt-4 pt-1 ${!isBusinessRecom ? 'text-indigo-900 font-bold' : 'text-slate-500 font-medium'}`}>
                                {!isBusinessRecom
                                    ? (subReasons.length > 0 ? `✨ 고급형 기능( ${subReasons.join(', ')} )이 자동 포함되어있으며, 추가 옵션 비용 걱정 없이 대규모 수업을 이어갈 수 있어 압도적으로 유리합니다!` : "✨ 마음 편하게 제약 없이 마음껏 수업을 개설할 수 있어, 장기적으로 무제한 정액제를 쓰시는 쪽이 압도적인 가성비를 자랑합니다!")
                                    : "소규모, 안정기 이전의 경우 현재 쓰임새 대비 구독 고정비가 비교적 클 수 있으므로 효율적인 기본 충전형(Business)을 고려해 보세요."}
                            </p>
                            <div className="mt-6 pt-4 border-t border-slate-100 text-[12px] text-slate-400 font-bold flex justify-between tracking-wide">
                                <span>계정당 1인: ${usdPricePerTeacher}</span>
                                <span>월 총액: ${totalSubscriptionUSD}</span>
                            </div>
                        </div>
                    </div>

                </div>
            </div>

            </div> {/* end content fade wrapper */}
        </div>
    )
}
