"use client"

import { motion, useInView } from "framer-motion"
import { Globe, Shield, Zap } from "lucide-react"
import { useRef } from "react"

import { fadeUp, stagger } from "@/components/motion/presets"

import { EyebrowTag } from "./sw-shared"
import { useCountUp } from "./useCountUp"

export default function NetworkStatsSection() {
    const networkRef = useRef(null)
    const networkInView = useInView(networkRef, { once: true })

    const net150 = useCountUp(150, networkInView)
    const net99 = useCountUp(99, networkInView)

    return (
        <>
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
        </>
    )
}
