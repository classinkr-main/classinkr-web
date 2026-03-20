"use client"

import { useState, useMemo } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { Calendar, MapPin, Tag, ArrowRight, Search, ExternalLink } from "lucide-react"
import Image from "next/image"
import Link from "next/link"

// ─── Types ───────────────────────────────────────────────────────
interface EventItem {
    id: number
    title: string
    description: string
    category: "웨비나" | "오프라인 행사" | "프로모션" | "얼리버드" | "파트너십"
    tag: string
    startDate: string
    endDate?: string
    location: string
    status: "진행 중" | "예정" | "마감"
    badge?: string
    cta: string
    ctaHref: string
    highlight?: boolean
    // TODO [DUMMY] 아래 imageUrl은 임시 플레이스홀더입니다. 정식 배포 전 실제 포스터 이미지로 교체하세요.
    imageUrl?: string
}

// ─── Categories ──────────────────────────────────────────────────
const categories = ["전체", "웨비나", "오프라인 행사", "프로모션", "얼리버드", "파트너십"]

// ─────────────────────────────────────────────────────────────────────────────
// TODO [DUMMY DATA] 아래 events 배열 전체는 더미 데이터입니다.
//   정식 배포 전 반드시 아래 항목을 처리하세요:
//   1. events 배열을 API / CMS 연동 데이터로 교체
//   2. 각 항목의 imageUrl placehold.co URL을 실제 포스터 이미지 경로로 교체
//   3. 날짜·장소·설명 등 모든 콘텐츠 확정 후 반영
// 검색: "TODO [DUMMY DATA]" 로 이 파일 전체 더미 블록을 찾을 수 있습니다.
// ─────────────────────────────────────────────────────────────────────────────
const events: EventItem[] = [
    // [DUMMY]
    {
        id: 1,
        title: "클래스인 스프링 얼리버드 — 3개월 무료 체험",
        description: "2025년 상반기를 맞아 신규 도입 학원을 대상으로 첫 3개월 이용료를 전액 면제합니다. 도입 전담 컨설턴트가 온보딩을 무상 지원합니다.",
        category: "얼리버드",
        tag: "한정 100개 학원",
        startDate: "2025. 03. 01",
        endDate: "2025. 04. 30",
        location: "온라인 신청",
        status: "진행 중",
        badge: "HOT",
        cta: "지금 신청하기",
        ctaHref: "/contact",
        highlight: true,
        imageUrl: "https://placehold.co/800x500/064e3b/6ee7b7?text=Early+Bird+%7C+3%EA%B0%9C%EC%9B%94+%EB%AC%B4%EB%A3%8C",
    },
    // [DUMMY]
    {
        id: 2,
        title: "학원 경영 혁신 웨비나 — AI 시대의 학원 운영 전략",
        description: "AI 기반 출결·성적 관리가 실제 학원 재등록률에 미치는 영향을 데이터로 공개합니다. 현장 원장 3인의 실전 사례 발표 포함.",
        category: "웨비나",
        tag: "Live",
        startDate: "2025. 04. 10",
        location: "온라인 (Zoom)",
        status: "예정",
        cta: "사전 등록",
        ctaHref: "/contact",
        imageUrl: "https://placehold.co/320x420/0f172a/34d399?text=Webinar+2025",
    },
    // [DUMMY]
    {
        id: 3,
        title: "클래스인 × 에듀테크 서울 2025 참가",
        description: "국내 최대 에듀테크 박람회에서 클래스인 신기능을 최초 공개합니다. 현장 데모 및 상담 부스를 운영합니다.",
        category: "오프라인 행사",
        tag: "박람회",
        startDate: "2025. 05. 22",
        endDate: "2025. 05. 24",
        location: "COEX, 서울",
        status: "예정",
        cta: "참가 안내 보기",
        ctaHref: "/contact",
        imageUrl: "https://placehold.co/320x420/1e3a5f/93c5fd?text=EduTech+Seoul+2025",
    },
    // [DUMMY]
    {
        id: 4,
        title: "다수 학원 그룹 할인 프로모션 — 3개 이상 동시 도입 시 20% 할인",
        description: "동일 브랜드 또는 협력 관계의 학원 3개 이상이 함께 클래스인을 도입하면 전 플랜 20% 할인 혜택을 제공합니다.",
        category: "프로모션",
        tag: "그룹 할인",
        startDate: "2025. 03. 01",
        endDate: "2025. 06. 30",
        location: "온라인 신청",
        status: "진행 중",
        badge: "NEW",
        cta: "할인 문의",
        ctaHref: "/contact",
        imageUrl: "https://placehold.co/320x420/78350f/fde68a?text=20%25+OFF",
    },
    // [DUMMY]
    {
        id: 5,
        title: "원장님을 위한 데이터 리터러시 워크숍",
        description: "대시보드 숫자를 비즈니스 인사이트로 전환하는 법을 직접 실습합니다. 클래스인 고객 전용 무료 오프라인 워크숍.",
        category: "오프라인 행사",
        tag: "고객 전용",
        startDate: "2025. 04. 26",
        location: "강남 클래스인 오피스",
        status: "예정",
        cta: "참가 신청",
        ctaHref: "/contact",
    },
    // [DUMMY]
    {
        id: 6,
        title: "파트너 학원 연합 세미나 — 재등록률 30% 높이기",
        description: "클래스인 파트너 학원들이 공유하는 성공 전략 세미나. 재등록률, 학부모 소통, 커리큘럼 차별화 3개 세션으로 구성됩니다.",
        category: "파트너십",
        tag: "파트너 전용",
        startDate: "2025. 05. 08",
        location: "온라인 (Zoom)",
        status: "예정",
        cta: "초대 코드 받기",
        ctaHref: "/contact",
        imageUrl: "https://placehold.co/320x420/2e1065/c4b5fd?text=Partner+Seminar",
    },
    // [DUMMY]
    {
        id: 7,
        title: "연간 플랜 전환 특가 — 월 대비 최대 2개월 무료",
        description: "월 구독에서 연간 플랜으로 전환하면 기존 금액 대비 최대 17% 절감됩니다. 4월 말까지 전환 시 추가 온보딩 세션 1회 무료 제공.",
        category: "프로모션",
        tag: "플랜 전환",
        startDate: "2025. 03. 01",
        endDate: "2025. 04. 30",
        location: "마이페이지 전환 신청",
        status: "진행 중",
        cta: "지금 전환하기",
        ctaHref: "/pricing",
    },
    // [DUMMY]
    {
        id: 8,
        title: "신기능 베타 테스터 모집 — AI 학습 경로 추천 엔진",
        description: "클래스인 차기 핵심 기능인 'AI 학습 경로 추천'의 베타 테스터를 50개 학원 대상으로 모집합니다. 피드백 제공 시 3개월 플랜 무상 제공.",
        category: "얼리버드",
        tag: "베타",
        startDate: "2025. 04. 01",
        endDate: "2025. 04. 15",
        location: "온라인 신청",
        status: "예정",
        badge: "BETA",
        cta: "테스터 신청",
        ctaHref: "/contact",
        imageUrl: "https://placehold.co/320x420/1c1917/a8a29e?text=Beta+Tester",
    },
]
// ─── END DUMMY DATA ───────────────────────────────────────────────

