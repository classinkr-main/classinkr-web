"use client"

import { useState, useMemo } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { ArrowRight, Clock, Search } from "lucide-react"
import Image from "next/image"
import Link from "next/link"
import type { BlogPost } from "@/lib/blog-types"
import { CATEGORIES } from "@/lib/blog-types"

interface BlogPageClientProps {
    posts: BlogPost[]
}

export default function BlogPageClient({ posts }: BlogPageClientProps) {
    const [activeCategory, setActiveCategory] = useState("전체")
    const [searchQuery, setSearchQuery] = useState("")
    const [hoveredListId, setHoveredListId] = useState<number | null>(null)

    const filteredPosts = useMemo(() => {
        let filtered = activeCategory === "전체"
            ? posts
            : posts.filter(post => post.category === activeCategory)

        if (searchQuery.trim()) {
            const q = searchQuery.toLowerCase()
            filtered = filtered.filter(post =>
                post.title.toLowerCase().includes(q) ||
                post.excerpt.toLowerCase().includes(q) ||
                post.author.toLowerCase().includes(q)
            )
        }
        return filtered
    }, [posts, activeCategory, searchQuery])

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
                        {CATEGORIES.map((cat) => {
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
