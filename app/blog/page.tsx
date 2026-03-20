"use client"

import { useState, useMemo } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { ArrowRight, ArrowUpRight, Clock, Mail, Search } from "lucide-react"
import Image from "next/image"
import Link from "next/link"

// ─── Types ──────────────────────────────────────────────────────
interface BlogPost {
    id: number
    title: string
    excerpt: string
    category: string
    tag: string
    date: string
    author: string
    authorRole: string
    readTime: string
    imageUrl: string
    featured?: boolean
}

// ─── Categories ─────────────────────────────────────────────────
const categories = ["전체", "인사이트", "제품 업데이트", "성공 사례", "교육 트렌드", "데이터 분석", "원장 인터뷰"]

// ─── Blog Posts Data ────────────────────────────────────────────
const blogPosts: BlogPost[] = [
    {
        id: 1,
        title: "학원 교육의 다음 단계: 데이터 기반 개인화 학습의 현재와 미래",
        excerpt: "학생 개개인의 학습 패턴을 분석하고, 맞춤형 커리큘럼을 자동으로 설계하는 기술이 학원 현장에 어떤 변화를 가져오고 있는지 깊이 있게 살펴봅니다.",
        category: "인사이트",
        tag: "Deep Dive",
        date: "2024. 11. 15",
        author: "박지현",
        authorRole: "리서치 리드",
        readTime: "12분",
        imageUrl: "/images/blog/thumb-01.png",
        featured: true
    },
    {
        id: 2,
        title: "무궁화 학원이 6개월 만에 재등록률 89%를 달성한 비결",
        excerpt: "서초구 무궁화 학원은 클래스인 도입 후 학부모 만족도 조사에서 역대 최고점을 기록했습니다. 원장님이 직접 공유하는 운영 전략과 데이터 활용법.",
        category: "성공 사례",
        tag: "Case Study",
        date: "2024. 11. 08",
        author: "김성장",
        authorRole: "고객 성공 매니저",
        readTime: "8분",
        imageUrl: "/images/blog/thumb-02.png",
        featured: true
    },
    {
        id: 3,
        title: "v3.2 업데이트: AI 리포트 자동 생성과 학부모 커뮤니케이션 혁신",
        excerpt: "학부모 상담 준비에 들이는 시간을 80% 줄여주는 AI 리포트 기능이 새롭게 추가되었습니다.",
        category: "제품 업데이트",
        tag: "New Feature",
        date: "2024. 11. 02",
        author: "이서연",
        authorRole: "프로덕트 매니저",
        readTime: "5분",
        imageUrl: "/images/blog/thumb-03.png",
        featured: true
    },
    {
        id: 4,
        title: "2025년 에듀테크 지원사업 총정리 — 원장님이 놓치면 안 되는 7가지",
        excerpt: "정부와 지자체에서 운영하는 주요 에듀테크 지원금 사업을 정리했습니다. 신청 일정, 자격 요건, 예상 수혜 금액까지.",
        category: "교육 트렌드",
        tag: "Guide",
        date: "2024. 10. 25",
        author: "이동향",
        authorRole: "에디터",
        readTime: "10분",
        imageUrl: "/images/blog/thumb-04.png"
    },
    {
        id: 5,
        title: "학원 데이터 리터러시: 숫자 뒤에 숨겨진 학생 이야기 읽기",
        excerpt: "출결률, 과제 완료율, 시험 점수 — 데이터는 단순한 숫자가 아닙니다. 학원 현장에서 데이터를 의미 있게 해석하는 프레임워크.",
        category: "데이터 분석",
        tag: "Framework",
        date: "2024. 10. 18",
        author: "정민수",
        authorRole: "데이터 애널리스트",
        readTime: "9분",
        imageUrl: "/images/blog/thumb-05.png"
    },
    {
        id: 6,
        title: "\"학원의 본질은 결국 사람입니다\" — 한빛 어학원 최수진 원장 인터뷰",
        excerpt: "20년 경력의 최수진 원장이 말하는 학원 경영 철학, 테크놀로지와 휴먼 터치의 균형.",
        category: "원장 인터뷰",
        tag: "Interview",
        date: "2024. 10. 10",
        author: "박지현",
        authorRole: "리서치 리드",
        readTime: "15분",
        imageUrl: "/images/blog/thumb-06.png"
    },
    {
        id: 7,
        title: "대형 프랜차이즈 학원의 디지털 전환 — 성공과 실패 사이의 결정적 차이",
        excerpt: "전국 50개 지점을 운영하는 프랜차이즈 학원들이 디지털 전환에 성공하거나 실패하는 패턴을 분석했습니다.",
        category: "인사이트",
        tag: "Analysis",
        date: "2024. 10. 03",
        author: "김성장",
        authorRole: "고객 성공 매니저",
        readTime: "11분",
        imageUrl: "/images/blog/thumb-07.png"
    },
    {
        id: 8,
        title: "v3.1 패치노트: 대시보드 UX 개선 및 알림 시스템 고도화",
        excerpt: "사용자 피드백을 반영하여 대시보드 레이아웃을 전면 개편했습니다. 새로운 알림 우선순위 시스템.",
        category: "제품 업데이트",
        tag: "Patch Note",
        date: "2024. 09. 26",
        author: "이서연",
        authorRole: "프로덕트 매니저",
        readTime: "4분",
        imageUrl: "/images/blog/thumb-08.png"
    },
    {
        id: 9,
        title: "학부모 세대가 변하고 있다 — MZ 학부모의 학원 선택 기준 리포트",
        excerpt: "MZ세대 학부모 1,200명을 대상으로 진행한 설문 결과를 공개합니다. '소통 방식'과 '데이터 투명성'을 중시하는 새로운 트렌드.",
        category: "교육 트렌드",
        tag: "Research",
        date: "2024. 09. 19",
        author: "정민수",
        authorRole: "데이터 애널리스트",
        readTime: "7분",
        imageUrl: "/images/blog/thumb-09.png"
    },
    {
        id: 10,
        title: "학생 이탈을 예측하는 6가지 데이터 시그널",
        excerpt: "학생이 학원을 그만두기 전, 데이터에서 나타나는 미세한 신호들. 이탈 예측 모델과 실제 적용 사례.",
        category: "데이터 분석",
        tag: "Research",
        date: "2024. 09. 12",
        author: "정민수",
        authorRole: "데이터 애널리스트",
        readTime: "8분",
        imageUrl: "/images/blog/thumb-10.png"
    },
    {
        id: 11,
        title: "\"기술은 도구일 뿐, 방향은 원장이 잡아야 합니다\" — 다산 수학 이정훈 원장",
        excerpt: "수학 전문 학원을 10년간 운영하며 체득한 노하우와, 클래스인 데이터를 활용한 차별화 전략.",
        category: "원장 인터뷰",
        tag: "Interview",
        date: "2024. 09. 05",
        author: "박지현",
        authorRole: "리서치 리드",
        readTime: "13분",
        imageUrl: "/images/blog/thumb-11.png"
    },
    {
        id: 12,
        title: "중소형 학원을 위한 마케팅 자동화 가이드",
        excerpt: "한정된 예산과 인력으로도 효과적인 학원 마케팅이 가능합니다. 자동화 워크플로우 설계법.",
        category: "인사이트",
        tag: "Guide",
        date: "2024. 08. 28",
        author: "이동향",
        authorRole: "에디터",
        readTime: "10분",
        imageUrl: "/images/blog/thumb-12.png"
    },
]

