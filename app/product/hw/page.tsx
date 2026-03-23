"use client"

import { Button } from "@/components/ui/button"
import { motion, useInView } from "framer-motion"
import {
    ArrowRight, PenTool, Eye, Share2, Video,
    Monitor, Fingerprint, Users, Layers, Wifi,
    Shield, Maximize, ChevronRight, Zap, Hand,
    GraduationCap, Building2, Mic, Camera
} from "lucide-react"
import { useRef } from "react"

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
    { model: "S86", size: '86"', rec: "일반 교실 · 회의실", color: "from-[#E05024] to-[#C9431A]", textColor: "text-white", badge: "BEST" },
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
            problems: ["분필 날림, 건강 우려", "지우면 영원히 사라짐", "공유 불가능"],
            bg: "bg-slate-100",
            border: "border-slate-200",
            iconColor: "text-slate-400",
        },
        {
            title: "일반 전자칠판",
            problems: ["필기감 부자연스러움", "소프트웨어 별도 구매", "단순 화면 출력 장치"],
            bg: "bg-slate-50",
            border: "border-slate-200",
            iconColor: "text-slate-400",
        },
        {
            title: "ClassIn Board",
            problems: ["분필처럼 자연스럽고, 지워도 남는다", "SW 생태계 완전 통합", "시공간을 넘는 교육 연결"],
            bg: "bg-[#FFF7F5]",
            border: "border-[#E05024]/20",
            iconColor: "text-[#E05024]",
            highlight: true,
        },
    ]

    return (
        <section className="py-24 md:py-32 bg-white">
            <div className="container mx-auto px-4 lg:px-8">
                <motion.div className="text-center mb-16" {...fadeUp}>
                    <p className="text-sm font-semibold text-[#E05024] tracking-wider uppercase mb-3">WHY CLASSIN BOARD</p>
                    <h2 className="text-3xl md:text-4xl lg:text-5xl font-serif text-[#1a1a19] leading-tight">
                        도구를 바꾸는 게 아니라,
                        <br className="hidden sm:block" />
                        <span className="text-[#E05024]">교육의 방식</span>을 바꿉니다
                    </h2>
                </motion.div>

                <div ref={ref} className="grid md:grid-cols-3 gap-6 max-w-5xl mx-auto">
                    {items.map((item, i) => (
                        <motion.div
                            key={i}
                            initial={{ opacity: 0, y: 40 }}
                            animate={inView ? { opacity: 1, y: 0 } : {}}
                            transition={{ duration: 0.5, delay: i * 0.15 }}
                            className={`rounded-2xl border ${item.border} ${item.bg} p-8 ${item.highlight ? "ring-2 ring-[#E05024]/20 shadow-lg shadow-[#E05024]/5 scale-[1.02]" : ""}`}
                        >
                            <h3 className={`text-xl font-bold mb-6 ${item.highlight ? "text-[#E05024]" : "text-slate-900"}`}>
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
    tag, title, desc, features, reverse = false, accent = "#E05024", children,
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
                            <h2 className="text-3xl md:text-4xl lg:text-[2.75rem] font-serif text-[#1a1a19] leading-tight mb-6">
                                {title}
                            </h2>
                            <p className="text-lg text-slate-500 leading-relaxed mb-10">{desc}</p>
                        </motion.div>

                        <div className="space-y-6">
                            {features.map((f, i) => (
                                <motion.div key={i} {...stagger(i)} className="flex items-start gap-4">
                                    <div className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0"
                                        style={{ backgroundColor: `${accent}10`, color: accent }}>
                                        {f.icon}
                                    </div>
                                    <div>
                                        <h4 className="font-bold text-slate-900 mb-1">{f.label}</h4>
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

/* ── Main Page Component ─────────────────────────────────────────── */
export default function ProductHWPage() {
    return (
        <div className="bg-[#FDFCF8] min-h-screen text-slate-900 font-sans selection:bg-orange-200 pt-20">

            {/* ================================================================
                ACT 1 — HERO: 익숙함을 넘어서
            ================================================================ */}
            <section className="relative overflow-hidden">
                {/* Subtle background gradient */}
                <div className="absolute inset-0 bg-gradient-to-b from-[#FDFCF8] via-[#FFF9F7] to-[#FDFCF8] pointer-events-none" />

                <div className="container mx-auto px-4 lg:px-8 pt-12 md:pt-24 pb-20 md:pb-32 relative">
                    <div className="max-w-4xl mx-auto text-center">
                        <motion.div
                            initial={{ opacity: 0, y: 30 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.7 }}
                        >
                            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-[#E05024]/5 text-[#E05024] text-sm font-semibold mb-8 border border-[#E05024]/10">
                                <Layers className="w-3.5 h-3.5" />
                                ClassIn Board S Series
                            </div>

                            <h1 className="text-4xl sm:text-5xl lg:text-6xl xl:text-7xl font-serif leading-[1.1] tracking-tight mb-8 text-[#1a1a19]">
                                칠판 하나로,
                                <br />
                                교실의 한계가{" "}
                                <span className="text-[#E05024]">사라집니다</span>
                            </h1>

                            <p className="text-xl md:text-2xl text-slate-500 leading-relaxed font-medium max-w-2xl mx-auto mb-12">
                                분필의 직관은 그대로. 디지털의 가능성은 무한히.
                                <br className="hidden md:block" />
                                아날로그와 디지털이 하나 되는 교육 경험.
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
                                { value: "0.03초", label: "초저지연 필기" },
                                { value: "178°", label: "광시야각" },
                                { value: "50점", label: "멀티터치" },
                                { value: "4K", label: "AI 카메라" },
                            ].map((m, i) => (
                                <div key={i} className="text-center">
                                    <div className="text-2xl md:text-3xl font-serif font-bold text-[#E05024]">{m.value}</div>
                                    <div className="text-xs md:text-sm text-slate-400 mt-1 font-medium">{m.label}</div>
                                </div>
                            ))}
                        </motion.div>
                    </div>
                </div>
            </section>

            {/* ================================================================
                ACT 1 — COMPARISON: 왜 ClassIn Board인가
            ================================================================ */}
            <ComparisonSection />

            {/* ================================================================
                ACT 2 — 필기: 디지털인데, 아날로그 같은
            ================================================================ */}
            <div className="bg-white">
                <FeatureSection
                    tag="WRITING EXPERIENCE"
                    title={<>쓰는 순간,<br />전자칠판이란 걸 <span className="text-[#E05024]">잊게 됩니다</span></>}
                    desc="분필의 마찰감을 재현한 표면 코팅과 0.03초 초저지연이 만나, 손끝을 따라오는 가장 자연스러운 디지털 필기를 경험하세요."
                    features={[
                        {
                            icon: <Zap className="w-5 h-5" />,
                            label: "0.03초 초저지연",
                            detail: "생각의 속도를 따라오는 잉크. 쓰는 즉시 화면에 나타납니다.",
                        },
                        {
                            icon: <Hand className="w-5 h-5" />,
                            label: "50포인트 멀티터치",
                            detail: "교사와 학생이 동시에 판서. 그룹 활동과 협업이 칠판 위에서 바로.",
                        },
                        {
                            icon: <Maximize className="w-5 h-5" />,
                            label: "무한 캔버스",
                            detail: "지우지 마세요, 넘기세요. 최대 50페이지를 단일 파일로 저장합니다.",
                        },
                    ]}
                >
                    {/* Writing visual mockup */}
                    <motion.div {...fadeUp} className="relative">
                        <div className="aspect-[4/3] rounded-3xl bg-gradient-to-br from-slate-800 to-slate-900 border border-slate-700/50 shadow-2xl overflow-hidden p-8 flex flex-col justify-between">
                            {/* Simulated board content */}
                            <div className="space-y-4">
                                <div className="h-1 w-3/4 rounded-full bg-white/20" />
                                <div className="h-1 w-1/2 rounded-full bg-white/15" />
                                <div className="h-1 w-2/3 rounded-full bg-[#E05024]/30" />
                                <div className="h-1 w-1/3 rounded-full bg-white/10" />
                            </div>
                            <div className="flex items-end justify-between">
                                <div className="flex gap-2">
                                    <div className="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center">
                                        <PenTool className="w-4 h-4 text-white/40" />
                                    </div>
                                    <div className="w-8 h-8 rounded-lg bg-[#E05024]/20 flex items-center justify-center">
                                        <Hand className="w-4 h-4 text-[#E05024]/60" />
                                    </div>
                                </div>
                                <div className="text-xs text-white/20 font-mono">Page 3 / 50</div>
                            </div>
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
                            <div className="text-lg font-bold text-[#E05024] font-mono">0.03s</div>
                        </motion.div>
                    </motion.div>
                </FeatureSection>
            </div>

            {/* ================================================================
                ACT 2 — 선명함: 어디에 앉아도 같은 수업
            ================================================================ */}
            <FeatureSection
                tag="DISPLAY QUALITY"
                title={<>맨 뒷자리 학생도,<br /><span className="text-[#E05024]">맨 앞자리</span>와 같은 화면을 봅니다</>}
                desc="풀 라미네이션 패널과 정밀 코팅 기술이 만들어내는 선명함. 조명 반사 없이, 어느 각도에서든 또렷한 화면을 제공합니다."
                reverse
                features={[
                    {
                        icon: <Eye className="w-5 h-5" />,
                        label: "178° 광시야각",
                        detail: "교실 어디에 앉든 동일한 색감과 선명도. 사각지대가 사라집니다.",
                    },
                    {
                        icon: <Shield className="w-5 h-5" />,
                        label: "AG + AF 정밀 코팅",
                        detail: "안티글레어로 조명 반사를 차단하고, 지문방지 코팅으로 깨끗한 화면을 유지합니다.",
                    },
                    {
                        icon: <Eye className="w-5 h-5" />,
                        label: "블루라이트 차단",
                        detail: "하루 종일 켜두는 교실. 학생들의 눈 건강까지 설계에 담았습니다.",
                    },
                ]}
            >
                {/* Display visual */}
                <motion.div {...fadeUp} className="relative">
                    <div className="aspect-[4/3] rounded-3xl bg-gradient-to-br from-blue-50 to-indigo-50 border border-blue-100/60 shadow-xl overflow-hidden flex items-center justify-center p-10">
                        <div className="text-center">
                            <div className="text-8xl md:text-9xl font-serif font-bold text-blue-900/10 mb-4">178°</div>
                            <p className="text-sm text-blue-400 font-medium">어디서든 선명하게</p>
                        </div>
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
                        <div className="text-lg font-bold text-blue-600 font-mono">90%+</div>
                    </motion.div>
                </motion.div>
            </FeatureSection>

            {/* ================================================================
                ACT 3 — 판서 공유: 쓰는 즉시, 모든 학생에게
            ================================================================ */}
            <div className="bg-white">
                <FeatureSection
                    tag="INSTANT SHARING"
                    title={<>판서가 끝나기도 전에,<br />학생 기기에 <span className="text-[#E05024]">도착합니다</span></>}
                    desc="실시간 판서 동기화로 모든 학생이 같은 내용을 동시에 봅니다. 수업이 끝나면 자동 저장. 결석한 학생도 놓치지 않습니다."
                    features={[
                        {
                            icon: <Share2 className="w-5 h-5" />,
                            label: "실시간 판서 동기화",
                            detail: "칠판에 쓰는 순간, 학생 태블릿과 노트북에 즉시 반영됩니다.",
                        },
                        {
                            icon: <Layers className="w-5 h-5" />,
                            label: "원클릭 저장 · 공유",
                            detail: "수업 종료 후 판서 내용이 PDF로 자동 저장. 학생에게 즉시 배포 가능.",
                        },
                        {
                            icon: <Users className="w-5 h-5" />,
                            label: "결석해도 복습 가능",
                            detail: "수업에 참여하지 못한 학생도 판서 기록으로 완벽한 복습을 합니다.",
                        },
                    ]}
                >
                    {/* Sharing visual — board to devices flow */}
                    <motion.div {...fadeUp} className="relative">
                        <div className="aspect-[4/3] rounded-3xl bg-gradient-to-br from-orange-50 to-amber-50 border border-orange-100/60 shadow-xl overflow-hidden p-8 flex flex-col justify-center items-center gap-6">
                            {/* Board icon */}
                            <div className="w-16 h-12 rounded-xl bg-slate-800 flex items-center justify-center shadow-md">
                                <PenTool className="w-6 h-6 text-white/70" />
                            </div>
                            {/* Arrow flow */}
                            <div className="flex flex-col items-center gap-1">
                                <motion.div
                                    animate={{ y: [0, 4, 0] }}
                                    transition={{ duration: 1.5, repeat: Infinity, ease: "easeInOut" }}
                                    className="text-[#E05024]/40"
                                >
                                    <ChevronRight className="w-5 h-5 rotate-90" />
                                </motion.div>
                                <motion.div
                                    animate={{ y: [0, 4, 0] }}
                                    transition={{ duration: 1.5, repeat: Infinity, ease: "easeInOut", delay: 0.2 }}
                                    className="text-[#E05024]/30"
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
                                        className="bg-white rounded-xl shadow-md border border-orange-100 px-4 py-3 text-center"
                                    >
                                        <Monitor className="w-5 h-5 text-[#E05024]/60 mx-auto mb-1" />
                                        <div className="text-[10px] text-slate-400 font-medium">{d}</div>
                                    </motion.div>
                                ))}
                            </div>
                        </div>
                    </motion.div>
                </FeatureSection>
            </div>

            {/* ================================================================
                ACT 3 — 시공간을 넘어서: 교실이 있는 곳이 학교
            ================================================================ */}
            <FeatureSection
                tag="BEYOND CLASSROOM"
                title={<>같은 교실에 없어도,<br /><span className="text-[#E05024]">같은 수업</span>을 합니다</>}
                desc="AI 카메라와 고성능 마이크가 물리적 거리를 지웁니다. 교실 학생과 원격 학생이 하나의 캔버스에서 함께 배우는 하이브리드 수업."
                reverse
                accent="#E05024"
                features={[
                    {
                        icon: <Camera className="w-5 h-5" />,
                        label: "4K AI 카메라",
                        detail: "신체 추적 알고리즘으로 교사를 자동 트래킹. 별도 카메라맨이 필요 없습니다.",
                    },
                    {
                        icon: <Mic className="w-5 h-5" />,
                        label: "8배열 마이크 + 노이즈캔슬링",
                        detail: "교실 소음 속에서도 교사 음성만 또렷하게. 원격 학생에게 선명한 음성을 전달합니다.",
                    },
                    {
                        icon: <Wifi className="w-5 h-5" />,
                        label: "하이브리드 수업",
                        detail: "교실 + 원격 학생이 하나의 캔버스에서 동시 판서. 장소에 구애받지 않는 교육.",
                    },
                ]}
            >
                {/* Hybrid classroom visual */}
                <motion.div {...fadeUp} className="relative">
                    <div className="aspect-[4/3] rounded-3xl bg-gradient-to-br from-violet-50 to-sky-50 border border-violet-100/60 shadow-xl overflow-hidden p-8 flex flex-col justify-center">
                        <div className="flex items-center justify-center gap-6 mb-6">
                            {/* Classroom */}
                            <div className="bg-white rounded-2xl shadow-md border border-violet-100 p-5 text-center flex-1">
                                <Building2 className="w-7 h-7 text-violet-400 mx-auto mb-2" />
                                <div className="text-xs text-slate-500 font-medium">교실</div>
                                <div className="flex gap-1 justify-center mt-2">
                                    {[...Array(4)].map((_, i) => (
                                        <div key={i} className="w-2 h-2 rounded-full bg-violet-300" />
                                    ))}
                                </div>
                            </div>

                            {/* Connection indicator */}
                            <motion.div
                                animate={{ scale: [1, 1.2, 1] }}
                                transition={{ duration: 2, repeat: Infinity }}
                                className="w-10 h-10 rounded-full bg-[#E05024]/10 flex items-center justify-center shrink-0"
                            >
                                <Wifi className="w-4 h-4 text-[#E05024]" />
                            </motion.div>

                            {/* Remote */}
                            <div className="bg-white rounded-2xl shadow-md border border-sky-100 p-5 text-center flex-1">
                                <Video className="w-7 h-7 text-sky-400 mx-auto mb-2" />
                                <div className="text-xs text-slate-500 font-medium">원격</div>
                                <div className="flex gap-1 justify-center mt-2">
                                    {[...Array(3)].map((_, i) => (
                                        <div key={i} className="w-2 h-2 rounded-full bg-sky-300" />
                                    ))}
                                </div>
                            </div>
                        </div>
                        <div className="text-center text-xs text-slate-400 font-medium">하나의 캔버스, 하나의 수업</div>
                    </div>
                </motion.div>
            </FeatureSection>

            {/* ================================================================
                ACT 4 — SW 완전 통합: 교육 생태계
            ================================================================ */}
            <section className="py-24 md:py-32 bg-slate-900 text-white relative overflow-hidden">
                {/* Background glow */}
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-[#E05024]/5 rounded-full blur-[120px] pointer-events-none" />

                <div className="container mx-auto px-4 lg:px-8 relative">
                    <motion.div className="text-center mb-16" {...fadeUp}>
                        <p className="text-sm font-semibold text-[#E05024] tracking-wider uppercase mb-3">COMPLETE ECOSYSTEM</p>
                        <h2 className="text-3xl md:text-4xl lg:text-5xl font-serif leading-tight">
                            하드웨어만 팔지 않습니다.
                            <br />
                            <span className="text-[#E05024]">교육 생태계</span>를 완성합니다.
                        </h2>
                        <p className="text-lg text-slate-400 mt-6 max-w-2xl mx-auto leading-relaxed">
                            ClassIn 소프트웨어가 보드에 네이티브 탑재. 출결부터 과제, 성적, 학부모 알림까지 — 끊김 없는 하나의 흐름.
                        </p>
                    </motion.div>

                    <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5 max-w-5xl mx-auto">
                        {[
                            {
                                icon: <Fingerprint className="w-6 h-6" />,
                                title: "NFC 원터치 로그인",
                                desc: "카드 한 장으로 본인의 수업 환경이 즉시 로드됩니다",
                            },
                            {
                                icon: <Layers className="w-6 h-6" />,
                                title: "20+ 강의 도구",
                                desc: "타이머, 투표, 퀴즈, 그룹토론이 칠판 위에서 바로",
                            },
                            {
                                icon: <GraduationCap className="w-6 h-6" />,
                                title: "LMS 완전 통합",
                                desc: "출결 → 수업 → 과제 → 성적 → 학부모 알림, 한 번에",
                            },
                            {
                                icon: <Monitor className="w-6 h-6" />,
                                title: "무선 미러링",
                                desc: "어떤 기기에서든 원클릭으로 화면을 공유합니다",
                            },
                        ].map((item, i) => (
                            <motion.div
                                key={i}
                                {...stagger(i)}
                                className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-2xl p-6 hover:bg-white/10 transition-colors"
                            >
                                <div className="w-12 h-12 rounded-xl bg-[#E05024]/15 text-[#E05024] flex items-center justify-center mb-4">
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
                ACT 5 — 라인업: 모든 공간에 맞는 사이즈
            ================================================================ */}
            <section className="py-24 md:py-32">
                <div className="container mx-auto px-4 lg:px-8">
                    <motion.div className="text-center mb-16" {...fadeUp}>
                        <p className="text-sm font-semibold text-[#E05024] tracking-wider uppercase mb-3">LINEUP</p>
                        <h2 className="text-3xl md:text-4xl lg:text-5xl font-serif text-[#1a1a19] leading-tight">
                            모든 공간에 맞는 <span className="text-[#E05024]">사이즈</span>
                        </h2>
                        <p className="text-lg text-slate-500 mt-4 max-w-xl mx-auto">
                            소규모 스터디룸부터 대형 강당까지, 공간에 최적화된 모델을 선택하세요.
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
                                <div className="text-5xl font-serif font-bold mb-1">{card.model}</div>
                                <div className="text-2xl font-mono font-bold mb-4 opacity-70">{card.size}</div>
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
                                            <th className="text-center py-4 px-4 font-bold text-[#E05024]">S86</th>
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
                ACT 5 — CTA: 직접 체험해보세요
            ================================================================ */}
            <section className="py-24 md:py-32 bg-gradient-to-b from-white to-[#FDFCF8] border-t border-slate-100">
                <div className="container mx-auto px-4 text-center">
                    <motion.div {...fadeUp}>
                        <p className="text-sm font-semibold text-[#E05024] tracking-wider uppercase mb-3">EXPERIENCE</p>
                        <h2 className="text-3xl md:text-4xl lg:text-5xl font-serif text-[#1a1a19] mb-4 leading-tight">
                            스펙으로 전할 수 없는 건,
                            <br />
                            <span className="text-[#E05024]">직접 써보는 것</span>뿐입니다
                        </h2>
                        <p className="text-lg text-slate-500 mb-10 max-w-xl mx-auto leading-relaxed">
                            교실 규모와 환경에 맞는 최적의 모델을 제안해드립니다.
                            <br />
                            데모 체험부터 설치, 유지보수까지 원스톱으로 지원합니다.
                        </p>

                        <div className="flex flex-col sm:flex-row gap-4 justify-center">
                            <Button className="bg-[#E05024] hover:bg-[#C9431A] text-white rounded-full px-10 h-14 text-base font-bold shadow-[0_8px_20px_rgba(224,80,36,0.3)] hover:shadow-[0_12px_25px_rgba(224,80,36,0.4)] transition-all hover:scale-105 group">
                                도입 문의하기
                                <ArrowRight className="w-4 h-4 ml-2 group-hover:translate-x-1 transition-transform" />
                            </Button>
                            <Button variant="outline" className="rounded-full px-10 h-14 text-base font-bold border-slate-300 hover:border-slate-400 text-slate-700 hover:bg-slate-50 transition-all">
                                데모 체험 신청
                            </Button>
                        </div>
                    </motion.div>
                </div>
            </section>
        </div>
    )
}