// ─── Status Badge ─────────────────────────────────────────────────
function StatusBadge({ status }: { status: EventItem["status"] }) {
    const styles = {
        "진행 중": "bg-emerald-50 text-emerald-700 border border-emerald-200",
        "예정": "bg-blue-50 text-blue-700 border border-blue-200",
        "마감": "bg-[#f0f0ec] text-[#1a1a1a]/40 border border-[#e8e8e4]",
    }
    return (
        <span className={`px-2.5 py-0.5 rounded-full text-[11px] font-semibold ${styles[status]}`}>
            {status}
        </span>
    )
}

// ─── Component ───────────────────────────────────────────────────
export default function EventsPage() {
    const [activeCategory, setActiveCategory] = useState("전체")
    const [searchQuery, setSearchQuery] = useState("")
    const [hoveredId, setHoveredId] = useState<number | null>(null)

    const filtered = useMemo(() => {
        let list = activeCategory === "전체"
            ? events
            : events.filter(e => e.category === activeCategory)
        if (searchQuery.trim()) {
            const q = searchQuery.toLowerCase()
            list = list.filter(e =>
                e.title.toLowerCase().includes(q) ||
                e.description.toLowerCase().includes(q)
            )
        }
        return list
    }, [activeCategory, searchQuery])

    const highlighted = filtered.filter(e => e.highlight)
    const rest = filtered.filter(e => !e.highlight)
    const isAnyHovered = hoveredId !== null

    return (
        <div className="min-h-screen bg-[#FAFAF8] text-[#1a1a1a] selection:bg-emerald-100 selection:text-emerald-900">

            {/* ─── Hero: Left/Right Split ─────────────────────── */}
            <section className="relative pt-32 md:pt-40 pb-6 px-6">
                <div className="max-w-[1100px] mx-auto">
                    <div className="grid grid-cols-1 lg:grid-cols-[1fr_1.1fr] gap-8 lg:gap-12 items-center">

                        {/* ── Left: Title Block ── */}
                        <div>
                            <motion.p
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                transition={{ duration: 0.5 }}
                                className="text-[13px] font-medium text-[#1a1a1a]/35 tracking-wide uppercase mb-5"
                            >
                                Events &amp; Promotions
                            </motion.p>

                            <motion.h1
                                initial={{ opacity: 0, y: 20 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ duration: 0.6, delay: 0.05 }}
                                className="text-[2.5rem] md:text-[3.5rem] lg:text-[4rem] font-extrabold leading-[1.05] tracking-[-0.035em] text-[#111110] mb-5"
                            >
                                행사 &amp;<br />프로모션
                            </motion.h1>

                            <motion.p
                                initial={{ opacity: 0, y: 16 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ duration: 0.5, delay: 0.1 }}
                                className="text-[15px] md:text-[16px] text-[#1a1a1a]/45 max-w-sm leading-relaxed mb-8"
                            >
                                클래스인의 최신 이벤트, 웨비나, 특가 프로모션을 한눈에 확인하세요.
                            </motion.p>

                            <motion.div
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                transition={{ duration: 0.4, delay: 0.2 }}
                                className="flex items-center gap-6 text-[13px] text-[#1a1a1a]/30"
                            >
                                <span className="flex items-center gap-2">
                                    <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                                    진행 중 {events.filter(e => e.status === "진행 중").length}건
                                </span>
                                <span className="flex items-center gap-2">
                                    <span className="w-2 h-2 rounded-full bg-blue-400" />
                                    예정 {events.filter(e => e.status === "예정").length}건
                                </span>
                            </motion.div>
                        </div>

                        {/* ── Right: Featured Event Card ── */}
                        {highlighted.length > 0 && (
                            <motion.div
                                initial={{ opacity: 0, x: 24 }}
                                animate={{ opacity: 1, x: 0 }}
                                transition={{ duration: 0.6, delay: 0.15 }}
                            >
                                {(() => {
                                    const event = highlighted[0]
                                    return (
                                        <div className="relative rounded-2xl overflow-hidden text-white min-h-[340px] md:min-h-[400px]">
                                            {event.imageUrl && (
                                                <Image
                                                    src={event.imageUrl}
                                                    alt={event.title}
                                                    fill
                                                    className="object-cover"
                                                    unoptimized
                                                />
                                            )}
                                            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/40 to-black/10" />
                                            <div className="absolute top-0 right-0 w-56 h-56 bg-emerald-400/[0.08] rounded-full blur-[80px] pointer-events-none" />

                                            <div className="relative z-10 p-8 md:p-10 flex flex-col h-full min-h-[340px] md:min-h-[400px]">
                                                <div className="flex items-center gap-2.5 mb-auto">
                                                    {event.badge && (
                                                        <span className="px-3 py-1 bg-emerald-500 text-white text-[11px] font-bold rounded-md shadow-lg">
                                                            {event.badge}
                                                        </span>
                                                    )}
                                                    <StatusBadge status={event.status} />
                                                </div>

                                                <div className="mt-auto">
                                                    <span className="text-[11px] text-white/40 uppercase tracking-wider mb-2 block">{event.category}</span>
                                                    <h2 className="text-2xl md:text-[1.75rem] font-bold leading-snug tracking-[-0.02em] mb-3">
                                                        {event.title}
                                                    </h2>
                                                    <p className="text-[13px] text-white/55 leading-relaxed mb-5 line-clamp-2">
                                                        {event.description}
                                                    </p>
                                                    <div className="flex flex-wrap items-center gap-4 text-[12px] text-white/40 mb-6">
                                                        <span className="flex items-center gap-1.5">
                                                            <Calendar className="w-3.5 h-3.5" />
                                                            {event.startDate}{event.endDate ? ` ~ ${event.endDate}` : ""}
                                                        </span>
                                                        <span className="flex items-center gap-1.5">
                                                            <MapPin className="w-3.5 h-3.5" />
                                                            {event.location}
                                                        </span>
                                                    </div>
                                                    <Link
                                                        href={event.ctaHref}
                                                        className="inline-flex items-center gap-2 bg-white text-[#111110] text-[13px] font-semibold px-6 py-2.5 rounded-lg hover:bg-emerald-50 transition-colors duration-200 shadow-lg"
                                                    >
                                                        {event.cta}
                                                        <ArrowRight className="w-3.5 h-3.5" />
                                                    </Link>
                                                </div>
                                            </div>
                                        </div>
                                    )
                                })()}
                            </motion.div>
                        )}
                    </div>
                </div>
            </section>

            {/* ─── Filter Bar ──────────────────────────────────── */}
            <section className="max-w-[1100px] mx-auto px-6 mt-6 mb-2">
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ duration: 0.4, delay: 0.2 }}
                    className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-5 border-b border-[#e8e8e4]"
                >
                    <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar">
                        {categories.map((cat) => {
                            const isActive = activeCategory === cat
                            return (
                                <button
                                    key={cat}
                                    onClick={() => setActiveCategory(cat)}
                                    className={`shrink-0 px-3.5 py-1.5 rounded-full text-[13px] font-medium transition-all duration-200 ${
                                        isActive
                                            ? "bg-[#111110] text-white"
                                            : "text-[#1a1a1a]/40 hover:text-[#1a1a1a]/70 hover:bg-[#f0f0ec]"
                                    }`}
                                >
                                    {cat}
                                </button>
                            )
                        })}
                    </div>

                    <div className="relative shrink-0">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#1a1a1a]/20" />
                        <input
                            type="text"
                            placeholder="검색"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="w-full sm:w-52 pl-9 pr-3 py-2 bg-transparent border border-[#e8e8e4] rounded-lg text-[13px] text-[#1a1a1a] placeholder:text-[#1a1a1a]/25 focus:outline-none focus:border-[#1a1a1a]/20 transition-colors"
                        />
                    </div>
                </motion.div>

                <div className="flex items-center justify-between pt-4 pb-2">
                    <span className="text-[12px] text-[#1a1a1a]/30 font-medium">
                        {rest.length}개의 행사·프로모션
                    </span>
                    <span className="text-[12px] text-[#1a1a1a]/25">최신순</span>
                </div>
            </section>

            {/* ─── Event List ──────────────────────────────────── */}
            <section className="max-w-[1100px] mx-auto px-6 pb-28">
                <AnimatePresence mode="wait">
                    <motion.div
                        key={activeCategory + searchQuery}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.25 }}
                    >
                        {rest.map((event, index) => (
                            <motion.div
                                key={event.id}
                                initial={{ opacity: 0, y: 12 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ duration: 0.4, delay: index * 0.04, ease: [0.25, 0.46, 0.45, 0.94] }}
                            >
                                <article
                                    className="grid grid-cols-1 md:grid-cols-[160px_1fr_120px_160px] gap-4 md:gap-6 py-6 border-b border-[#ebebea] transition-opacity duration-300"
                                    style={{
                                        opacity: isAnyHovered ? (hoveredId === event.id ? 1 : 0.3) : 1,
                                    }}
                                    onMouseEnter={() => setHoveredId(event.id)}
                                    onMouseLeave={() => setHoveredId(null)}
                                >
                                    {/* Left: Category + Status */}
                                    <div className="flex md:flex-col gap-2 md:gap-2 md:pt-0.5">
                                        <span className="text-[12px] font-medium text-[#1a1a1a]/40">
                                            {event.category}
                                        </span>
                                        <StatusBadge status={event.status} />
                                        {event.badge && (
                                            <span className="hidden md:inline-flex px-2 py-0.5 bg-amber-50 text-amber-700 border border-amber-200 text-[10px] font-bold rounded-md w-fit">
                                                {event.badge}
                                            </span>
                                        )}
                                    </div>

                                    {/* Center: Content */}
                                    <div className="flex flex-col gap-1.5">
                                        <h2 className="text-[17px] md:text-[19px] font-semibold leading-snug tracking-[-0.015em] text-[#111110]">
                                            {event.title}
                                        </h2>
                                        <p className="text-[13px] text-[#1a1a1a]/38 leading-relaxed line-clamp-2">
                                            {event.description}
                                        </p>
                                        <div className="flex flex-wrap items-center gap-3 mt-1.5">
                                            <span className="text-[11px] text-[#1a1a1a]/30 flex items-center gap-1">
                                                <Calendar className="w-3 h-3" />
                                                {event.startDate}{event.endDate ? ` ~ ${event.endDate}` : ""}
                                            </span>
                                            <span className="text-[#1a1a1a]/10">·</span>
                                            <span className="text-[11px] text-[#1a1a1a]/30 flex items-center gap-1">
                                                <MapPin className="w-3 h-3" />
                                                {event.location}
                                            </span>
                                            <span className="text-[#1a1a1a]/10">·</span>
                                            <span className="text-[11px] text-emerald-600/70 font-medium flex items-center gap-1">
                                                <Tag className="w-3 h-3" />
                                                {event.tag}
                                            </span>
                                        </div>
                                    </div>

                                    {/* Poster thumbnail (if available) */}
                                    {event.imageUrl ? (
                                        <div className="hidden md:block relative w-full h-[110px] rounded-xl overflow-hidden bg-[#f0f0ec] shrink-0">
                                            <Image
                                                src={event.imageUrl}
                                                alt={`${event.title} 포스터`}
                                                fill
                                                className="object-cover transition-transform duration-500 group-hover:scale-[1.04]"
                                                unoptimized
                                            />
                                        </div>
                                    ) : (
                                        /* placeholder slot to keep grid alignment */
                                        <div className="hidden md:block" />
                                    )}

                                    {/* CTA */}
                                    <div className="flex md:flex-col md:items-end md:justify-center gap-3">
                                        <Link
                                            href={event.ctaHref}
                                            className={`inline-flex items-center gap-1.5 text-[13px] font-semibold px-4 py-2 rounded-lg transition-colors duration-200 ${
                                                event.status === "마감"
                                                    ? "bg-[#f0f0ec] text-[#1a1a1a]/30 cursor-not-allowed pointer-events-none"
                                                    : "bg-[#111110] text-white hover:bg-emerald-700"
                                            }`}
                                        >
                                            {event.cta}
                                            <ExternalLink className="w-3.5 h-3.5" />
                                        </Link>
                                    </div>
                                </article>
                            </motion.div>
                        ))}
                    </motion.div>
                </AnimatePresence>

                {/* Empty State */}
                {filtered.length === 0 && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        className="py-28 text-center"
                    >
                        <div className="w-12 h-12 bg-[#f0f0ec] rounded-xl flex items-center justify-center mx-auto mb-4">
                            <Search className="w-5 h-5 text-[#1a1a1a]/20" />
                        </div>
                        <h3 className="text-base font-semibold text-[#111110] mb-1">검색 결과가 없습니다</h3>
                        <p className="text-[13px] text-[#1a1a1a]/30">다른 키워드나 카테고리를 선택해 보세요.</p>
                    </motion.div>
                )}
            </section>
        </div>
    )
}
