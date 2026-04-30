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

    // Gallery: top 3 (1 hero + 2 stacked)
    const galleryPosts = filteredPosts.filter(p => p.featured).slice(0, 3)
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
            <section className="relative px-4 pb-6 pt-28 sm:px-6 md:pt-40">
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
                        className="mb-10 max-w-2xl text-[2.15rem] font-bold leading-[1.1] tracking-[-0.03em] text-[#111110] md:mb-12 md:text-[3.25rem]"
                    >
                        교육의 미래를
                        <br />
                        함께 만들어갑니다
                    </motion.h1>

                    {/* Hero: 1 main left + 2 stacked right */}
                    {galleryFinal.length > 0 && (
                        <motion.div
                            initial={{ opacity: 0, y: 16 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.5, delay: 0.1 }}
                            className="grid gap-3 mb-6 grid-cols-1 lg:grid-cols-2 lg:grid-rows-2 lg:h-[420px]"
                        >
                            {galleryFinal.map((post, idx) => {
                                const heroSpans = [
                                    "lg:row-span-2",
                                    "",
                                    "",
                                ]
                                const isHero = idx === 0
                                return (
                                    <Link
                                        key={post.id}
                                        href={`/blog/${post.slug}`}
                                        className={`group relative ${heroSpans[idx] ?? ""}`}
                                    >
                                        <article className={`relative ${isHero ? "h-[300px] md:h-[360px]" : "h-[200px]"} lg:h-full overflow-hidden rounded-2xl bg-[#f0f0ec] ring-1 ring-black/5 transition-all duration-500 ease-out group-hover:-translate-y-0.5 group-hover:ring-black/10 group-hover:shadow-[0_22px_55px_-25px_rgba(0,0,0,0.45)]`}>
                                            <Image
                                                src={post.imageUrl}
                                                alt={post.title}
                                                fill
                                                sizes={isHero
                                                    ? "(max-width: 1024px) 100vw, 50vw"
                                                    : "(max-width: 1024px) 100vw, 50vw"}
                                                className="object-cover transition-transform duration-700 ease-out group-hover:scale-[1.06]"
                                            />
                                            <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent transition-colors duration-500 group-hover:from-black/80" />

                                            {/* Hover arrow chip */}
                                            <div className="absolute right-3 top-3 flex h-7 w-7 items-center justify-center rounded-full bg-white/15 backdrop-blur-md ring-1 ring-white/10 opacity-0 -translate-x-1 transition-all duration-300 group-hover:opacity-100 group-hover:translate-x-0">
                                                <ArrowRight className="h-3.5 w-3.5 text-white" />
                                            </div>

                                            <div className={`absolute inset-x-0 bottom-0 ${isHero ? "p-6 md:p-7" : "p-4 md:p-5"}`}>
                                                <div className="flex items-center gap-2 mb-2.5">
                                                    <span className={`px-2 py-0.5 bg-white/15 backdrop-blur-md font-semibold text-white/95 rounded-md ring-1 ring-white/10 transition-all duration-300 group-hover:ring-white/35 group-hover:bg-white/20 ${isHero ? "text-[11px]" : "text-[10px]"}`}>
                                                        {post.tag}
                                                    </span>
                                                    <span className={`text-white/55 ${isHero ? "text-[11px]" : "text-[10px]"}`}>{post.category}</span>
                                                </div>
                                                <h2 className={`font-bold text-white leading-snug tracking-[-0.02em] line-clamp-2 transition-colors duration-300 group-hover:text-emerald-200 ${isHero ? "text-xl md:text-2xl mb-2" : "text-[14px] md:text-[15px]"}`}>
                                                    {post.title}
                                                </h2>
                                                {isHero ? (
                                                    <>
                                                        <p className="text-[13px] text-white/55 line-clamp-2 mb-3 hidden md:block">
                                                            {post.excerpt}
                                                        </p>
                                                        <div className="flex items-center gap-3 text-[11px] text-white/45">
                                                            <span>{post.date}</span>
                                                            <span>·</span>
                                                            <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{post.readTime}</span>
                                                            <span>·</span>
                                                            <span>{post.author}</span>
                                                        </div>
                                                    </>
                                                ) : (
                                                    <div className="mt-1.5 flex items-center gap-2 text-[10px] text-white/45">
                                                        <span>{post.date}</span>
                                                        <span>·</span>
                                                        <span className="flex items-center gap-1"><Clock className="w-2.5 h-2.5" />{post.readTime}</span>
                                                    </div>
                                                )}
                                            </div>
                                        </article>
                                    </Link>
                                )
                            })}
                        </motion.div>
                    )}
                </div>
            </section>

            {/* ─── Filter Bar ─────────────────────────────────── */}
            <section className="mx-auto mb-2 mt-8 max-w-[1100px] px-4 sm:px-6">
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ duration: 0.4, delay: 0.15 }}
                    className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-5 border-b border-[#e8e8e4]"
                >
                    {/* Categories */}
                    <div className="-mx-1 flex items-center gap-1.5 overflow-x-auto px-1 pb-1 no-scrollbar">
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
                    <div className="relative w-full shrink-0 sm:w-auto">
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
            <section className="mx-auto max-w-[1100px] px-4 pb-16 sm:px-6 md:pb-20">
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
                                    href={`/blog/${post.slug}`}
                                    className="group block"
                                    onMouseEnter={() => setHoveredListId(post.id)}
                                    onMouseLeave={() => setHoveredListId(null)}
                                >
                                    <article
                                        className="grid grid-cols-1 gap-3 border-b border-[#ebebea] py-5 transition-opacity duration-300 md:grid-cols-[160px_1fr_180px] md:gap-8 md:py-6"
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
                                            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
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
            <section className="mx-auto max-w-[1100px] px-4 pb-24 sm:px-6 md:pb-28">
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true, margin: "-60px" }}
                    transition={{ duration: 0.5 }}
                >
                    <div className="relative overflow-hidden rounded-2xl bg-[#111110] p-6 sm:p-10 md:p-14">
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
