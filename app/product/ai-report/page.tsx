"use client"

import { motion, useReducedMotion } from "framer-motion"
import {
    ArrowRight, BadgeCheck, CalendarX, CheckCircle2, Cloud, Copyright,
    Download, Eye, Lock, Mic, MonitorPlay, Play, Sparkles, Users,
    Laptop, Presentation, Video, FileText,
} from "lucide-react"

import Image from "next/image"

import { TrackedLink } from "@/components/TrackedLink"
import { AI_REPORT_QA } from "@/lib/ai-report-content"
import { trackEvent } from "@/lib/analytics"
import { BROCHURE_URL } from "@/lib/marketing-links"

const ease = [0.22, 1, 0.36, 1] as const

const fadeUp = {
    initial: { opacity: 0, y: 28 },
    whileInView: { opacity: 1, y: 0 },
    viewport: { once: true, margin: "-8% 0px" },
    transition: { duration: 0.6, ease },
}

const stagger = (i: number) => ({
    ...fadeUp,
    transition: { duration: 0.55, delay: 0.1 + i * 0.13, ease },
})

/* ================================================================
   커스텀 라인아트 아이콘 — 파이프라인 4단계 전용
   lucide 범용 아이콘 대신 이 페이지의 흐름(수업→녹화→음성→리포트)을
   직접 그려 페이지의 시각 서명으로 쓴다. 48pt 그리드, 1.5 스트로크.
================================================================ */
type LineIconProps = { className?: string }

function IconLesson({ className }: LineIconProps) {
    return (
        <svg viewBox="0 0 48 48" fill="none" className={className} aria-hidden="true">
            <rect x="7" y="7" width="34" height="22" rx="2.5" stroke="currentColor" strokeWidth="1.5" />
            <path d="M13 15h13M13 20h17M13 25h9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            <path d="M9 41h30" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            <path d="M16 35v6M32 35v6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
    )
}

function IconRecord({ className }: LineIconProps) {
    return (
        <svg viewBox="0 0 48 48" fill="none" className={className} aria-hidden="true">
            <rect x="5" y="14" width="27" height="20" rx="3" stroke="currentColor" strokeWidth="1.5" />
            <path d="M32 21.5l10-5.5v16l-10-5.5v-5z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
            <circle cx="12.5" cy="21" r="2" fill="currentColor" />
        </svg>
    )
}

function IconVoice({ className }: LineIconProps) {
    return (
        <svg viewBox="0 0 48 48" fill="none" className={className} aria-hidden="true">
            <path
                d="M7 21v6M14 16v16M21 9v30M28 14v20M35 18v12M42 22.5v3"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
            />
        </svg>
    )
}

function IconReport({ className }: LineIconProps) {
    return (
        <svg viewBox="0 0 48 48" fill="none" className={className} aria-hidden="true">
            <path
                d="M11 7h16l10 10v24a2 2 0 01-2 2H11a2 2 0 01-2-2V9a2 2 0 012-2z"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinejoin="round"
            />
            <path d="M27 7v10h10" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
            <path d="M16 26h16M16 32h16M16 38h10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            <path
                d="M21.5 12.5l.9 2.1 2.1.9-2.1.9-.9 2.1-.9-2.1-2.1-.9 2.1-.9.9-2.1z"
                fill="currentColor"
            />
        </svg>
    )
}

const PIPELINE_STEPS = [
    { Icon: IconLesson, label: "수업", note: "온라인이든 대면이든" },
    { Icon: IconRecord, label: "자동 녹화", note: "누르지 않아도" },
    { Icon: IconVoice, label: "음성인식", note: "말한 내용을 텍스트로" },
    { Icon: IconReport, label: "AI 리포트", note: "읽을 수 있는 한 장" },
]

const PAIN_POINTS = [
    "강사 열 명의 수업을 다 들어볼 수는 없습니다",
    "“오늘 뭐 배웠어요?” — 학부모 문의에 답할 근거가 없습니다",
    "결석생 보강은 매번 강사의 개인 부담입니다",
]

// 진입 경로가 SW·HW 두 갈래라, 온라인/대면 어느 쪽이든 녹화된다는 사실을 먼저 못박는다
const RECORDING_PATHS = [
    {
        icon: Laptop,
        badge: "온라인 수업",
        title: "Classin 소프트웨어가 녹화합니다",
        detail:
            "화면, 음성, 판서가 그대로 담깁니다. 별도 녹화 프로그램이나 저장 장치가 필요 없습니다.",
        points: ["화면 · 음성 · 판서 동시 기록", "수업 종료와 동시에 클라우드 저장"],
        image: "/images/product/hw/features/feature-interactive.webp",
        imageAlt: "원격 학생 화면이 상단에 표시된 Classin 보드 앞에서 수업하는 강사",
    },
    {
        icon: Presentation,
        badge: "대면 교실 수업",
        title: "전자칠판과 AI 카메라가 녹화합니다",
        detail:
            "AI 카메라가 강사를 자동으로 따라가며 촬영하고, 칠판 판서까지 함께 캡처합니다. 촬영 담당자가 필요 없습니다.",
        points: ["강사 자동 추적 촬영 · 자동 줌", "판서 자동 캡처 · 수업 영상 자동 생성"],
        image: "/images/case-studies/busan-gwasaram.jpg",
        imageAlt: "전자칠판 두 대에 판서하며 대면 수업을 진행하는 학원 교실",
    },
]

