"use client"

import { Button } from "@/components/ui/button"
import { motion, useInView, useMotionValue, useTransform, animate } from "framer-motion"
import { Play, Mail, MessageSquare, Database, FileText, Clock, ArrowRight, Sparkles } from "lucide-react"
import { useRef, useEffect, useState } from "react"

function SlotDigit({ digit, delay }: { digit: string; delay: number }) {
    const ref = useRef<HTMLDivElement>(null)
    const isInView = useInView(ref, { once: true })
    const num = parseInt(digit)

    return (
        <div
            ref={ref}
            className="w-12 sm:w-18 md:w-24 h-16 sm:h-24 md:h-32 bg-white/[0.04] border border-white/[0.08] backdrop-blur-sm rounded-xl md:rounded-2xl flex items-center justify-center relative overflow-hidden"
        >
            <div className="absolute inset-0 bg-gradient-to-b from-white/[0.03] to-transparent h-1/2"></div>
            <motion.div
                className="flex flex-col items-center"
                initial={{ y: 0 }}
                animate={isInView ? { y: -(num * 100) + "%" } : {}}
                transition={{ duration: 1.2, delay, ease: [0.25, 0.46, 0.45, 0.94] }}
            >
                {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => (
                    <span
                        key={n}
                        className="h-16 sm:h-24 md:h-32 flex items-center justify-center text-4xl sm:text-6xl md:text-8xl font-serif text-white font-light"
                    >
                        {n}
                    </span>
                ))}
            </motion.div>
        </div>
    )
}

function CountUpStat({ value, suffix, label, delay }: { value: number; suffix: string; label: string; delay: number }) {
    const ref = useRef<HTMLDivElement>(null)
    const isInView = useInView(ref, { once: true })
    const [display, setDisplay] = useState("0")

    useEffect(() => {
        if (!isInView) return
        const mv = useMotionValue(0)
        const unsub = mv.on("change", (v) => {
            if (value >= 100) {
                setDisplay(Math.round(v).toLocaleString())
            } else {
                setDisplay(Math.round(v).toString())
            }
        })
        animate(mv, value, { duration: 2, delay, ease: "easeOut" })
        return unsub
    }, [isInView, value, delay])

    return (
        <div ref={ref} className="text-center">
            <div className="text-2xl sm:text-3xl font-bold text-white/90 mb-1 font-serif">
                {display}{suffix}
            </div>
            <div className="text-xs sm:text-sm text-white/30 font-medium tracking-wide">{label}</div>
        </div>
    )
}