// ─── Component ──────────────────────────────────────────────────
export default function BlogPage() {
    const [activeCategory, setActiveCategory] = useState("전체")
    const [searchQuery, setSearchQuery] = useState("")
    const [hoveredListId, setHoveredListId] = useState<number | null>(null)

    const filteredPosts = useMemo(() => {
        let posts = activeCategory === "전체"
            ? blogPosts
            : blogPosts.filter(post => post.category === activeCategory)

        if (searchQuery.trim()) {
            const q = searchQuery.toLowerCase()
            posts = posts.filter(post =>
                post.title.toLowerCase().includes(q) ||
                post.excerpt.toLowerCase().includes(q) ||
                post.author.toLowerCase().includes(q)
            )
        }
        return posts
    }, [activeCategory, searchQuery])

    // Gallery: top 3 featured posts
    const galleryPosts = filteredPosts.filter(p => p.featured).slice(0, 3)
    // If fewer than 3 featured, fill from top of filtered
    const galleryFinal = galleryPosts.length >= 3
        ? galleryPosts
        : filteredPosts.slice(0, 3)
    const galleryIds = new Set(galleryFinal.map(p => p.id))

    // List: remaining posts
    const listPosts = filteredPosts.filter(p => !galleryIds.has(p.id))

    const isAnyListHovered = hoveredListId !== null

    return (
        <div className="min-h-screen bg-[#FAFAF8] text-[#1a1a1a] selection:bg-emerald-100 selection:text-emerald-900">

            {/* ─── Hero + Gallery ─────────────────────────────── */}
            <section className="relative pt-32 md:pt-40 pb-6 px-6">
                <div className="max-w-[1100px] mx-auto">
                    {/* Title */}
                    <motion.p
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ duration: 0.5 }}
                        className="text-[13px] font-medium text-[#1a1a1a]/35 tracking-wide uppercase mb-5"
                    >
                        Blog
                    </motion.p>

                    <motion.h1
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.6, delay: 0.05 }}
                        className="text-[2.25rem] md:text-[3.25rem] font-bold leading-[1.1] tracking-[-0.03em] text-[#111110] max-w-2xl mb-12"
                    >
                        교육의 미래를
                        <br />
                        함께 만들어갑니다
                    </motion.h1>

                    {/* Gallery Grid: 1 large + 2 stacked */}
                    {galleryFinal.length > 0 && (
                        <motion.div
                            initial={{ opacity: 0, y: 16 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.5, delay: 0.1 }}
                            className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6"
                        >
                            {/* Main featured card */}
                            {galleryFinal[0] && (
                                <Link href={`/blog/${galleryFinal[0].id}`} className="group block">
                                    <article className="relative h-[320px] md:h-[420px] rounded-2xl overflow-hidden bg-[#f0f0ec]">
                                        <Image
                                            src={galleryFinal[0].imageUrl}
                                            alt={galleryFinal[0].title}
                                            fill
                                            className="object-cover transition-transform duration-700 group-hover:scale-[1.03]"
                                        />
                                        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/20 to-transparent" />
                                        <div className="absolute bottom-0 left-0 right-0 p-6 md:p-8">
                                            <div className="flex items-center gap-2.5 mb-3">
                                                <span className="px-2.5 py-0.5 bg-white/15 backdrop-blur-md text-[11px] font-semibold text-white/90 rounded-md border border-white/10">
                                                    {galleryFinal[0].tag}
                                                </span>
                                                <span className="text-[11px] text-white/50">{galleryFinal[0].category}</span>
                                            </div>
                                            <h2 className="text-xl md:text-2xl font-bold text-white leading-snug tracking-[-0.02em] mb-2 line-clamp-2 group-hover:text-emerald-200 transition-colors duration-300">
                                                {galleryFinal[0].title}
                                            </h2>
                                            <p className="text-[13px] text-white/50 line-clamp-2 mb-3 hidden md:block">
                                                {galleryFinal[0].excerpt}
                                            </p>
                                            <div className="flex items-center gap-3 text-[11px] text-white/40">
                                                <span>{galleryFinal[0].date}</span>
                                                <span>·</span>
                                                <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{galleryFinal[0].readTime}</span>
                                                <span>·</span>
                                                <span>{galleryFinal[0].author}</span>
                                            </div>
                                        </div>
                                    </article>
                                </Link>
                            )}

                            {/* Right stack: 2 smaller cards */}
                            <div className="grid grid-cols-1 gap-4">
                                {galleryFinal.slice(1, 3).map((post) => (
                                    <Link key={post.id} href={`/blog/${post.id}`} className="group block">
                                        <article className="relative h-[200px] md:h-[202px] rounded-2xl overflow-hidden bg-[#f0f0ec]">
                                            <Image
                                                src={post.imageUrl}
                                                alt={post.title}
                                                fill
                                                className="object-cover transition-transform duration-700 group-hover:scale-[1.03]"
                                            />
                                            <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/15 to-transparent" />
                                            <div className="absolute bottom-0 left-0 right-0 p-5 md:p-6">
                                                <div className="flex items-center gap-2 mb-2">
                                                    <span className="px-2 py-0.5 bg-white/15 backdrop-blur-md text-[10px] font-semibold text-white/90 rounded border border-white/10">
                                                        {post.tag}
                                                    </span>
                                                    <span className="text-[10px] text-white/45">{post.category}</span>
                                                </div>
                                                <h3 className="text-[15px] md:text-base font-semibold text-white leading-snug tracking-[-0.01em] line-clamp-2 group-hover:text-emerald-200 transition-colors duration-300">
                                                    {post.title}
                                                </h3>
                                                <div className="flex items-center gap-2.5 mt-2 text-[10px] text-white/35">
                                                    <span>{post.date}</span>
                                                    <span>·</span>
                                                    <span className="flex items-center gap-1"><Clock className="w-2.5 h-2.5" />{post.readTime}</span>
                                                </div>
                                            </div>
                                        </article>
                                    </Link>
                                ))}
                            </div>
                        </motion.div>
                    )}
                </div>
            </section>

            {/* ─── Filter Bar ─────────────────────────────────── */}
            <section className="max-w-[1100px] mx-auto px-6 mt-8 mb-2">
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ duration: 0.4, delay: 0.15 }}
                    className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-5 border-b border-[#e8e8e4]"
                >
                    {/* Categories */}
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

                    {/* Search */}
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

                {/* Count */}
                <div className="flex items-center justify-between pt-4 pb-2">
                    <span className="text-[12px] text-[#1a1a1a]/30 font-medium">
                        {listPosts.length}개의 아티클
                    </span>
                    <span className="text-[12px] text-[#1a1a1a]/25">
                        최신순
                    </span>
                </div>
            </section>

            {/* ─── Post List ──────────────────────────────────── */}
            <section className="max-w-[1100px] mx-auto px-6 pb-20">
                <AnimatePresence mode="wait">
                    <motion.div
                        key={activeCategory + searchQuery}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.25 }}
                    >
                        {listPosts.map((post, index) => (
                            <motion.div
                                key={post.id}
                                initial={{ opacity: 0, y: 12 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ duration: 0.4, delay: index * 0.04, ease: [0.25, 0.46, 0.45, 0.94] }}
                            >
                                <Link
                                    href={`/blog/${post.id}`}
                                    className="group block"
                                    onMouseEnter={() => setHoveredListId(post.id)}
                                    onMouseLeave={() => setHoveredListId(null)}
                                >
                                    <article
                                        className="grid grid-cols-1 md:grid-cols-[160px_1fr_180px] gap-4 md:gap-8 py-6 border-b border-[#ebebea] transition-opacity duration-300"
                                        style={{
                                            opacity: isAnyListHovered ? (hoveredListId === post.id ? 1 : 0.3) : 1,
                                        }}
                                    >
                                        {/* Left: Category + Tag */}
                                        <div className="flex md:flex-col gap-2 md:gap-1.5 md:pt-0.5">
                                            <span className="text-[12px] font-medium text-[#1a1a1a]/40">
                                                {post.category}
                                            </span>
                                            <span className="text-[11px] text-emerald-600/70 font-medium">
                                                {post.tag}
                                            </span>
                                        </div>

                                        {/* Center: Content */}
                                        <div className="flex flex-col gap-1.5">
                                            <h2 className="text-[17px] md:text-[19px] font-semibold leading-snug tracking-[-0.015em] text-[#111110] group-hover:text-emerald-800 transition-colors duration-300">
                                                {post.title}
                                            </h2>
                                            <p className="text-[13px] text-[#1a1a1a]/38 leading-relaxed line-clamp-2">
                                                {post.excerpt}
                                            </p>
                                            <div className="flex items-center gap-3 mt-1">
                                                <span className="text-[11px] text-[#1a1a1a]/28">{post.date}</span>
                                                <span className="text-[#1a1a1a]/10">·</span>
                                                <span className="text-[11px] text-[#1a1a1a]/28 flex items-center gap-1">
                                                    <Clock className="w-2.5 h-2.5" />{post.readTime}
                                                </span>
                                                <span className="text-[#1a1a1a]/10">·</span>
                                                <span className="text-[11px] text-[#1a1a1a]/28">{post.author}</span>
                                            </div>
                                        </div>

                                        {/* Right: Thumbnail */}
                                        <div className="relative w-full h-28 md:h-[110px] rounded-xl overflow-hidden bg-[#f0f0ec] shrink-0 order-first md:order-last">
                                            <Image
                                                src={post.imageUrl}
                                                alt={post.title}
                                                fill
                                                className="object-cover transition-transform duration-500 group-hover:scale-[1.04]"
                                            />
                                        </div>
                                    </article>
                                </Link>
                            </motion.div>
                        ))}
                    </motion.div>
                </AnimatePresence>

                {/* Empty State */}
                {filteredPosts.length === 0 && (
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

            {/* ─── Newsletter ─────────────────────────────────── */}
            <section className="max-w-[1100px] mx-auto px-6 pb-28">
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true, margin: "-60px" }}
                    transition={{ duration: 0.5 }}
                >
                    <div className="relative bg-[#111110] rounded-2xl p-10 md:p-14 overflow-hidden">
                        <div className="absolute top-0 right-0 w-72 h-72 bg-emerald-500/[0.06] rounded-full blur-[100px] pointer-events-none" />

                        <div className="relative z-10 max-w-xl">
                            <p className="text-[12px] font-medium text-white/25 tracking-wide uppercase mb-5">
                                Newsletter
                            </p>

                            <h2 className="text-2xl md:text-[1.75rem] font-bold text-white tracking-[-0.02em] mb-3 leading-snug">
                                매월 엄선된 인사이트를 이메일로 받아보세요
                            </h2>

                            <p className="text-[14px] text-white/30 mb-8 leading-relaxed">
                                교육 트렌드, 데이터 분석 리포트, 원장님 인터뷰 등 클래스인이 직접 제작한 콘텐츠를 가장 먼저 만나보세요.
                            </p>

                            <form
                                className="flex flex-col sm:flex-row gap-2.5"
                                onSubmit={(e) => {
                                    e.preventDefault()
                                    alert("뉴스레터 구독이 완료되었습니다.")
                                }}
                            >
                                <input
                                    type="email"
                                    placeholder="name@company.com"
                                    required
                                    className="flex-1 bg-white/[0.06] border border-white/[0.08] text-white placeholder:text-white/20 rounded-lg px-4 py-2.5 text-[13px] focus:outline-none focus:border-white/20 transition-colors"
                                />
                                <button
                                    type="submit"
                                    className="bg-white text-[#111110] px-5 py-2.5 rounded-lg text-[13px] font-semibold flex items-center justify-center gap-1.5 hover:bg-emerald-50 transition-colors duration-200 shrink-0"
                                >
                                    구독하기
                                    <ArrowRight className="w-3.5 h-3.5" />
                                </button>
                            </form>

                            <p className="text-[11px] text-white/15 mt-4">
                                스팸 없이 월 1-2회 발송 · 언제든 구독 취소 가능
                            </p>
                        </div>
                    </div>
                </motion.div>
            </section>
        </div>
    )
}