const RECORDING_FEATURES = [
    {
        icon: Video,
        label: "빠짐없이 쌓입니다",
        detail: "강사가 잊어도, 바쁜 날에도 누락되는 수업이 없습니다. 모든 수업이 자동으로 기록됩니다.",
    },
    {
        icon: Cloud,
        label: "클라우드 저장",
        detail: "종료와 동시에 클라우드에 저장됩니다. 파일을 옮기고 정리하고 공유하는 업무가 사라집니다.",
    },
    {
        icon: MonitorPlay,
        label: "앱 내 재생",
        detail: "학생은 앱에서 바로 다시 봅니다. 결석 보강도, 시험 전 복습도 링크 하나면 됩니다.",
    },
]

const TRUST_ITEMS = [
    { icon: BadgeCheck, label: "재생 시 워터마크 표시" },
    { icon: Lock, label: "외부 다운로드 차단" },
    { icon: Copyright, label: "저작권은 기관과 강사에게" },
]

const REPORT_POINTS = [
    {
        icon: Mic,
        label: "음성인식 기반",
        detail: "수업 음성을 텍스트로 옮기고, AI가 핵심만 리포트로 정리합니다.",
    },
    {
        icon: FileText,
        label: "60분을 한 장으로",
        detail: "다시 듣지 않아도 됩니다. 수업의 흐름을 리포트 한 장으로 파악합니다.",
    },
    {
        icon: Sparkles,
        label: "모든 수업에 쌓입니다",
        detail: "특정 수업만이 아니라, 녹화된 수업마다 리포트가 기록으로 남습니다.",
    },
]

// "왜 좋은가"를 원장의 손익으로 번역하는 자리. 큰 번호 + 넉넉한 여백으로 위계를 준다.
const BENEFITS = [
    {
        numeral: "01",
        title: "좋은 수업이 강사가 아니라 학원에 남습니다",
        body: "에이스 강사가 퇴사하면 그 반이 흔들립니다. 잘 되던 수업이 어떤 흐름이었는지가 그 사람 머릿속에만 있었기 때문입니다. 녹화와 리포트가 쌓이면 그 흐름이 학원의 기록이 됩니다. 다음 강사는 백지가 아니라 그 기록에서 시작합니다.",
        gains: ["강사 이직에 흔들리는 폭이 줄어듭니다", "신입 강사가 참고할 실제 수업이 생깁니다"],
    },
    {
        numeral: "02",
        title: "상담이 인상에서 근거로 바뀝니다",
        body: "“잘 하고 있어요”와 “지난 3주 동안 이 개념을 이렇게 다뤘고, 지금은 여기까지 왔습니다”는 학부모에게 완전히 다르게 들립니다. 수업 리포트는 상담 테이블에 올려놓을 근거가 됩니다.",
        gains: ["재등록 상담의 설득력이 올라갑니다", "학부모 클레임에 기록으로 대응합니다"],
    },
    {
        numeral: "03",
        title: "매주 반복되던 일이 사라집니다",
        body: "녹화 파일을 찾아 옮기고, 결석생 보강 시간을 따로 잡고, 무슨 수업이었는지 강사에게 다시 묻는 일 — 학원에서 매주 반복되는 이 업무들이 자동으로 처리됩니다.",
        gains: ["강사가 수업에 쓸 시간이 늘어납니다", "실장의 응대 업무가 가벼워집니다"],
    },
]

const SCENARIO_CARDS = [
    {
        icon: Eye,
        badge: "강사 관리",
        headline: "신입 강사의 수업,\n리포트로 먼저 봅니다",
        detail:
            "모든 수업을 참관할 수는 없습니다. 리포트로 수업 흐름을 먼저 파악하고, 필요한 수업만 녹화로 확인하세요. 코칭에 근거가 생깁니다.",
        before: "가끔 참관하거나, 강사 말에 의존",
        after: "전 수업 리포트로 확인 후 필요한 수업만 열람",
    },
    {
        icon: Users,
        badge: "학부모 응대",
        headline: "“오늘 뭐 배웠어요?”에\n기록으로 답합니다",
        detail:
            "학부모 문의에 기억으로 답하는 학원과 기록으로 답하는 학원은 신뢰가 다릅니다. 수업 리포트가 상담의 근거가 됩니다.",
        before: "강사에게 다시 묻고, 기억에 의존해 전달",
        after: "그날 수업 리포트를 근거로 바로 답변",
    },
    {
        icon: CalendarX,
        badge: "결석 · 보강",
        headline: "보강 요청에\n링크 하나로 답합니다",
        detail:
            "결석한 학생에게 녹화와 리포트를 함께 보내면, 보강의 상당 부분이 그것으로 해결됩니다. 강사의 반복 부담이 줄어듭니다.",
        before: "강사가 따로 시간을 내어 보강 진행",
        after: "녹화와 리포트 전달 후, 남은 질문만 보강",
    },
]