export default function ProductPage() {
    return (
        <div className="bg-[#FDFCF8] min-h-screen text-slate-900 font-sans selection:bg-orange-200 pt-20">

            {/* Hero Section */}
            <section className="container mx-auto px-4 lg:px-8 relative overflow-hidden pt-12 md:pt-20">
                <div className="grid lg:grid-cols-[6fr_5fr] gap-12 lg:gap-10 items-center max-w-7xl mx-auto pb-24 md:pb-32">
                    <div className="relative z-20">
                        <motion.div
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.6 }}
                        >
                            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-orange-100/50 text-[#E05024] text-sm font-semibold mb-8 border border-orange-200/50">
                                <span className="w-2 h-2 rounded-full bg-[#E05024] animate-pulse"></span>
                                에듀스케일 2.0 출시
                            </div>
                            <h1 className="text-4xl sm:text-5xl lg:text-[3.5rem] xl:text-[4rem] font-serif leading-[1.15] tracking-tight mb-8 text-[#1a1a19] drop-shadow-sm whitespace-nowrap">
                                파편화된 학원 운영,
                                <br />
                                하나의 시스템으로
                                <br />
                                완벽하게.
                            </h1>
                            <p className="text-xl text-slate-500 mb-10 leading-relaxed font-medium">
                                수작업으로 입력하던 출결, 과제, 성적 데이터를 자동으로 연동하여 강사와 원장님의 소중한 시간을 매주 10시간 이상 절약하세요.
                            </p>
                            <div className="flex flex-wrap items-center gap-4">
                                <Button className="bg-[#E05024] hover:bg-[#C9431A] text-white rounded-full px-8 h-14 text-base font-bold shadow-[0_8px_20px_rgba(224,80,36,0.3)] hover:shadow-[0_12px_25px_rgba(224,80,36,0.4)] transition-all hover:scale-105">
                                    무료로 시작하기
                                </Button>
                                <Button variant="outline" className="rounded-full px-8 h-14 text-base font-bold border-slate-300 text-slate-700 hover:bg-slate-50 hover:border-slate-400 transition-all hover:scale-105">
                                    <Play className="w-4 h-4 mr-2" />
                                    3분 투어 영상
                                </Button>
                            </div>
                        </motion.div>
                    </div>

                    <div className="relative z-10 lg:h-[600px] flex items-center">
                        <motion.div
                            initial={{ opacity: 0, x: 50 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ duration: 0.8, delay: 0.2, type: "spring", bounce: 0.2 }}
                            className="w-full relative"
                        >
                            {/* Dashboard Mockup - Right aligned floating */}
                            <div className="relative bg-white rounded-2xl shadow-[0_30px_60px_rgba(0,0,0,0.08)] border border-slate-100 p-2 overflow-hidden w-[120%] -mr-[20%] lg:w-[150%] lg:-mr-[50%] z-10">
                                <div className="bg-slate-50 rounded-xl overflow-hidden border border-slate-100 flex h-[400px] lg:h-[500px]">
                                    {/* Sidebar mock */}
                                    <div className="w-1/4 border-r border-slate-200 bg-white p-4 hidden sm:block">
                                        <div className="w-24 h-4 bg-slate-200 rounded mb-8"></div>
                                        <div className="space-y-4">
                                            {[1, 2, 3, 4, 5].map(i => (
                                                <div key={i} className="flex items-center gap-3">
                                                    <div className="w-6 h-6 rounded-md bg-slate-100"></div>
                                                    <div className="w-20 h-3 bg-slate-100 rounded"></div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                    {/* Content mock */}
                                    <div className="flex-1 p-6 sm:p-8 bg-[#FAFAFA]">
                                        <div className="flex items-center justify-between mb-8">
                                            <div className="w-40 h-6 bg-slate-200 rounded"></div>
                                            <div className="w-8 h-8 rounded-full bg-slate-200"></div>
                                        </div>
                                        <div className="space-y-4">
                                            {[1, 2, 3, 4].map((i) => (
                                                <div key={i} className="bg-white p-4 rounded-xl border border-slate-100 shadow-sm flex items-center gap-4">
                                                    <div className="w-10 h-10 rounded-full bg-slate-100 flex-shrink-0"></div>
                                                    <div className="flex-1">
                                                        <div className="w-32 h-4 bg-slate-200 rounded mb-2"></div>
                                                        <div className="w-48 h-3 bg-slate-100 rounded"></div>
                                                    </div>
                                                    <div className="hidden sm:block w-16 h-8 rounded-full bg-orange-50"></div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Floating integration elements */}
                            <motion.div animate={{ y: [0, -10, 0] }} transition={{ repeat: Infinity, duration: 4, ease: "easeInOut" }} className="absolute -left-6 lg:-left-12 top-10 lg:top-20 w-14 lg:w-16 h-14 lg:h-16 bg-white rounded-2xl shadow-xl flex items-center justify-center border border-slate-50 z-20">
                                <Mail className="w-7 lg:w-8 h-7 lg:h-8 text-blue-500" />
                            </motion.div>
                            <motion.div animate={{ y: [0, 15, 0] }} transition={{ repeat: Infinity, duration: 5, ease: "easeInOut", delay: 1 }} className="absolute left-10 lg:-left-4 bottom-20 lg:bottom-40 w-12 lg:w-14 h-12 lg:h-14 bg-white rounded-2xl shadow-xl flex items-center justify-center border border-slate-50 z-20">
                                <MessageSquare className="w-6 lg:w-7 h-6 lg:h-7 text-green-500" />
                            </motion.div>
                        </motion.div>
                    </div>
                </div>
            </section>

            {/* Centered Feature Section 1 */}
            <section className="py-24 relative z-20">
                <div className="container mx-auto px-4">
                    <div className="text-center max-w-3xl mx-auto mb-16">
                        <motion.h2
                            initial={{ opacity: 0, y: 20 }}
                            whileInView={{ opacity: 1, y: 0 }}
                            viewport={{ once: true }}
                            className="text-4xl md:text-[3rem] font-serif text-[#1a1a19] mb-6 tracking-tight leading-tight"
                        >
                            모든 지점과 학생 데이터가 <br className="hidden md:block" />
                            실시간으로 한 곳에 모입니다.
                        </motion.h2>
                        <motion.p
                            initial={{ opacity: 0, y: 20 }}
                            whileInView={{ opacity: 1, y: 0 }}
                            viewport={{ once: true }}
                            transition={{ delay: 0.1 }}
                            className="text-xl text-slate-500 font-medium"
                        >
                            출결 관리, 과제 평가, 학부모 상담 기록이 자동으로 백업되고 동기화됩니다.
                        </motion.p>
                    </div>

                    <div className="max-w-5xl mx-auto relative pt-10">
                        {/* Floating Icons */}
                        <motion.div animate={{ y: [0, -15, 0] }} transition={{ repeat: Infinity, duration: 6, ease: "easeInOut" }} className="absolute top-0 left-[10%] md:left-[20%] z-20 w-12 h-12 bg-white rounded-xl shadow-lg border border-slate-100 flex items-center justify-center">
                            <Database className="w-6 h-6 text-purple-500" />
                        </motion.div>
                        <motion.div animate={{ y: [0, 10, 0] }} transition={{ repeat: Infinity, duration: 5, ease: "easeInOut", delay: 0.5 }} className="absolute -top-10 right-[5%] z-20 w-14 h-14 bg-white/80 backdrop-blur-sm rounded-xl shadow-lg border border-slate-100 flex items-center justify-center">
                            <FileText className="w-7 h-7 text-green-600" />
                        </motion.div>

                        {/* Large Center Mockup */}
                        <motion.div
                            initial={{ opacity: 0, scale: 0.95, y: 40 }}
                            whileInView={{ opacity: 1, scale: 1, y: 0 }}
                            viewport={{ once: true, margin: "-50px" }}
                            transition={{ duration: 0.8, type: "spring", bounce: 0.1 }}
                            className="bg-white rounded-[2rem] shadow-[0_30px_80px_rgba(0,0,0,0.06)] border border-slate-100/50 p-2 md:p-3 overflow-hidden relative"
                        >
                            <div className="aspect-[16/9] md:aspect-[21/9] w-full bg-[#FAFAFA] rounded-2xl border border-slate-100 relative overflow-hidden flex flex-col">
                                {/* Header */}
                                <div className="h-12 border-b border-slate-200/60 flex items-center px-4 md:px-6 gap-4 bg-white">
                                    <div className="flex gap-1.5">
                                        <div className="w-3 h-3 rounded-full bg-red-400"></div>
                                        <div className="w-3 h-3 rounded-full bg-yellow-400"></div>
                                        <div className="w-3 h-3 rounded-full bg-green-400"></div>
                                    </div>
                                    <div className="flex-1 max-w-xl mx-auto h-7 bg-slate-50 rounded-md border border-slate-100"></div>
                                </div>
                                {/* Body */}
                                <div className="flex-1 p-4 md:p-8 grid grid-cols-1 md:grid-cols-3 gap-6">
                                    <div className="hidden md:block col-span-1 space-y-4">
                                        <div className="w-full h-24 bg-white rounded-xl shadow-sm border border-slate-100 p-4">
                                            <div className="w-10 h-10 rounded-full bg-slate-100 mb-3"></div>
                                            <div className="w-2/3 h-3 bg-slate-200 rounded"></div>
                                        </div>
                                        <div className="w-full h-24 bg-white rounded-xl shadow-sm border border-slate-100 p-4">
                                            <div className="w-10 h-10 rounded-full bg-slate-100 mb-3"></div>
                                            <div className="w-1/2 h-3 bg-slate-200 rounded"></div>
                                        </div>
                                    </div>
                                    <div className="md:col-span-2 bg-white rounded-xl shadow-sm border border-slate-100 p-6 flex flex-col">
                                        <div className="flex justify-between items-center mb-6">
                                            <div className="w-1/3 h-5 bg-slate-200 rounded"></div>
                                            <div className="w-20 h-5 bg-blue-100 rounded-full"></div>
                                        </div>
                                        <div className="space-y-4 flex-1">
                                            <div className="flex items-center gap-3">
                                                <div className="w-8 h-8 rounded-full bg-slate-100"></div>
                                                <div className="w-48 h-3 bg-slate-100 rounded"></div>
                                            </div>
                                            <div className="flex items-center gap-3">
                                                <div className="w-8 h-8 rounded-full bg-slate-100"></div>
                                                <div className="w-3/4 h-3 bg-slate-100 rounded"></div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </motion.div>
                    </div>
                </div>
            </section>

            {/* Split Feature Section - Time UI */}
            <section className="py-24 bg-white/50 border-y border-slate-100/50">
                <div className="container mx-auto px-4 lg:px-8">
                    <div className="grid lg:grid-cols-2 gap-16 items-center max-w-7xl mx-auto">
                        <div className="order-2 lg:order-1 relative">
                            <motion.div
                                initial={{ opacity: 0, x: -30 }}
                                whileInView={{ opacity: 1, x: 0 }}
                                viewport={{ once: true }}
                                transition={{ duration: 0.8 }}
                                className="bg-white p-6 md:p-8 rounded-[2rem] shadow-[0_20px_60px_rgba(0,0,0,0.05)] border border-slate-100"
                            >
                                <div className="flex items-center justify-between mb-8 pb-6 border-b border-slate-100">
                                    <div>
                                        <h3 className="text-xl font-bold text-slate-800 mb-1">이번 주 시간표</h3>
                                        <p className="text-sm text-slate-500">10월 3주차 강사 일정</p>
                                    </div>
                                    <div className="flex gap-2">
                                        <div className="w-8 h-8 rounded-full bg-slate-50 hover:bg-slate-100 cursor-pointer flex items-center justify-center text-slate-400 transition-colors">&lt;</div>
                                        <div className="w-8 h-8 rounded-full bg-slate-50 hover:bg-slate-100 cursor-pointer flex items-center justify-center text-slate-400 transition-colors">&gt;</div>
                                    </div>
                                </div>
                                <div className="space-y-4">
                                    {[
                                        { time: "14:00 - 15:30", color: "bg-blue-50/50 text-blue-700", border: "border-blue-100", title: "중등 수학 심화반" },
                                        { time: "16:00 - 17:30", color: "bg-orange-50/50 text-orange-700", border: "border-orange-100", title: "고등 미적분 집중" },
                                        { time: "18:00 - 19:30", color: "bg-green-50/50 text-green-700", border: "border-green-100", title: "중등 선행반" },
                                    ].map((item, i) => (
                                        <motion.div 
                                            key={i} 
                                            initial={{ opacity: 0, y: 10 }}
                                            whileInView={{ opacity: 1, y: 0 }}
                                            viewport={{ once: true }}
                                            transition={{ delay: i * 0.15 }}
                                            className={`p-4 rounded-xl border ${item.border} ${item.color} flex items-center justify-between group hover:shadow-md transition-all cursor-pointer`}
                                        >
                                            <div className="flex items-center gap-4">
                                                <div className="w-1.5 rounded-full h-10 bg-current opacity-30 group-hover:opacity-100 transition-opacity"></div>
                                                <div>
                                                    <div className="font-bold mb-1">{item.title}</div>
                                                    <div className="text-sm opacity-70 font-medium">Class Room B, 15명</div>
                                                </div>
                                            </div>
                                            <div className="text-right font-mono text-sm font-bold opacity-80">
                                                {item.time}
                                            </div>
                                        </motion.div>
                                    ))}
                                </div>
                            </motion.div>
                            {/* Floating decorative elements */}
                            <motion.div animate={{ y: [0, -10, 0] }} transition={{ repeat: Infinity, duration: 4 }} className="absolute -right-4 md:-right-8 top-10 md:top-20 w-16 h-16 bg-white rounded-2xl shadow-xl flex items-center justify-center border border-slate-50 z-20">
                                <div className="text-2xl">⏰</div>
                            </motion.div>
                        </div>
                        <div className="order-1 lg:order-2">
                            <motion.div
                                initial={{ opacity: 0, y: 20 }}
                                whileInView={{ opacity: 1, y: 0 }}
                                viewport={{ once: true }}
                            >
                                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-50 text-blue-600 text-sm font-bold mb-6">
                                    <Database className="w-4 h-4" />
                                    스마트 스케줄러
                                </div>
                                <h2 className="text-3xl md:text-5xl font-serif text-[#1a1a19] mb-6 leading-tight">
                                    직관적이고 깔끔한 <br />
                                    시간 및 일정 UI
                                </h2>
                                <p className="text-lg text-slate-500 leading-relaxed font-medium mb-8">
                                    강사별, 학급별 복잡한 시간표도 한눈에 파악할 수 있도록 디자인되었습니다. 드래그 앤 드롭으로 손쉽게 일정을 변경하고, 실시간 알림을 보냅니다.
                                </p>
                                <ul className="space-y-4">
                                    {["클릭 한 번으로 수업 일지 작성 및 공유", "모바일 앱과 완벽하게 동기화되는 알림", "빈 강의실을 자동으로 찾아주는 스마트 추천"].map((text, i) => (
                                        <li key={i} className="flex items-start gap-4">
                                            <div className="w-6 h-6 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0 mt-0.5">
                                                <div className="w-2 h-2 rounded-full bg-blue-500"></div>
                                            </div>
                                            <span className="text-slate-600 font-medium text-lg leading-snug">{text}</span>
                                        </li>
                                    ))}
                                </ul>
                            </motion.div>
                        </div>
                    </div>
                </div>
            </section>

            {/* Split Feature Section - Analytics */}
            <section className="py-24">
                <div className="container mx-auto px-4 lg:px-8">
                    <div className="grid lg:grid-cols-2 gap-16 items-center max-w-7xl mx-auto">
                        <div>
                            <motion.div
                                initial={{ opacity: 0, y: 20 }}
                                whileInView={{ opacity: 1, y: 0 }}
                                viewport={{ once: true }}
                            >
                                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-purple-50 text-purple-600 text-sm font-bold mb-6">
                                    <FileText className="w-4 h-4" />
                                    데이터 리포트
                                </div>
                                <h2 className="text-3xl md:text-5xl font-serif text-[#1a1a19] mb-6 leading-tight">
                                    학생의 성장을 그리는 <br />
                                    디자인 중심 대시보드
                                </h2>
                                <p className="text-lg text-slate-500 leading-relaxed font-medium mb-8">
                                    딱딱한 엑셀 파일은 이제 그만. 미려한 그래프와 차트를 통해 원생들의 성적 향상도를 학부모님께 직관적이고 근사하게 보여줄 수 있습니다.
                                </p>
                                <div className="grid grid-cols-2 gap-4 md:gap-6 mt-8 md:mt-12">
                                    <div className="bg-purple-50/50 p-6 rounded-2xl border border-purple-100">
                                        <div className="text-3xl md:text-4xl font-black text-purple-600 mb-2">98%</div>
                                        <div className="text-sm font-medium text-purple-800">학부모 상담 만족도</div>
                                    </div>
                                    <div className="bg-orange-50/50 p-6 rounded-2xl border border-orange-100">
                                        <div className="text-3xl md:text-4xl font-black text-orange-600 mb-2">-15h</div>
                                        <div className="text-sm font-medium text-orange-800">월 평균 보고서 작성 단축</div>
                                    </div>
                                </div>
                            </motion.div>
                        </div>
                        <div className="relative">
                            <motion.div
                                initial={{ opacity: 0, x: 30 }}
                                whileInView={{ opacity: 1, x: 0 }}
                                viewport={{ once: true }}
                                transition={{ duration: 0.8 }}
                                className="bg-[#1a1a19] p-6 sm:p-10 rounded-[2rem] shadow-2xl relative overflow-hidden"
                            >
                                <div className="flex justify-between items-end mb-10">
                                    <div>
                                        <div className="text-slate-400 text-sm font-medium mb-1">이번 달 종합 성취도</div>
                                        <div className="text-white text-3xl font-bold">상위 15%</div>
                                    </div>
                                    <div className="w-16 h-16 rounded-full bg-gradient-to-tr from-purple-500 to-orange-500 blur-xl mix-blend-screen opacity-50 absolute -right-4 -top-4"></div>
                                </div>
                                
                                {/* Chart Mockup */}
                                <div className="h-56 flex items-end justify-between gap-3 border-b border-slate-700/50 pb-4 mb-6 relative">
                                    <div className="absolute w-full h-full border-b border-dashed border-slate-700/50 top-1/2 left-0 -translate-y-1/2"></div>
                                    {[30, 45, 60, 50, 75, 90, 85].map((height, i) => (
                                        <motion.div 
                                            key={i}
                                            initial={{ height: 0 }}
                                            whileInView={{ height: `${height}%` }}
                                            viewport={{ once: true }}
                                            transition={{ delay: 0.3 + i * 0.1, duration: 0.8, type: "spring" }}
                                            className="w-full bg-gradient-to-t from-orange-500/20 to-orange-400 rounded-t-md relative z-10"
                                        ></motion.div>
                                    ))}
                                </div>
                                
                                <div className="flex items-center justify-between text-slate-400 text-xs font-mono px-2">
                                    <span>W1</span><span>W2</span><span>W3</span><span>W4</span><span>W5</span><span>W6</span><span>W7</span>
                                </div>
                            </motion.div>
                            
                            <motion.div animate={{ y: [0, 15, 0] }} transition={{ repeat: Infinity, duration: 5 }} className="absolute -left-4 md:-left-8 -bottom-8 w-24 h-24 bg-white rounded-3xl shadow-xl flex items-center justify-center border border-slate-100 p-4 z-20">
                                <div className="w-full h-full rounded-full border-4 border-slate-100 flex items-center justify-center relative">
                                    <svg className="absolute w-full h-full transform -rotate-90">
                                        <circle cx="50%" cy="50%" r="40%" stroke="currentColor" strokeWidth="4" fill="none" className="text-orange-500" strokeDasharray="100" strokeDashoffset="25"></circle>
                                    </svg>
                                    <div className="font-bold text-slate-800 text-xl">A+</div>
                                </div>
                            </motion.div>
                        </div>
                    </div>
                </div>
            </section>

            {/* UI Design Feature Section */}
            <section className="py-24 bg-[#1a1a19] text-white">
                <div className="container mx-auto px-4 lg:px-8">
                    <div className="text-center max-w-3xl mx-auto mb-16">
                        <div className="inline-flex items-center justify-center px-4 py-1.5 rounded-full bg-white/10 text-white text-sm font-semibold mb-6 border border-white/20">
                            프리미엄 디자인 시스템
                        </div>
                        <h2 className="text-3xl md:text-5xl font-serif mb-6 leading-tight">
                            복잡함을 덜어낸 <br />
                            완벽한 사용자 경험(UX)
                        </h2>
                        <p className="text-lg text-slate-400 font-medium">
                            매일 수십 번씩 확인해야 하는 화면이기에, 눈의 피로도를 낮추고 꼭 필요한 정보만 돋보이도록 섬세하게 설계했습니다.
                        </p>
                    </div>
                    
                    <div className="grid lg:grid-cols-3 gap-8 max-w-6xl mx-auto">
                        {[
                            { title: "다크 모드 지원", desc: "야간 업무 시 눈의 피로를 최소화하는 우아한 다크 테마를 기본 제공합니다. 시간에 맞춰 자동으로 전환됩니다.", icon: "🌙" },
                            { title: "미니멀리즘 인터페이스", desc: "불필요한 선과 면을 제거하고, 여백과 타이포그래피만으로 정보의 위계를 명확히 분리하여 집중력을 높입니다.", icon: "✨" },
                            { title: "마이크로 인터랙션", desc: "버튼을 누르거나 화면을 넘길 때의 미세하고 부드러운 애니메이션이 소프트웨어의 완성도를 한층 높입니다.", icon: "🎬" }
                        ].map((item, i) => (
                            <motion.div 
                                key={i}
                                initial={{ opacity: 0, y: 20 }}
                                whileInView={{ opacity: 1, y: 0 }}
                                viewport={{ once: true }}
                                transition={{ delay: i * 0.15 }}
                                className="bg-white/5 border border-white/10 rounded-3xl p-8 md:p-10 hover:bg-white/10 transition-colors"
                            >
                                <div className="text-5xl mb-8">{item.icon}</div>
                                <h3 className="text-2xl font-bold mb-4">{item.title}</h3>
                                <p className="text-slate-400 leading-relaxed font-medium text-lg">{item.desc}</p>
                            </motion.div>
                        ))}
                    </div>
                </div>
            </section>

            {/* Social Proof Section */}
            <section className="py-20 border-y border-slate-200/60 bg-[#FDFCF8]">
                <div className="container mx-auto px-4 text-center">
                    <p className="text-sm font-bold tracking-widest text-[#B5B0A2] uppercase mb-10">TRUSTED BY LEADING BRANDS</p>
                    <div className="flex flex-wrap justify-center items-center gap-12 md:gap-20 opacity-40 grayscale hover:grayscale-0 transition-all duration-700 mix-blend-multiply">
                        <div className="text-2xl font-serif font-black">FAST COMPANY</div>
                        <div className="text-2xl font-black tracking-tighter">TechCrunch</div>
                        <div className="text-2xl font-serif font-bold italic">The Atlantic</div>
                        <div className="text-2xl font-black">BUSINESS INSIDER</div>
                    </div>
                </div>
            </section>

            {/* Testimonials Bento Grid */}
            <section className="py-24 md:py-32 relative">
                <div className="container mx-auto px-4 max-w-6xl">
                    <div className="text-center mb-20 max-w-3xl mx-auto">
                        <h2 className="text-3xl md:text-5xl font-serif text-[#1a1a19] leading-tight">
                            전국의 원장님과 강사진이 <br />
                            인정하는 솔루션
                        </h2>
                    </div>

                    <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6 md:gap-8 items-start">
                        {/* Col 1 */}
                        <div className="space-y-6 md:space-y-8">
                            <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} className="bg-white p-8 rounded-3xl shadow-[0_10px_40px_rgba(0,0,0,0.03)] border border-[#f3f0ea]">
                                <div className="flex items-center gap-4 mb-6">
                                    <div className="w-12 h-12 bg-slate-200 rounded-full flex-shrink-0"></div>
                                    <div>
                                        <div className="font-bold text-slate-900">John Kim</div>
                                        <div className="text-sm text-slate-500">대치 A수학 대표원장</div>
                                    </div>
                                </div>
                                <p className="text-slate-600 leading-relaxed font-medium">
                                    "강사들이 서류 작업에 쓰는 시간이 주당 10시간 이상 줄었습니다. 수업의 질이 올라가니 원생들의 성적도 덩달아 상승하더군요. 진작 도입할 걸 그랬습니다."
                                </p>
                            </motion.div>
                            <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: 0.1 }} className="bg-white p-8 rounded-3xl shadow-[0_10px_40px_rgba(0,0,0,0.03)] border border-[#f3f0ea]">
                                <div className="flex items-center gap-4 mb-6">
                                    <div className="w-12 h-12 bg-slate-200 rounded-full flex-shrink-0"></div>
                                    <div>
                                        <div className="font-bold text-slate-900">Sarah Lee</div>
                                        <div className="text-sm text-slate-500">분당 어학원 원장</div>
                                    </div>
                                </div>
                                <p className="text-slate-600 leading-relaxed font-medium">
                                    "지점이 늘어날수록 통제가 안되던 결제와 수납 문제가 이 화면 하나로 완전히 해결되었습니다. 완벽한 운영 체제입니다."
                                </p>
                            </motion.div>
                        </div>
                        {/* Col 2 */}
                        <div className="space-y-6 md:space-y-8 md:mt-12">
                            <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: 0.2 }} className="bg-white p-8 rounded-3xl shadow-[0_10px_40px_rgba(0,0,0,0.03)] border border-[#f3f0ea]">
                                <div className="flex items-center gap-4 mb-6">
                                    <div className="w-12 h-12 bg-slate-200 rounded-full flex-shrink-0"></div>
                                    <div>
                                        <div className="font-bold text-slate-900">David Park</div>
                                        <div className="text-sm text-slate-500">목동 과학학원 강사</div>
                                    </div>
                                </div>
                                <p className="text-slate-600 leading-relaxed font-medium">
                                    "모든 학생의 학업 성취도가 자동화된 그래프로 보이다보니, 학부모 상담이 정말 편해졌어요. 객관적인 데이터로 이야기하니까 학부모님들의 신뢰도 엄청 높아졌습니다."
                                </p>
                            </motion.div>
                            <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: 0.3 }} className="bg-[#1a1a19] text-white p-8 rounded-3xl shadow-[0_10px_40px_rgba(0,0,0,0.08)]">
                                <div className="flex items-center gap-4 mb-6">
                                    <div className="w-12 h-12 bg-slate-700/50 rounded-full flex-shrink-0"></div>
                                    <div>
                                        <div className="font-bold text-white">Stella Choi</div>
                                        <div className="text-sm text-[#A0A09F]">프랜차이즈 교육 본부장</div>
                                    </div>
                                </div>
                                <p className="text-slate-200 leading-relaxed font-medium">
                                    "단순한 관리 툴이 아닙니다. 학원의 경영 자체를 체계적으로 바꿔주는 핵심 인프라입니다. 본사의 통제력이 놀랍도록 강력해졌습니다."
                                </p>
                            </motion.div>
                        </div>
                        {/* Col 3 */}
                        <div className="space-y-6 md:space-y-8 lg:mt-6">
                            <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: 0.4 }} className="bg-white p-8 rounded-3xl shadow-[0_10px_40px_rgba(0,0,0,0.03)] border border-[#f3f0ea]">
                                <div className="flex items-center gap-4 mb-6">
                                    <div className="w-12 h-12 bg-slate-200 rounded-full flex-shrink-0"></div>
                                    <div>
                                        <div className="font-bold text-slate-900">Yoon Jin</div>
                                        <div className="text-sm text-slate-500">입시컨설팅 소장</div>
                                    </div>
                                </div>
                                <p className="text-slate-600 leading-relaxed font-medium">
                                    "복잡했던 성적 추이 데이터가 이렇게 훌륭하고 직관적으로 시각화될 수 있다니 놀랍습니다."
                                </p>
                            </motion.div>
                            <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: 0.5 }} className="bg-white p-8 rounded-3xl shadow-[0_10px_40px_rgba(0,0,0,0.03)] border border-[#f3f0ea]">
                                <div className="flex items-center gap-4 mb-6">
                                    <div className="w-12 h-12 bg-slate-200 rounded-full flex-shrink-0"></div>
                                    <div>
                                        <div className="font-bold text-slate-900">Peter Jung</div>
                                        <div className="text-sm text-slate-500">에듀테크 컨설턴트</div>
                                    </div>
                                </div>
                                <p className="text-slate-600 leading-relaxed font-medium">
                                    "새로 개원하는 원장님들에게 무조건 1순위로 추천하는 소프트웨어입니다. 이 디자인과 편안한 UX를 한 번 경험하면 절대 과거로 돌아가지 못합니다."
                                </p>
                            </motion.div>
                        </div>
                    </div>
                </div>
            </section>

            {/* Counter / Final CTA */}
            <section className="relative py-32 md:py-40 overflow-hidden">
                {/* Deep gradient background */}
                <div className="absolute inset-0 bg-gradient-to-b from-[#0f0f0e] via-[#1a1a19] to-[#0f0f0e]"></div>

                {/* Subtle radial glow */}
                <div className="absolute inset-0">
                    <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[600px] bg-gradient-radial from-orange-500/[0.07] via-transparent to-transparent rounded-full blur-3xl"></div>
                    <div className="absolute top-0 left-0 w-full h-px bg-gradient-to-r from-transparent via-orange-500/20 to-transparent"></div>
                    <div className="absolute bottom-0 left-0 w-full h-px bg-gradient-to-r from-transparent via-white/5 to-transparent"></div>
                </div>

                <div className="container mx-auto px-4 text-center max-w-5xl relative z-10">
                    {/* Top label */}
                    <motion.div
                        initial={{ opacity: 0, y: 10 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true }}
                        className="flex items-center justify-center gap-2 mb-12"
                    >
                        <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-white/[0.06] border border-white/10 text-sm font-medium text-orange-300/90">
                            <Clock className="w-3.5 h-3.5" />
                            절약된 시간
                        </div>
                    </motion.div>

                    {/* Large counter - slot machine effect */}
                    <div className="flex justify-center mb-6">
                        <div className="flex items-center gap-1.5 sm:gap-2.5 select-none">
                            <SlotDigit digit="1" delay={0.2} />
                            <span className="text-4xl sm:text-6xl md:text-8xl font-serif text-white/30 font-light select-none">,</span>
                            <SlotDigit digit="3" delay={0.35} />
                            <SlotDigit digit="4" delay={0.45} />
                            <SlotDigit digit="1" delay={0.55} />
                            <span className="text-4xl sm:text-6xl md:text-8xl font-serif text-white/30 font-light select-none">,</span>
                            <SlotDigit digit="4" delay={0.65} />
                            <SlotDigit digit="8" delay={0.75} />
                            <SlotDigit digit="3" delay={0.85} />
                        </div>
                    </div>

                    {/* Unit */}
                    <motion.p
                        initial={{ opacity: 0 }}
                        whileInView={{ opacity: 1 }}
                        viewport={{ once: true }}
                        transition={{ delay: 0.5 }}
                        className="text-3xl sm:text-4xl md:text-5xl font-serif text-white/90 font-light tracking-tight mb-4"
                    >
                        시간
                    </motion.p>

                    {/* Description */}
                    <motion.p
                        initial={{ opacity: 0, y: 10 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true }}
                        transition={{ delay: 0.6 }}
                        className="text-base sm:text-lg text-white/40 font-medium mb-6 max-w-lg mx-auto leading-relaxed"
                    >
                        전국 학원들이 Classin과 함께 절약한 누적 시간입니다.
                    </motion.p>

                    {/* Stats row - count up */}
                    <motion.div
                        initial={{ opacity: 0, y: 15 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true }}
                        transition={{ delay: 0.7 }}
                        className="flex flex-wrap justify-center gap-8 sm:gap-14 mb-16 mt-12"
                    >
                        <CountUpStat value={2400} suffix="+" label="도입 학원 수" delay={0.3} />
                        <CountUpStat value={15} suffix="h" label="주당 절약 시간" delay={0.5} />
                        <CountUpStat value={98} suffix="%" label="사용자 만족도" delay={0.7} />
                    </motion.div>

                    {/* CTA */}
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true }}
                        transition={{ delay: 0.8 }}
                        className="flex flex-col sm:flex-row items-center justify-center gap-4"
                    >
                        <Button className="bg-[#E05024] hover:bg-[#C9431A] text-white rounded-full px-10 h-14 text-base font-bold shadow-[0_10px_40px_rgba(224,80,36,0.35)] hover:shadow-[0_15px_50px_rgba(224,80,36,0.45)] transition-all hover:scale-105 group">
                            지금 무료로 시작하기
                            <ArrowRight className="w-4 h-4 ml-2 group-hover:translate-x-1 transition-transform" />
                        </Button>
                        <button className="flex items-center gap-2 text-white/40 hover:text-white/70 text-sm font-medium transition-colors">
                            <Sparkles className="w-3.5 h-3.5" />
                            설치 없이 바로 체험
                        </button>
                    </motion.div>
                </div>
            </section>

        </div>
    )
}
