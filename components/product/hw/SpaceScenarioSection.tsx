"use client"

import { motion } from "framer-motion"
import { ArrowRight } from "lucide-react"
import Image from "next/image"
import Link from "next/link"
import { useState } from "react"

import { Button } from "@/components/ui/button"
import { trackEvent } from "@/lib/analytics"

import { fadeUp } from "@/components/motion/presets"

/* ── Section: Space Scenarios ────────────────────────────────────── */
const spaceImageVersion = "20260429-1604"

const spaceScenarios = [
    {
        model: "S110", size: '110"', badge: "FLAGSHIP",
        tag: "강당 · 대형 강의실",
        story: "300명이 앉은 강당에서도 맨 뒷자리가 선명합니다. 110인치 화면이 공간을 압도하며, 교사 한 명의 판서가 전석에 전달됩니다. 대규모 강의, 특강, 입시 설명회에 최적.",
        image: `/images/product/hw/spaces/space-s110-hall.webp?v=${spaceImageVersion}`,
    },
    {
        model: "S86", size: '86"', badge: "BEST",
        tag: "일반 교실 · 회의실",
        story: "30명 담임반의 하루 6교시를 완주하는 기준 모델. 가장 많은 교실 환경에 최적화된 사이즈. 8배열 마이크가 교실 소음 속에서도 교사 음성을 또렷이 전달합니다.",
        image: `/images/product/hw/spaces/space-s86-classroom.webp?v=${spaceImageVersion}`,
    },
    {
        model: "S75", size: '75"', badge: "",
        tag: "세미나 · 중형 회의실",
        story: "20명 내외의 세미나실과 중형 회의실에 딱 맞는 사이즈. 임원 PT, 팀 회의, 교사 연수에서 화이트보드를 완전히 대체합니다.",
        image: `/images/product/hw/spaces/space-s75-seminar.webp?v=${spaceImageVersion}`,
    },
]

export default function SpaceScenarioSection() {
    const [active, setActive] = useState(0)
    const scenario = spaceScenarios[active]

    return (
        <section className="py-24 md:py-32 bg-[#FDFCF8]">
            <div className="container mx-auto px-4 lg:px-8">
                <motion.div className="text-center mb-12" {...fadeUp}>
                    <p className="text-sm font-semibold text-[#22A366] tracking-wider uppercase mb-3">LINEUP × SPACE</p>
                    <h2 className="text-3xl md:text-4xl lg:text-5xl text-[#1a1a19] leading-tight">
                        공간에 딱 맞는
                        <br />
                        <span className="text-[#22A366]">최적의 모델을 만나보세요</span>
                    </h2>
                    <p className="text-lg text-slate-500 mt-4 max-w-xl mx-auto">
                        설치 공간을 선택하면 최적 모델과 사용 시나리오를 확인할 수 있습니다.
                    </p>
                </motion.div>

                <div className="flex flex-wrap justify-center gap-3 mb-12">
                    {spaceScenarios.map((s, i) => (
                        <button
                            key={i}
                            onClick={() => setActive(i)}
                            className={`px-6 py-2.5 rounded-full text-sm font-bold transition-all ${
                                active === i
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
                            <br />어떤 공간에 어울릴까요?
                        </h3>
                        <p className="text-slate-600 leading-relaxed mb-8">{scenario.story}</p>
                        <Button asChild className="h-12 rounded-full bg-[#009060] px-8 text-sm font-bold text-white shadow-md transition-all hover:bg-[#007A52] hover:shadow-lg group">
                            <Link
                                href="/contact#contact-form"
                                onClick={() => trackEvent("click_cta", { button: "hw_model_inquiry", page: "/product/hw", model: scenario.model })}
                            >
                            이 모델로 문의하기
                            <ArrowRight className="w-4 h-4 ml-2 group-hover:translate-x-1 transition-transform" />
                            </Link>
                        </Button>
                    </div>
                </motion.div>
            </div>
        </section>
    )
}