// 음성 파형 모의 UI 막대 높이(px) — 고정값이라 SSR/CSR 불일치 없음
const WAVEFORM_HEIGHTS = [
    10, 18, 26, 14, 30, 22, 12, 28, 20, 34, 16, 24, 12, 30, 18, 26,
    14, 32, 20, 12, 28, 16, 24, 34, 18, 10, 26, 20,
]

function Eyebrow({ children }: { children: React.ReactNode }) {
    return (
        <span className="inline-flex items-center px-3 py-1 rounded-full bg-[#ECFDF5] border border-[#084734]/15 text-xs font-semibold tracking-widest text-[#084734] uppercase">
            {children}
        </span>
    )
}

/** 반복되던 민트 채움 대신 헤어라인 아웃라인 — 넓은 면은 뉴트럴로 두는 원칙 */
function OutlineIcon({ children }: { children: React.ReactNode }) {
    return (
        <div className="w-12 h-12 rounded-xl border border-black/[0.08] bg-white text-[#084734] flex items-center justify-center shrink-0">
            {children}
        </div>
    )
}

function ContactCta({ ctaId, children }: { ctaId: string; children: React.ReactNode }) {
    return (
        <TrackedLink
            href="/contact#contact-form"
            ctaId={ctaId}
            className="inline-flex items-center justify-center gap-2 rounded-md bg-[#084734] px-7 py-3.5 text-base font-semibold text-white hover:bg-[#065c41] transition-colors"
        >
            {children}
            <ArrowRight className="w-4 h-4" />
        </TrackedLink>
    )
}

/* ================================================================
   섹션 1 — 히어로: 문제 제기
================================================================ */
function HeroSection() {
    return (
        <section className="pt-20 pb-28 md:pt-28 md:pb-40">
            <div className="container mx-auto px-4 lg:px-8">
                <motion.div {...fadeUp} className="max-w-3xl mx-auto text-center">
                    <Eyebrow>녹화 · AI 리포트</Eyebrow>
                    <h1 className="mt-7 text-4xl sm:text-5xl md:text-6xl font-bold text-[#111110] leading-[1.15]">
                        수업이 끝나면,
                        <br />
                        그 수업이 어땠는지 <span className="text-[#084734]">아무도 모릅니다</span>
                    </h1>
                    <p className="mt-7 text-base sm:text-lg text-[#615D59] leading-relaxed max-w-2xl mx-auto">
                        이제는 다릅니다. 온라인 수업도, 대면 교실 수업도 자동으로 녹화되고,
                        음성인식이 수업 내용을 리포트로 정리합니다. 원장님이 교실에 없어도,
                        학원의 모든 수업이 보이기 시작합니다.
                    </p>
                </motion.div>

                {/* 원장 고충 3줄 */}
                <div className="mt-16 grid grid-cols-1 md:grid-cols-3 gap-4 max-w-4xl mx-auto">
                    {PAIN_POINTS.map((pain, i) => (
                        <motion.div
                            key={pain}
                            {...stagger(i)}
                            className="rounded-xl bg-white border border-black/[0.08] px-6 py-5 text-sm text-[#31302E] font-medium leading-relaxed text-left"
                        >
                            {pain}
                        </motion.div>
                    ))}
                </div>

                {/* 수업이 끝난 교실 — 문제를 눈으로 보여주는 자리 */}
                <motion.div {...fadeUp} className="mt-16 max-w-4xl mx-auto">
                    <div className="relative aspect-[16/9] rounded-2xl overflow-hidden border border-black/[0.08] bg-[#F0F0EC]">
                        <Image
                            src="/images/case-studies/cheonan-jayscan.jpg"
                            alt="수업이 끝나 학생들이 모두 떠난 학원 교실"
                            fill
                            priority
                            sizes="(min-width: 896px) 896px, 100vw"
                            className="object-cover"
                        />
                    </div>
                    <p className="mt-5 text-center text-sm text-[#A39E98]">
                        수업이 끝난 교실. 오늘 여기서 어떤 수업이 있었는지는, 강사에게 묻는 수밖에 없습니다.
                    </p>
                </motion.div>

                <motion.div {...fadeUp} className="mt-16 flex flex-col sm:flex-row items-center justify-center gap-4">
                    <ContactCta ctaId="ai_report_hero_contact">도입 상담 신청</ContactCta>
                    <a
                        href="#pipeline"
                        className="inline-flex items-center gap-2 rounded-md border border-black/[0.08] bg-white px-7 py-3.5 text-base font-semibold text-[#31302E] hover:bg-[#F6F5F4] transition-colors"
                    >
                        어떻게 되는지 보기
                    </a>
                </motion.div>
            </div>
        </section>
    )
}

