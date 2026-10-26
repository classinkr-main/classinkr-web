"use client"

import { createElement, useDeferredValue, useMemo, useState } from "react"
import { motion, useReducedMotion } from "framer-motion"
import { ArrowRight, Clock, RotateCcw, Rss, Search, X } from "lucide-react"
import Link from "next/link"
import { BlogPostCard } from "@/components/blog/BlogPostCard"
import { BlogThumb } from "@/components/blog/BlogThumb"
import { NewsletterSubscribe } from "@/components/sections/NewsletterSubscribe"
import { getCategoryIcon } from "@/lib/blog-categories"
import type { BlogPost } from "@/lib/blog-types"
import { CATEGORIES } from "@/lib/blog-types"

interface BlogPageClientProps {
    posts: BlogPost[]
    /** 서버에서 목록 조회가 실패했는지 — "발행된 글이 없음"과 구분해 안내한다. */
    loadFailed?: boolean
}

const PAGE_SIZE = 12

export default function BlogPageClient({ posts, loadFailed = false }: BlogPageClientProps) {
    const [activeCategory, setActiveCategory] = useState("전체")
    const [searchQuery, setSearchQuery] = useState("")
    const [limit, setLimit] = useState(PAGE_SIZE)
    const reduceMotion = useReducedMotion()

    // 타건마다 전체 그리드를 다시 그리지 않도록 검색어 반영을 뒤로 미룬다.
    const deferredQuery = useDeferredValue(searchQuery)
    const normalizedQuery = deferredQuery.trim().toLowerCase()
    const hasActiveFilters = activeCategory !== "전체" || normalizedQuery.length > 0

    // 글이 0편인 카테고리는 탭에서 뺀다 — 눌러도 빈 화면뿐인 막다른 길이다.
    const categoryCounts = useMemo(() => {
        const counts = new Map<string, number>([["전체", posts.length]])
        for (const post of posts) counts.set(post.category, (counts.get(post.category) ?? 0) + 1)
        return counts
    }, [posts])
    const visibleCategories = CATEGORIES.filter((cat) => cat === "전체" || (categoryCounts.get(cat) ?? 0) > 0)

    const filteredPosts = useMemo(() => {
        const byCategory = activeCategory === "전체"
            ? posts
            : posts.filter((post) => post.category === activeCategory)

        if (!normalizedQuery) return byCategory

        return byCategory.filter((post) => {
            const searchable = [
                post.title,
                post.excerpt,
                post.author,
                post.category,
                post.tag,
                ...post.tags,
            ].join(" ").toLowerCase()
            return searchable.includes(normalizedQuery)
        })
    }, [posts, activeCategory, normalizedQuery])

    // 대표 글은 필터가 없을 때만 그리드 위에 크게 세우고, 그리드에서는 뺀다(중복 노출 없음).
    // 필터 바 아래에 두므로 칩을 눌러 대표 글이 사라져도 필터 바 위치는 그대로다.
    const featuredPost = hasActiveFilters ? null : (posts.find((post) => post.featured) ?? posts[0] ?? null)
    const gridPosts = featuredPost ? filteredPosts.filter((post) => post.id !== featuredPost.id) : filteredPosts
    const shownPosts = gridPosts.slice(0, limit)

    const selectCategory = (category: string) => {
        setActiveCategory(category)
        setLimit(PAGE_SIZE)
    }

    const resetFilters = () => {
        setActiveCategory("전체")
        setSearchQuery("")
        setLimit(PAGE_SIZE)
    }

    const fadeIn = reduceMotion
        ? { initial: false as const, animate: { opacity: 1 } }
        : { initial: { opacity: 0 }, animate: { opacity: 1 } }

    return (
        <div className="min-h-screen bg-[#FAFAF8] text-[#1a1a1a] selection:bg-[#D1FAE5] selection:text-[#084734]">

            {/* ─── Header ─────────────────────────────────────── */}
            <section className="mx-auto max-w-[1100px] px-4 pt-28 sm:px-6 md:pt-40">
                <motion.p
                    {...fadeIn}
                    transition={{ duration: 0.5 }}
                    className="mb-4 text-xs font-medium uppercase tracking-wide text-[#615D59]"
                >
                    Blog
                </motion.p>
                <motion.h1
                    initial={reduceMotion ? false : { opacity: 0, y: 16 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.6, delay: reduceMotion ? 0 : 0.05 }}
                    className="max-w-2xl text-4xl font-bold leading-[1.12] tracking-[-0.03em] text-[#111110] md:text-5xl"
                >
                    교육의 미래를 <br className="sm:hidden" />함께 만들어갑니다
                </motion.h1>
                <motion.p
                    {...fadeIn}
                    transition={{ duration: 0.5, delay: reduceMotion ? 0 : 0.1 }}
                    className="mt-4 max-w-xl text-[15px] leading-relaxed text-[#615D59] md:text-base"
                >
                    학원 운영 노하우, 에듀테크 트렌드, ClassIn 활용 사례까지 교육 현장에 도움이 되는 이야기를 나눕니다.
                </motion.p>
            </section>

            {/* ─── Filter Bar ─────────────────────────────────── */}
            <section className="mx-auto mt-10 max-w-[1100px] px-4 sm:px-6 md:mt-14">
                <motion.div
                    {...fadeIn}
                    transition={{ duration: 0.4, delay: reduceMotion ? 0 : 0.15 }}
                    className="flex flex-col gap-3 border-b border-[#e8e8e4] md:flex-row md:items-end md:justify-between md:gap-6"
                >
                    {/* 가로 스크롤 대신 줄바꿈 — 좁은 화면에서 뒤쪽 카테고리가 통째로 숨는 걸 막는다.
                        채운 알약 대신 밑줄 탭: 선택 상태는 그린 밑줄 하나로만 말한다. */}
                    <div className="-mb-px flex flex-wrap gap-x-5 gap-y-0" role="group" aria-label="블로그 카테고리 필터">
                        {visibleCategories.map((cat) => {
                            const isActive = activeCategory === cat
                            return (
                                <button
                                    type="button"
                                    key={cat}
                                    aria-pressed={isActive}
                                    onClick={() => selectCategory(cat)}
                                    className={`inline-flex min-h-11 shrink-0 items-center gap-1.5 border-b-2 text-sm font-medium transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#084734] focus-visible:ring-offset-2 focus-visible:ring-offset-[#FAFAF8] ${
                                        isActive
                                            ? "border-[#084734] text-[#111110]"
                                            : "border-transparent text-[#615D59] hover:text-[#111110]"
                                    }`}
                                >
                                    {cat}
                                    <span className={`text-xs tabular-nums ${isActive ? "text-[#084734]" : "text-[#A39E98]"}`}>
                                        {categoryCounts.get(cat) ?? 0}
                                    </span>
                                </button>
                            )
                        })}
                    </div>

                    <div className="relative mb-3 w-full shrink-0 md:w-64">
                        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#615D59]" aria-hidden />
                        <input
                            type="text"
                            aria-label="블로그 글 검색"
                            placeholder="제목, 주제, 작성자 검색"
                            value={searchQuery}
                            onChange={(e) => {
                                setSearchQuery(e.target.value)
                                setLimit(PAGE_SIZE)
                            }}
                            className="min-h-11 w-full rounded-lg border border-black/[0.08] bg-white/60 py-2 pl-9 pr-12 text-sm text-[#1a1a1a] transition-colors placeholder:text-[#615D59] focus:border-[#084734]/45 focus:outline-none focus:ring-2 focus:ring-[#084734]/10"
                        />
                        {searchQuery ? (
                            <button
                                type="button"
                                aria-label="블로그 검색어 지우기"
                                onClick={() => {
                                    setSearchQuery("")
                                    setLimit(PAGE_SIZE)
                                }}
                                className="absolute right-0.5 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full text-[#615D59] transition-colors hover:bg-[#F6F5F4] hover:text-[#084734] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#084734]"
                            >
                                <X className="h-4 w-4" aria-hidden />
                            </button>
                        ) : null}
                    </div>
                </motion.div>

                {hasActiveFilters ? (
                    <div className="flex items-center justify-between gap-3 pt-4">
                        <span aria-live="polite" className="text-xs font-medium text-[#615D59]">
                            {normalizedQuery ? `검색 결과 ${filteredPosts.length}개` : `${activeCategory} ${filteredPosts.length}개`}
                        </span>
                        <button
                            type="button"
                            onClick={resetFilters}
                            className="inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-full px-3 text-xs font-semibold text-[#084734] transition-colors hover:bg-[#F6F5F4] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#084734] focus-visible:ring-offset-2 focus-visible:ring-offset-[#FAFAF8]"
                        >
                            <RotateCcw className="h-3 w-3" aria-hidden />
                            필터 초기화
                        </button>
                    </div>
                ) : null}
            </section>

            <section className="mx-auto max-w-[1100px] px-4 pb-20 pt-10 sm:px-6 md:pb-24 md:pt-12">
                {/* ─── Featured ───────────────────────────────── */}
                {featuredPost ? (
                    <motion.div
                        initial={reduceMotion ? false : { opacity: 0, y: 16 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.5, delay: reduceMotion ? 0 : 0.1 }}
                        className="mb-12 border-b border-[#e8e8e4] pb-12 md:mb-14 md:pb-14"
                    >
                        <Link
                            href={`/blog/${featuredPost.slug}`}
                            className="group grid gap-6 rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#084734] focus-visible:ring-offset-4 focus-visible:ring-offset-[#FAFAF8] md:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)] md:items-center md:gap-12"
                        >
                            <div className="relative aspect-[4/3] overflow-hidden rounded-2xl bg-[#F0F0EC] ring-1 ring-black/[0.06]">
                                <BlogThumb
                                    src={featuredPost.imageUrl}
                                    alt={featuredPost.thumbnailAlt || featuredPost.title}
                                    category={featuredPost.category}
                                    // LCP 후보라 즉시 로드한다(preload 링크까지 생성된다).
                                    priority
                                    sizes="(min-width: 1100px) 580px, (min-width: 768px) 53vw, calc(100vw - 32px)"
                                    // 대표 글은 크게 보이는 만큼 글자 카드 썸네일을 자르지 않고 액자에 통째로 담는다.
                                    className="object-contain transition-transform duration-700 ease-out group-hover:scale-[1.02] motion-reduce:transition-none motion-reduce:group-hover:scale-100"
                                    fallbackIndex={featuredPost.id}
                                />
                            </div>
                            <div>
                                <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-[#615D59]">
                                    <span className="inline-flex items-center gap-1.5 font-medium text-[#084734]">
                                        {createElement(getCategoryIcon(featuredPost.category), { "aria-hidden": true, className: "h-3.5 w-3.5" })}
                                        {featuredPost.category}
                                    </span>
                                    <span aria-hidden className="text-[#A39E98]">·</span>
                                    <span>{featuredPost.date}</span>
                                    <span aria-hidden className="text-[#A39E98]">·</span>
                                    <span className="inline-flex items-center gap-1">
                                        <Clock className="h-3 w-3" aria-hidden />
                                        {featuredPost.readTime}
                                    </span>
                                </p>
                                <h2 className="mt-3 text-2xl font-bold leading-[1.25] tracking-[-0.03em] text-[#111110] transition-colors group-hover:text-[#084734] md:text-[2rem]">
                                    {featuredPost.title}
                                </h2>
                                <p className="mt-4 line-clamp-3 text-[15px] leading-relaxed text-[#615D59] md:text-base">
                                    {featuredPost.excerpt}
                                </p>
                                <span className="mt-6 inline-flex items-center gap-1.5 text-sm font-semibold text-[#084734]">
                                    읽어보기
                                    <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" aria-hidden />
                                </span>
                            </div>
                        </Link>
                    </motion.div>
                ) : null}

                {/* ─── Grid ───────────────────────────────────── */}
                {shownPosts.length > 0 ? (
                    <div className="grid gap-x-6 gap-y-12 sm:grid-cols-2 lg:grid-cols-3">
                        {shownPosts.map((post, index) => (
                            <motion.div
                                key={post.id}
                                initial={reduceMotion ? false : { opacity: 0, y: 12 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{
                                    duration: 0.4,
                                    // "더 보기"로 붙은 묶음도 처음부터 다시 스태거한다. 상한으로 1초 가까이 늦게 뜨는 걸 막는다.
                                    delay: reduceMotion ? 0 : Math.min(index % PAGE_SIZE, 8) * 0.03,
                                    ease: [0.25, 0.46, 0.45, 0.94],
                                }}
                            >
                                <BlogPostCard
                                    post={post}
                                    sizes="(min-width: 1100px) 340px, (min-width: 1024px) 31vw, (min-width: 640px) 46vw, calc(100vw - 32px)"
                                />
                            </motion.div>
                        ))}
                    </div>
                ) : null}

                {gridPosts.length > shownPosts.length ? (
                    <div className="mt-14 flex justify-center">
                        <button
                            type="button"
                            onClick={() => setLimit((current) => current + PAGE_SIZE)}
                            className="inline-flex min-h-11 items-center gap-2 rounded-full border border-black/[0.12] px-6 text-sm font-semibold text-[#111110] transition-colors hover:border-[#084734]/40 hover:text-[#084734] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#084734] focus-visible:ring-offset-2 focus-visible:ring-offset-[#FAFAF8]"
                        >
                            더 보기
                            <span className="text-xs font-medium tabular-nums text-[#A39E98]">
                                {shownPosts.length} / {gridPosts.length}
                            </span>
                        </button>
                    </div>
                ) : null}

                {/* 조회 실패 / 발행 글 없음 / 조건 불일치를 각각 다르게 안내한다. */}
                {filteredPosts.length === 0 && (
                    <motion.div {...fadeIn} className="py-24 text-center">
                        {/* 빈 화면도 지금 무엇을 보고 있는지 말한다 — 검색 중이면 돋보기,
                            카테고리를 좁힌 상태면 그 카테고리의 마크. */}
                        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl border border-black/[0.08]">
                            {createElement(normalizedQuery ? Search : getCategoryIcon(activeCategory), {
                                "aria-hidden": true,
                                className: "h-5 w-5 text-[#084734]/70",
                            })}
                        </div>
                        {loadFailed ? (
                            <>
                                <h3 className="mb-1 text-base font-semibold text-[#111110]">글을 불러오지 못했습니다</h3>
                                <p className="text-sm text-[#615D59]">일시적인 문제일 수 있습니다. 잠시 후 새로고침해 주세요.</p>
                            </>
                        ) : posts.length === 0 ? (
                            <>
                                <h3 className="mb-1 text-base font-semibold text-[#111110]">아직 발행된 글이 없습니다</h3>
                                <p className="text-sm text-[#615D59]">첫 아티클을 준비하고 있어요. 곧 찾아뵙겠습니다.</p>
                            </>
                        ) : (
                            <>
                                <h3 className="mb-1 text-base font-semibold text-[#111110]">조건에 맞는 글이 없습니다</h3>
                                <p className="text-sm text-[#615D59]">다른 키워드나 카테고리를 선택해 보세요.</p>
                                <button
                                    type="button"
                                    onClick={resetFilters}
                                    className="mt-5 inline-flex h-10 items-center justify-center rounded-[6px] bg-[#084734] px-4 text-sm font-semibold text-white transition-colors hover:bg-[#065c41] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#084734] focus-visible:ring-offset-2 focus-visible:ring-offset-[#FAFAF8]"
                                >
                                    전체 글 보기
                                </button>
                            </>
                        )}
                    </motion.div>
                )}
            </section>

            {/* ─── Newsletter ─────────────────────────────────── */}
            <section className="mx-auto max-w-[1100px] px-4 pb-24 sm:px-6 md:pb-28">
                <motion.div
                    initial={reduceMotion ? false : { opacity: 0, y: 20 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true, margin: "-60px" }}
                    transition={{ duration: 0.5 }}
                >
                    <div className="relative overflow-hidden rounded-2xl bg-[#111110] p-6 sm:p-10 md:p-14">
                        <div className="pointer-events-none absolute right-0 top-0 h-72 w-72 rounded-full bg-[#6EE7B7]/[0.08] blur-[100px]" />

                        <div className="relative z-10 max-w-xl">
                            <p className="mb-5 text-xs font-medium uppercase tracking-wide text-white/60">
                                Newsletter
                            </p>

                            <h2 className="mb-3 text-2xl font-bold leading-snug tracking-[-0.02em] text-white md:text-3xl">
                                매월 엄선된 인사이트를 이메일로 받아보세요
                            </h2>

                            <p className="mb-8 text-sm leading-relaxed text-white/65 md:text-base">
                                교육 트렌드, 데이터 분석 리포트, 원장님 인터뷰 등 클래스인이 직접 제작한 콘텐츠를 가장 먼저 만나보세요.
                            </p>

                            <NewsletterSubscribe variant="dark" />

                            {/* RSS 피드는 이미 있는데 그동안 페이지에 입구가 없었다. */}
                            <a
                                href="/blog/rss.xml"
                                className="mt-6 inline-flex items-center gap-1.5 text-xs font-medium text-white/60 underline-offset-4 transition-colors hover:text-[#6EE7B7] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#6EE7B7] focus-visible:ring-offset-2 focus-visible:ring-offset-[#111110]"
                            >
                                <Rss className="h-3.5 w-3.5" aria-hidden />
                                RSS로 구독하기
                            </a>
                        </div>
                    </div>
                </motion.div>
            </section>
        </div>
    )
}