/* ================================================================
   섹션 2 — 파이프라인: 커스텀 라인아트 4단계
================================================================ */
function PipelineSection() {
    return (
        <section id="pipeline" className="py-28 md:py-36 bg-[#F6F5F4] scroll-mt-20">
            <div className="container mx-auto px-4 lg:px-8">
                <motion.div {...fadeUp} className="max-w-2xl mx-auto text-center mb-20 md:mb-24">
                    <Eyebrow>전체 흐름</Eyebrow>
                    <h2 className="mt-6 text-3xl sm:text-4xl md:text-5xl font-bold text-[#111110] leading-tight">
                        수업 한 번이,
                        <br />
                        <span className="text-[#084734]">리포트 한 장이 되기까지</span>
                    </h2>
                    <p className="mt-6 text-base sm:text-lg text-[#615D59] leading-relaxed">
                        원장님이 해야 할 일은 없습니다. 네 단계 모두 수업과 동시에 진행됩니다.
                    </p>
                </motion.div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-x-6 gap-y-14 max-w-6xl mx-auto">
                    {PIPELINE_STEPS.map((step, i) => (
                        <motion.div key={step.label} {...stagger(i)} className="relative text-center lg:text-left">
                            {/* 단계 사이 연결선 — 데스크톱에서만 */}
                            {i < PIPELINE_STEPS.length - 1 && (
                                <div className="hidden lg:block absolute top-[30px] left-[76px] right-[-24px] h-px bg-black/[0.10]" />
                            )}
                            <div className="flex flex-col items-center lg:items-start">
                                <div className="relative">
                                    <div className="w-[60px] h-[60px] rounded-2xl bg-white border border-black/[0.08] flex items-center justify-center text-[#084734]">
                                        <step.Icon className="w-8 h-8" />
                                    </div>
                                </div>
                                <span className="mt-6 block text-[11px] font-bold tracking-[0.18em] text-[#A39E98] tabular-nums">
                                    {String(i + 1).padStart(2, "0")}
                                </span>
                                <h3 className="mt-2 text-lg font-bold text-[#111110]">{step.label}</h3>
                                <p className="mt-1.5 text-sm text-[#615D59] leading-relaxed">{step.note}</p>
                            </div>
                        </motion.div>
                    ))}
                </div>
            </div>
        </section>
    )
}

/* ================================================================
   섹션 3 — 자동 녹화 딥다이브
================================================================ */
function RecordingSection() {
    const prefersReduced = useReducedMotion()

    return (
        <section id="auto-recording" className="py-28 md:py-36 bg-white scroll-mt-20">
            <div className="container mx-auto px-4 lg:px-8">
                <motion.div {...fadeUp} className="max-w-2xl mx-auto text-center mb-20">
                    <Eyebrow>Step 1 — 자동 녹화</Eyebrow>
                    <h2 className="mt-6 text-3xl sm:text-4xl md:text-5xl font-bold text-[#111110] leading-tight">
                        누르지 않아도,
                        <br />
                        <span className="text-[#084734]">녹화되고 있습니다</span>
                    </h2>
                    <p className="mt-6 text-base sm:text-lg text-[#615D59] leading-relaxed">
                        녹화는 사람이 챙기는 순간 구멍이 납니다. Classin은 수업 자체가
                        녹화의 시작 버튼입니다.
                    </p>
                </motion.div>

                {/* 녹화 경로 2종 — 온라인이든 대면이든 녹화된다 */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-5xl mx-auto mb-28">
                    {RECORDING_PATHS.map((path, i) => (
                        <motion.div
                            key={path.badge}
                            {...stagger(i)}
                            className="rounded-2xl bg-white border border-black/[0.08] overflow-hidden"
                        >
                            {/* 각 경로가 실제로 어떤 교실인지 사진으로 증명한다 */}
                            <div className="relative aspect-[16/9] bg-[#F0F0EC]">
                                <Image
                                    src={path.image}
                                    alt={path.imageAlt}
                                    fill
                                    sizes="(min-width: 768px) 50vw, 100vw"
                                    className="object-cover"
                                />
                            </div>
                            <div className="p-8 sm:p-9">
                                <div className="flex items-center gap-3 mb-6">
                                    <div className="w-10 h-10 rounded-xl bg-[#ECFDF5] flex items-center justify-center shrink-0">
                                        <path.icon className="w-5 h-5 text-[#084734]" />
                                    </div>
                                    <span className="text-xs font-semibold tracking-wider uppercase text-[#084734]">
                                        {path.badge}
                                    </span>
                                </div>
                                <h3 className="text-lg sm:text-xl font-bold text-[#111110] leading-snug mb-4">
                                    {path.title}
                                </h3>
                                <p className="text-sm text-[#615D59] leading-relaxed mb-6">{path.detail}</p>
                                <ul className="space-y-2.5 pt-6 border-t border-black/[0.06]">
                                    {path.points.map((point) => (
                                        <li key={point} className="flex items-start gap-2.5 text-sm text-[#31302E]">
                                            <CheckCircle2 className="w-4 h-4 text-[#084734] shrink-0 mt-0.5" />
                                            {point}
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        </motion.div>
                    ))}
                </div>

                <div className="flex flex-col lg:flex-row items-center gap-16 lg:gap-24 max-w-6xl mx-auto">
                    <div className="flex-1 max-w-xl">
                        <motion.h3 {...fadeUp} className="text-2xl sm:text-3xl font-bold text-[#111110] leading-tight mb-10">
                            어느 쪽이든, 그다음은 똑같습니다
                        </motion.h3>
                        <div className="space-y-5">
                            {RECORDING_FEATURES.map((feature, i) => (
                                <motion.div key={feature.label} {...stagger(i)} className="flex items-start gap-5">
                                    <OutlineIcon>
                                        <feature.icon className="w-5 h-5" />
                                    </OutlineIcon>
                                    <div className="flex-1 min-w-0 pt-1">
                                        <h4 className="font-bold text-[#111110] mb-1.5 text-[15px]">{feature.label}</h4>
                                        <p className="text-sm text-[#615D59] leading-relaxed">{feature.detail}</p>
                                    </div>
                                </motion.div>
                            ))}
                        </div>
                    </div>

                    {/* 녹화 재생 모의 UI */}
                    <div className="flex-1 w-full max-w-lg relative">
                        <motion.div {...fadeUp}>
                            <div className="bg-[#1a1a19] rounded-[16px] p-5 sm:p-7 shadow-2xl relative overflow-hidden">
                                <div className="flex items-start justify-between gap-3 mb-5">
                                    <div>
                                        <div className="text-white font-bold text-sm sm:text-base">중3 수학 — 이차함수와 그래프</div>
                                        <div className="text-white/40 text-xs mt-1">3월 14일 · 19:00 – 20:00</div>
                                    </div>
                                    <div className="flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1.5 shrink-0">
                                        <motion.span
                                            animate={prefersReduced ? undefined : { opacity: [1, 0.25, 1] }}
                                            transition={{ repeat: Infinity, duration: 1.6 }}
                                            className="w-2 h-2 rounded-full bg-[#6EE7B7]"
                                        />
                                        <span className="text-[11px] font-semibold text-white/70">자동 녹화 중</span>
                                    </div>
                                </div>

                                <div className="relative aspect-[16/10] rounded-xl bg-white/[0.04] border border-white/10 mb-5 overflow-hidden">
                                    <div className="absolute inset-0 p-6 space-y-3">
                                        <div className="h-2 w-1/2 rounded bg-white/10" />
                                        <div className="h-2 w-2/3 rounded bg-white/10" />
                                        <div className="h-2 w-2/5 rounded bg-[#6EE7B7]/25" />
                                        <div className="h-2 w-3/5 rounded bg-white/10" />
                                    </div>
                                    <div className="absolute inset-0 flex items-center justify-center">
                                        <div className="w-14 h-14 rounded-full bg-white/10 border border-white/20 backdrop-blur-sm flex items-center justify-center">
                                            <Play className="w-5 h-5 text-white translate-x-0.5" fill="currentColor" />
                                        </div>
                                    </div>
                                </div>

                                <div className="h-1.5 rounded-full bg-white/10 overflow-hidden mb-2">
                                    <motion.div
                                        initial={{ width: 0 }}
                                        whileInView={{ width: "62%" }}
                                        viewport={{ once: true }}
                                        transition={{ duration: 1.4, delay: 0.4, ease }}
                                        className="h-full rounded-full bg-[#6EE7B7]"
                                    />
                                </div>
                                <div className="flex justify-between text-[11px] text-white/40 font-medium tabular-nums">
                                    <span>37:12</span>
                                    <span>60:00</span>
                                </div>
                            </div>

                            <motion.div
                                {...stagger(2)}
                                className="absolute -bottom-5 -left-2 sm:-left-6 flex items-center gap-2 rounded-xl bg-white border border-black/[0.06] shadow-xl px-4 py-3"
                            >
                                <CheckCircle2 className="w-4 h-4 text-[#084734]" />
                                <span className="text-xs font-semibold text-[#31302E]">클라우드 저장 완료</span>
                            </motion.div>
                        </motion.div>
                    </div>
                </div>

                {/* 신뢰 라인 */}
                <motion.div {...fadeUp} className="mt-28 max-w-3xl mx-auto">
                    <div className="flex flex-col sm:flex-row items-stretch justify-center gap-3">
                        {TRUST_ITEMS.map((item) => (
                            <div
                                key={item.label}
                                className="flex-1 flex items-center justify-center gap-2.5 rounded-xl bg-[#FAFAF8] border border-black/[0.08] px-5 py-4"
                            >
                                <item.icon className="w-4 h-4 text-[#084734] shrink-0" />
                                <span className="text-sm font-semibold text-[#31302E] whitespace-nowrap">{item.label}</span>
                            </div>
                        ))}
                    </div>
                    <p className="mt-5 text-center text-xs text-[#A39E98]">
                        녹화본은 앱 내 재생만 허용됩니다. 저작권은 기관과 강사에게 있습니다.
                    </p>
                </motion.div>
            </div>
        </section>
    )
}

/* ================================================================
   섹션 4 — 음성인식 · AI 리포트 (페이지의 심장)
================================================================ */
function ReportSection() {
    const prefersReduced = useReducedMotion()

    return (
        <section className="py-28 md:py-36 bg-[#F6F5F4]">
            <div className="container mx-auto px-4 lg:px-8">
                <div className="flex flex-col lg:flex-row items-center gap-16 lg:gap-24 max-w-6xl mx-auto">
                    <div className="flex-1 max-w-xl order-1">
                        <motion.div {...fadeUp}>
                            <Eyebrow>Step 2 — 음성인식 · AI 리포트</Eyebrow>
                            <h2 className="mt-6 text-3xl sm:text-4xl md:text-5xl font-bold text-[#111110] leading-tight">
                                60분 수업이,
                                <br />
                                <span className="text-[#084734]">읽을 수 있는 리포트가 됩니다</span>
                            </h2>
                            <p className="mt-6 text-base sm:text-lg text-[#615D59] leading-relaxed mb-12">
                                녹화가 끝나면 음성인식이 수업 내용을 텍스트로 옮기고, AI가 핵심만
                                리포트로 정리합니다. 다시 듣지 않아도, 읽으면 됩니다.
                            </p>
                        </motion.div>
                        <div className="space-y-5">
                            {REPORT_POINTS.map((point, i) => (
                                <motion.div key={point.label} {...stagger(i)} className="flex items-start gap-5">
                                    <OutlineIcon>
                                        <point.icon className="w-5 h-5" />
                                    </OutlineIcon>
                                    <div className="flex-1 min-w-0 pt-1">
                                        <h3 className="font-bold text-[#111110] mb-1.5 text-[15px]">{point.label}</h3>
                                        <p className="text-sm text-[#615D59] leading-relaxed">{point.detail}</p>
                                    </div>
                                </motion.div>
                            ))}
                        </div>
                    </div>

                    {/* AI 리포트 모의 UI */}
                    <div className="flex-1 w-full max-w-lg order-2">
                        <motion.div {...fadeUp}>
                            <div className="rounded-[12px] bg-white border border-black/[0.08] shadow-[0_4px_24px_rgba(0,0,0,0.06)] p-5 sm:p-6">
                                <div className="flex items-center justify-between gap-3 mb-1">
                                    <div className="flex items-center gap-2">
                                        <span className="w-2 h-2 rounded-full bg-[#084734]" />
                                        <span className="text-sm font-bold text-[#111110]">AI 수업 리포트</span>
                                    </div>
                                    <span className="rounded-full bg-[#F6F5F4] px-2.5 py-1 text-[10px] font-semibold text-[#A39E98] tracking-wider uppercase">
                                        예시 화면
                                    </span>
                                </div>
                                <div className="text-xs text-[#A39E98] mb-5">중3 수학 — 이차함수와 그래프 · 60분</div>

                                <div className="rounded-xl bg-[#FAFAF8] border border-black/[0.06] px-4 py-4 mb-4">
                                    <div className="flex items-end justify-between gap-[3px] h-9">
                                        {WAVEFORM_HEIGHTS.map((height, i) => (
                                            <motion.span
                                                key={i}
                                                animate={prefersReduced ? undefined : { scaleY: [1, 1.5, 0.7, 1] }}
                                                transition={{ repeat: Infinity, duration: 1.3, delay: i * 0.045 }}
                                                style={{ height }}
                                                className="w-[3px] rounded-full bg-[#084734]/50 origin-bottom"
                                            />
                                        ))}
                                    </div>
                                    <div className="mt-3 flex items-center gap-1.5 text-[11px] font-medium text-[#615D59]">
                                        <Mic className="w-3 h-3 text-[#084734]" />
                                        음성인식으로 수업 전체를 텍스트로 변환
                                    </div>
                                </div>

                                <div className="space-y-3">
                                    <motion.div {...stagger(0)} className="rounded-xl border border-black/[0.06] p-4">
                                        <div className="text-[11px] font-bold text-[#084734] tracking-wider uppercase mb-1.5">수업 요약</div>
                                        <p className="text-[13px] text-[#31302E] leading-relaxed">
                                            이차함수의 그래프 개형과 꼭짓점 공식을 다뤘습니다. 후반 20분은
                                            기출 3문항을 함께 풀며 표준형 변환 과정을 반복 연습했습니다.
                                        </p>
                                    </motion.div>
                                    <motion.div {...stagger(1)} className="rounded-xl border border-black/[0.06] p-4">
                                        <div className="text-[11px] font-bold text-[#084734] tracking-wider uppercase mb-2">오늘 다룬 개념</div>
                                        <div className="flex flex-wrap gap-1.5">
                                            {["이차함수 표준형", "꼭짓점 공식", "판별식"].map((concept) => (
                                                <span
                                                    key={concept}
                                                    className="rounded-full bg-[#ECFDF5] px-2.5 py-1 text-xs font-semibold text-[#084734]"
                                                >
                                                    {concept}
                                                </span>
                                            ))}
                                        </div>
                                    </motion.div>
                                    <motion.div {...stagger(2)} className="rounded-xl border border-black/[0.06] p-4">
                                        <div className="text-[11px] font-bold text-[#084734] tracking-wider uppercase mb-1.5">진도 · 다음 수업</div>
                                        <p className="text-[13px] text-[#31302E] leading-relaxed">
                                            교재 84–91p 완료 · 다음 수업은 92p 연습문제부터 시작
                                        </p>
                                    </motion.div>
                                    <motion.div {...stagger(3)} className="rounded-xl border border-black/[0.06] p-4">
                                        <div className="text-[11px] font-bold text-[#084734] tracking-wider uppercase mb-1.5">과제 안내</div>
                                        <p className="text-[13px] text-[#31302E] leading-relaxed">
                                            유형 문제집 5단원 12문항, 다음 수업 전까지
                                        </p>
                                    </motion.div>
                                </div>
                            </div>
                        </motion.div>
                    </div>
                </div>
            </div>
        </section>
    )
}

/* ================================================================
   섹션 5 — 우리 학원에 무엇이 남는가 (이득)
   큰 번호 + 넓은 여백으로 위계를 만든다. 아이콘 없이 타이포로만.
================================================================ */
function BenefitsSection() {
    return (
        <section className="py-28 md:py-40 bg-[#ECFDF5]">
            <div className="container mx-auto px-4 lg:px-8">
                <motion.div {...fadeUp} className="max-w-2xl mx-auto text-center mb-24 md:mb-28">
                    <Eyebrow>우리 학원에 무엇이 남는가</Eyebrow>
                    <h2 className="mt-6 text-3xl sm:text-4xl md:text-5xl font-bold text-[#111110] leading-tight">
                        기능이 아니라,
                        <br />
                        <span className="text-[#084734]">학원이 얻는 것</span>
                    </h2>
                    <p className="mt-6 text-base sm:text-lg text-[#615D59] leading-relaxed">
                        녹화와 리포트가 학원 운영에서 실제로 무엇을 바꾸는지, 원장님의 손익으로 정리했습니다.
                    </p>
                </motion.div>

                <div className="max-w-4xl mx-auto space-y-20 md:space-y-28">
                    {BENEFITS.map((benefit, i) => (
                        <motion.div
                            key={benefit.numeral}
                            {...stagger(i)}
                            className="flex flex-col md:flex-row md:items-start gap-6 md:gap-14"
                        >
                            <span className="text-5xl md:text-6xl font-bold text-[#084734]/25 tabular-nums leading-none shrink-0 md:w-24">
                                {benefit.numeral}
                            </span>
                            <div className="flex-1 min-w-0">
                                <h3 className="text-2xl md:text-3xl font-bold text-[#111110] leading-snug mb-5">
                                    {benefit.title}
                                </h3>
                                <p className="text-base text-[#615D59] leading-[1.85] mb-8">{benefit.body}</p>
                                <ul className="space-y-3 pt-7 border-t border-[#084734]/12">
                                    {benefit.gains.map((gain) => (
                                        <li key={gain} className="flex items-start gap-3 text-[15px] font-medium text-[#084734]">
                                            <ArrowRight className="w-4 h-4 shrink-0 mt-1" />
                                            {gain}
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        </motion.div>
                    ))}
                </div>
            </div>
        </section>
    )
}

/* ================================================================
   섹션 6 — 원장 활용 시나리오
================================================================ */
function ScenarioSection() {
    return (
        <section className="py-28 md:py-36 bg-white">
            <div className="container mx-auto px-4 lg:px-8">
                <motion.div {...fadeUp} className="text-center mb-20">
                    <Eyebrow>원장의 하루가 바뀝니다</Eyebrow>
                    <h2 className="mt-6 text-3xl sm:text-4xl md:text-5xl font-bold text-[#111110] leading-tight">
                        원장실에서,
                        <br />
                        <span className="text-[#084734]">학원의 모든 수업이 보입니다</span>
                    </h2>
                </motion.div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-5xl mx-auto">
                    {SCENARIO_CARDS.map((card, i) => (
                        <motion.div
                            key={card.badge}
                            {...stagger(i)}
                            className="rounded-2xl bg-[#FAFAF8] border border-black/[0.08] p-8 sm:p-9 flex flex-col gap-6"
                        >
                            {/* 카드에서는 아이콘 컨테이너 없이 아이콘만 — 반복을 피한 세 번째 처리 */}
                            <div className="flex items-center gap-2.5">
                                <card.icon className="w-[18px] h-[18px] text-[#084734]" />
                                <span className="text-xs font-semibold tracking-wider uppercase text-[#084734]">
                                    {card.badge}
                                </span>
                            </div>
                            <h3 className="text-xl font-bold text-[#111110] leading-snug whitespace-pre-line">
                                {card.headline}
                            </h3>
                            <p className="text-sm text-[#615D59] leading-relaxed flex-1">{card.detail}</p>

                            {/* 지금 방식 → Classin 대조 — 전환 이유를 눈에 보이게 */}
                            <div className="pt-6 border-t border-black/[0.06] space-y-3">
                                <div className="flex items-start gap-3">
                                    <span className="text-[10px] font-bold tracking-wider uppercase text-[#A39E98] shrink-0 w-12 pt-0.5">
                                        지금
                                    </span>
                                    <span className="text-xs text-[#A39E98] leading-relaxed">{card.before}</span>
                                </div>
                                <div className="flex items-start gap-3">
                                    <span className="text-[10px] font-bold tracking-wider uppercase text-[#084734] shrink-0 w-12 pt-0.5">
                                        Classin
                                    </span>
                                    <span className="text-xs text-[#31302E] font-medium leading-relaxed">{card.after}</span>
                                </div>
                            </div>
                        </motion.div>
                    ))}
                </div>
            </div>
        </section>
    )
}

/* ================================================================
   섹션 7 — 원장이 자주 묻는 것 (가상 Q&A)
================================================================ */
function QaSection() {
    return (
        <section className="py-28 md:py-36 bg-[#F6F5F4]">
            <div className="container mx-auto px-4 lg:px-8">
                <motion.div {...fadeUp} className="max-w-2xl mx-auto text-center mb-20">
                    <Eyebrow>원장이 자주 묻는 것</Eyebrow>
                    <h2 className="mt-6 text-3xl sm:text-4xl md:text-5xl font-bold text-[#111110] leading-tight">
                        도입 전에,
                        <br />
                        <span className="text-[#084734]">가장 많이 받는 질문들</span>
                    </h2>
                    <p className="mt-6 text-base sm:text-lg text-[#615D59] leading-relaxed">
                        상담에서 실제로 반복되는 질문을 그대로 옮겼습니다.
                    </p>
                </motion.div>

                <div className="max-w-3xl mx-auto">
                    {AI_REPORT_QA.map((item, i) => (
                        <motion.div
                            key={item.question}
                            {...fadeUp}
                            className="py-9 md:py-10 border-t border-black/[0.08] last:border-b"
                        >
                            <div className="flex gap-5 md:gap-7">
                                <span className="text-sm font-bold text-[#084734] tabular-nums shrink-0 pt-1">
                                    Q{i + 1}
                                </span>
                                <div className="flex-1 min-w-0">
                                    <h3 className="text-lg md:text-xl font-bold text-[#111110] leading-snug mb-4">
                                        {item.question}
                                    </h3>
                                    <p className="text-[15px] text-[#615D59] leading-[1.85]">{item.answer}</p>
                                </div>
                            </div>
                        </motion.div>
                    ))}
                </div>

                <motion.p {...fadeUp} className="mt-14 text-center text-sm text-[#A39E98]">
                    여기에 없는 질문은 상담에서 직접 답변해 드립니다.
                </motion.p>
            </div>
        </section>
    )
}

/* ================================================================
   섹션 8 — 마무리 + CTA
================================================================ */
function ClosingSection() {
    return (
        <section className="py-28 md:py-40 bg-white">
            <div className="container mx-auto px-4 lg:px-8">
                <motion.div {...fadeUp} className="max-w-2xl mx-auto text-center">
                    <h2 className="text-3xl sm:text-4xl md:text-5xl font-bold text-[#111110] leading-tight">
                        녹화는 쌓이고,
                        <br />
                        <span className="text-[#084734]">리포트는 학원의 자산이 됩니다</span>
                    </h2>
                    <p className="mt-7 text-base sm:text-lg text-[#615D59] leading-relaxed">
                        강사가 바뀌어도 수업 기록은 학원에 남습니다. 좋은 수업이 개인기가 아니라
                        시스템이 되는 것 — Classin이 말하는 수업 시스템 OS의 시작입니다.
                    </p>
                </motion.div>

                <motion.div {...fadeUp} className="mt-16 text-center">
                    <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
                        <ContactCta ctaId="ai_report_bottom_contact">도입 상담 신청</ContactCta>
                        <a
                            href={BROCHURE_URL}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={() =>
                                trackEvent("download_materials", {
                                    button: "ai_report_brochure",
                                    page: "/product/ai-report",
                                })
                            }
                            className="inline-flex items-center justify-center gap-2 rounded-md border border-black/[0.08] bg-white px-7 py-3.5 text-base font-semibold text-[#31302E] hover:bg-[#F6F5F4] transition-colors"
                        >
                            <Download className="w-4 h-4" />
                            제품 소개서 먼저 보기
                        </a>
                    </div>
                    <p className="mt-5 text-sm text-[#A39E98]">
                        1개 교실 파일럿부터 시작할 수 있습니다. 학원 규모에 맞는 구성을 상담으로 안내해 드립니다.
                    </p>
                    <div className="mt-14 flex flex-col sm:flex-row items-center justify-center gap-3 sm:gap-10">
                        <TrackedLink
                            href="/product/sw"
                            ctaId="ai_report_to_sw"
                            className="inline-flex items-center gap-1.5 text-sm font-semibold text-[#615D59] hover:text-[#084734] transition-colors"
                        >
                            Classin 소프트웨어 전체 보기
                            <ArrowRight className="w-3.5 h-3.5" />
                        </TrackedLink>
                        <TrackedLink
                            href="/product/hw"
                            ctaId="ai_report_to_hw"
                            className="inline-flex items-center gap-1.5 text-sm font-semibold text-[#615D59] hover:text-[#084734] transition-colors"
                        >
                            Classin Board 전자칠판 보기
                            <ArrowRight className="w-3.5 h-3.5" />
                        </TrackedLink>
                    </div>
                </motion.div>
            </div>
        </section>
    )
}

export default function AiReportPage() {
    return (
        <main className="bg-[#FAFAF8]">
            <HeroSection />
            <PipelineSection />
            <RecordingSection />
            <ReportSection />
            <BenefitsSection />
            <ScenarioSection />
            <QaSection />
            <ClosingSection />
        </main>
    )
}
