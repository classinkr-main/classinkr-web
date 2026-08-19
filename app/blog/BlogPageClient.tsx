"use client"

import { useDeferredValue, useMemo, useState } from "react"
import { motion, useReducedMotion } from "framer-motion"
import { ArrowRight, Clock, RotateCcw, Rss, Search, X } from "lucide-react"
import Link from "next/link"
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

const CARD_FOCUS_RING =
    "rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#084734] focus-visible:ring-offset-2 focus-visible:ring-offset-[#FAFAF8]"

/** 갤러리에 올릴 3건: featured 우선, 모자라면 최신순으로 채운다. */
function pickGalleryPosts(posts: BlogPost[]) {
    const featured = posts.filter((post) => post.featured)
    const rest = posts.filter((post) => !post.featured)
    return [...featured, ...rest].slice(0, 3)
}

export default function BlogPageClient({ posts, loadFailed = false }: BlogPageClientProps) {
    const [activeCategory, setActiveCategory] = useState("전체")
    const [searchQuery, setSearchQuery] = useState("")
    const reduceMotion = useReducedMotion()

    // 타건마다 전체 리스트를 다시 그리지 않도록 검색어 반영을 뒤로 미룬다.
    const deferredQuery = useDeferredValue(searchQuery)
    const normalizedQuery = deferredQuery.trim().toLowerCase()
    const hasActiveFilters = activeCategory !== "전체" || normalizedQuery.length > 0

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

    // 갤러리는 필터와 무관하게 전체 기준으로 고정한다. 필터 결과에서 파생하면
    // 칩을 누를 때마다 필터바 위쪽(화면 밖)이 통째로 바뀌고 클릭 지점이 밀린다.
    // 필터·검색이 걸린 동안에는 갤러리를 감추고 리스트만 남겨 결과에 집중시킨다.
    const galleryPosts = useMemo(() => pickGalleryPosts(posts), [posts])
    const showGallery = !hasActiveFilters && galleryPosts.length >= 3
    // 갤러리는 목록에서 글을 빼가지 않는다(중복 노출 허용). 승격 3건이 최신 글 전부일 때
    // — featured가 0건이면 갤러리가 그대로 최신 3건이다 — 목록에서 빼면 "최신순" 목록이
    // 3년 전 글로 시작해 정렬이 뒤집힌 것처럼 읽혔다. 목록은 항상 전체를 최신순 그대로 담는다.
    const listPosts = filteredPosts

    const resetFilters = () => {
        setActiveCategory("전체")
        setSearchQuery("")
    }

    const fadeIn = reduceMotion
        ? { initial: false as const, animate: { opacity: 1 } }
        : { initial: { opacity: 0 }, animate: { opacity: 1 } }

    return (
        <div className="min-h-screen bg-[#FAFAF8] text-[#1a1a1a] selection:bg-[#D1FAE5] selection:text-[#084734]">

            {/* ─── Hero + Gallery ─────────────────────────────── */}
            <section className="relative mx-auto max-w-[1100px] px-4 pb-6 pt-28 sm:px-6 md:pt-40">
                <motion.p
                    {...fadeIn}
                    transition={{ duration: 0.5 }}
                    className="mb-5 text-xs font-medium uppercase tracking-wide text-[#615D59]"
                >
                    Blog
                </motion.p>

                <motion.h1
                    initial={reduceMotion ? false : { opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.6, delay: reduceMotion ? 0 : 0.05 }}
                    className="mb-10 max-w-2xl text-4xl font-bold leading-[1.1] tracking-[-0.03em] text-[#111110] md:mb-12 md:text-5xl"
                >
                    교육의 미래를
                    <br />
                    함께 만들어갑니다
                </motion.h1>

                {/* 1 큰 카드 + 2 작은 카드. lg에서 grid 자체에 aspect를 걸어 폭이 변해도
                    세 카드의 종횡비가 모두 16:10 근처로 고정된다(브레이크포인트별 크롭 요동 제거). */}
                {showGallery && (
                    <motion.div
                        initial={reduceMotion ? false : { opacity: 0, y: 16 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.5, delay: reduceMotion ? 0 : 0.1 }}
                        // 3단 사다리: 모바일 세로 스택 → sm부터 히어로 전폭 + 서브 2열 → lg에서 3열.
                        // sm~lg 구간에 별도 배치가 없으면 709×443 카드 3장이 1353px를 먹으면서
                        // "1 큰 카드 + 2 작은 카드"라는 위계 자체가 사라진다.
                        className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:aspect-[1100/460] lg:grid-cols-3 lg:grid-rows-2"
                    >
                        {galleryPosts.map((post, idx) => {
                            const isHero = idx === 0
                            const CategoryIcon = getCategoryIcon(post.category)
                            return (
                                <Link
                                    key={post.id}
                                    href={`/blog/${post.slug}`}
                                    className={`group relative ${CARD_FOCUS_RING} ${isHero ? "sm:col-span-2 lg:row-span-2" : ""}`}
                                >
                                    <article className="relative aspect-[16/10] overflow-hidden rounded-2xl bg-[#f0f0ec] ring-1 ring-black/5 transition-all duration-500 ease-out group-hover:-translate-y-0.5 group-hover:shadow-[0_22px_55px_-25px_rgba(0,0,0,0.45)] group-hover:ring-black/10 lg:aspect-auto lg:h-full">
                                        <BlogThumb
                                            src={post.imageUrl}
                                            alt={post.title}
                                            category={post.category}
                                            tone="dark"
                                            // LCP 후보라 첫 카드만 즉시 로드한다(preload 링크까지 생성된다).
                                            priority={isHero}
                                            // 서브 카드는 sm부터 절반 폭이다 — full width로 선언하면 2배 큰 후보를 받는다.
                                            sizes={isHero
                                                ? "(min-width: 1148px) 730px, (min-width: 1024px) calc(66vw), (min-width: 640px) calc(100vw - 48px), calc(100vw - 32px)"
                                                : "(min-width: 1148px) 360px, (min-width: 1024px) calc(33vw), (min-width: 640px) calc(50vw - 30px), calc(100vw - 32px)"}
                                            className="object-cover transition-transform duration-700 ease-out group-hover:scale-[1.06] motion-reduce:transition-none motion-reduce:group-hover:scale-100"
                                            fallbackIndex={post.id}
                                        />
                                        {/* 썸네일 하단이 밝은 이미지가 많아(폴백 12장 평균 휘도 251/255)
                                            얇은 스크림으로는 흰 텍스트가 1.4:1까지 떨어진다. 대신 전면을 균일하게
                                            덮으면 사진이 죽으므로, 텍스트가 놓이는 하단 45%에만 농도를 몰아준다. */}
                                        <div className="absolute inset-0 bg-[linear-gradient(to_top,rgba(0,0,0,0.94)_0%,rgba(0,0,0,0.80)_22%,rgba(0,0,0,0.58)_45%,rgba(0,0,0,0.22)_75%,rgba(0,0,0,0.08)_100%)]" />

                                        <div className="absolute right-3 top-3 flex h-7 w-7 -translate-x-1 items-center justify-center rounded-full bg-black/45 opacity-0 ring-1 ring-white/20 backdrop-blur-md transition-all duration-300 group-hover:translate-x-0 group-hover:opacity-100">
                                            <ArrowRight className="h-3.5 w-3.5 text-white" />
                                        </div>

                                        <div className={`absolute inset-x-0 bottom-0 ${isHero ? "p-6 md:p-7" : "p-4 md:p-5"}`}>
                                            <div className="mb-2.5 flex items-center gap-2">
                                                {post.tag ? (
                                                    <span className="rounded-md bg-black/45 px-2 py-0.5 text-xs font-semibold text-white ring-1 ring-white/20 backdrop-blur-md transition-colors duration-300 group-hover:ring-white/40">
                                                        {post.tag}
                                                    </span>
                                                ) : null}
                                                <span className="flex items-center gap-1 text-xs text-white/80">
                                                    <CategoryIcon className="h-3 w-3" aria-hidden />
                                                    {post.category}
                                                </span>
                                            </div>
                                            {/* 승격된 카드의 제목이 일반 리스트 제목(18~20px)보다 작으면 위계가 뒤집힌다. */}
                                            <h2 className={`font-bold leading-snug tracking-[-0.02em] text-white transition-colors duration-300 group-hover:text-[#D1FAE5] ${isHero ? "mb-2 line-clamp-2 text-xl md:text-2xl" : "line-clamp-2 text-[17px] md:text-lg"}`}>
                                                {post.title}
                                            </h2>
                                            {/* 서브 카드는 메타를 싣지 않는다 — 텍스트 블록이 카드의 57%까지
                                                차오르면 스크림을 아무리 올려도 상단 칩이 판독 한계에 걸린다. */}
                                            {isHero ? (
                                                <>
                                                    <p className="mb-3 line-clamp-2 text-sm text-white/80 max-md:hidden">
                                                        {post.excerpt}
                                                    </p>
                                                    <div className="flex items-center gap-2 text-xs text-white/80">
                                                        <span>{post.date}</span>
                                                        <span aria-hidden className="text-white/45">·</span>
                                                        <span className="flex items-center gap-1">
                                                            <Clock className="h-3 w-3" aria-hidden />
                                                            {post.readTime}
                                                        </span>
                                                        <span aria-hidden className="text-white/45">·</span>
                                                        <span>{post.author}</span>
                                                    </div>
                                                </>
                                            ) : (
                                                <div className="mt-1.5 flex items-center gap-2 text-xs text-white/80">
                                                    <span>{post.date}</span>
                                                    <span aria-hidden className="text-white/45">·</span>
                                                    <span className="flex items-center gap-1">
                                                        <Clock className="h-3 w-3" aria-hidden />
                                                        {post.readTime}
                                                    </span>
                                                </div>
                                            )}
                                        </div>
                                    </article>
                                </Link>
                            )
                        })}
                    </motion.div>
                )}
            </section>

            {/* ─── Filter Bar ─────────────────────────────────── */}
            <section className="mx-auto mb-2 mt-8 max-w-[1100px] px-4 sm:px-6">
                <motion.div
                    {...fadeIn}
                    transition={{ duration: 0.4, delay: reduceMotion ? 0 : 0.15 }}
                    className="flex flex-col gap-4 border-b border-[#e8e8e4] pb-5 sm:flex-row sm:items-center sm:justify-between"
                >
                    {/* 가로 스크롤 대신 줄바꿈 — 좁은 화면에서 뒤쪽 카테고리가 통째로 숨는 걸 막는다. */}
                    <div className="flex flex-wrap items-center gap-1.5 py-1" role="group" aria-label="블로그 카테고리 필터">
                        {CATEGORIES.map((cat) => {
                            const isActive = activeCategory === cat
                            const ChipIcon = getCategoryIcon(cat)
                            return (
                                <button
                                    type="button"
                                    key={cat}
                                    aria-pressed={isActive}
                                    onClick={() => setActiveCategory(cat)}
                                    className={`group inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-full px-3.5 py-2 text-sm font-medium transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#084734] focus-visible:ring-offset-2 focus-visible:ring-offset-[#FAFAF8] ${
                                        isActive
                                            ? "bg-[#084734] text-white shadow-[0_6px_16px_rgba(8,71,52,0.14)]"
                                            : "text-[#615D59] hover:bg-[#ECFDF5] hover:text-[#084734]"
                                    }`}
                                >
                                    <ChipIcon
                                        aria-hidden
                                        className={`h-3.5 w-3.5 transition-colors ${isActive ? "text-white/70" : "text-[#A39E98] group-hover:text-[#084734]"}`}
                                    />
                                    {cat}
                                </button>
                            )
                        })}
                    </div>

                    <div className="relative w-full shrink-0 sm:w-auto">
                        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#615D59]" aria-hidden />
                        <input
                            type="text"
                            aria-label="블로그 글 검색"
                            placeholder="제목, 주제, 작성자 검색"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="min-h-11 w-full rounded-lg border border-black/[0.08] bg-white/60 py-2 pl-9 pr-12 text-sm text-[#1a1a1a] transition-colors placeholder:text-[#615D59] focus:border-[#084734]/45 focus:outline-none focus:ring-2 focus:ring-[#084734]/10 sm:w-64"
                        />
                        {searchQuery ? (
                            <button
                                type="button"
                                aria-label="블로그 검색어 지우기"
                                onClick={() => setSearchQuery("")}
                                className="absolute right-0.5 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full text-[#615D59] transition-colors hover:bg-[#F6F5F4] hover:text-[#084734] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#084734]"
                            >
                                <X className="h-4 w-4" aria-hidden />
                            </button>
                        ) : null}
                    </div>
                </motion.div>

                {/* 목록이 전체를 담으므로 카운트는 하나면 된다 — 갤러리는 그중 3건을 위로 승격한 것뿐이다. */}
                <div className="flex items-center justify-between gap-3 pb-2 pt-4">
                    <span aria-live="polite" className="text-xs font-medium text-[#615D59]">
                        {normalizedQuery
                            ? `검색 결과 ${filteredPosts.length}개`
                            : `${activeCategory === "전체" ? "전체" : activeCategory} ${filteredPosts.length}개`}
                    </span>
                    {hasActiveFilters ? (
                        <button
                            type="button"
                            onClick={resetFilters}
                            className="inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-full px-3 text-xs font-semibold text-[#084734] transition-colors hover:bg-[#ECFDF5] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#084734] focus-visible:ring-offset-2 focus-visible:ring-offset-[#FAFAF8]"
                        >
                            <RotateCcw className="h-3 w-3" aria-hidden />
                            필터 초기화
                        </button>
                    ) : (
                        <span className="text-xs text-[#615D59]">최신순</span>
                    )}
                </div>
            </section>

            {/* ─── Post List ──────────────────────────────────── */}
            <section className="mx-auto max-w-[1100px] px-4 pb-16 sm:px-6 md:pb-20">
                {listPosts.map((post, index) => {
                    const RowIcon = getCategoryIcon(post.category)
                    return (
                    <motion.div
                        key={post.id}
                        initial={reduceMotion ? false : { opacity: 0, y: 12 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{
                            duration: 0.4,
                            // 스태거 상한을 둬서 뒤쪽 항목이 1초 가까이 늦게 뜨는 걸 막는다.
                            delay: reduceMotion ? 0 : Math.min(index, 8) * 0.03,
                            ease: [0.25, 0.46, 0.45, 0.94],
                        }}
                    >
                        <Link href={`/blog/${post.slug}`} className={`group block ${CARD_FOCUS_RING}`}>
                            {/* 좌측 160px 카테고리 열을 없애고 본문에 폭을 돌려줬다.
                                비호버 항목을 흐리는 대신 호버 대상만 배경으로 강조한다. */}
                            {/* 썸네일 폭 사다리 128 → 160 → 200. 768px에서 104→200으로 두 배 튀던 걸 없앤다.
                                모바일은 요약을 숨겨 텍스트 높이를 썸네일에 맞추고(기존엔 81px가 비었다),
                                items-center로 남는 차이를 가운데로 흡수한다. */}
                            <article className="-mx-3 grid grid-cols-[1fr_128px] items-center gap-3 rounded-lg border-b border-[#ebebea] px-3 py-5 transition-colors duration-200 group-hover:bg-[#F3F2EF] sm:grid-cols-[1fr_160px] sm:gap-5 md:grid-cols-[1fr_200px] md:items-start md:gap-8 md:py-6">
                                <div className="flex flex-col gap-1.5">
                                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                                        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-[#31302E]">
                                            <RowIcon
                                                aria-hidden
                                                className="h-3.5 w-3.5 text-[#A39E98] transition-colors duration-300 group-hover:text-[#084734]"
                                            />
                                            {post.category}
                                        </span>
                                        {/* tag는 목록 행에서 뺐다 — 16행 중 5행이 빈 값이라 리듬이 깨지고,
                                            값이 있는 행도 대부분 카테고리의 동어반복이다("제품 업데이트 · 업데이트 소식").
                                            글리프+카테고리로 이미 분류가 서므로 태그는 갤러리 카드에만 남긴다. */}
                                    </div>
                                    <h2 className="line-clamp-2 text-lg font-semibold leading-snug tracking-[-0.015em] text-[#111110] transition-colors duration-300 group-hover:text-[#084734] md:text-xl">
                                        {post.title}
                                    </h2>
                                    {/* 모바일에서 요약은 좁은 폭에 잘려 정보 가치가 낮다 — 제목에 자리를 넘긴다.
                                        숨김은 max-sm:hidden으로 한다. `hidden … sm:block`을 쓰면 sm 이상에서
                                        display:block이 line-clamp의 -webkit-box를 덮어써 줄 제한이 풀린다. */}
                                    <p className="line-clamp-2 text-sm leading-relaxed text-[#615D59] max-sm:hidden">
                                        {post.excerpt}
                                    </p>
                                    {/* 작성자는 전 행이 동일해 판별 정보가 없어 상세 페이지로 넘겼다. */}
                                    <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-[#615D59]">
                                        <span>{post.date}</span>
                                        <span aria-hidden className="text-[#A39E98]">·</span>
                                        <span className="flex items-center gap-1">
                                            <Clock className="h-3 w-3" aria-hidden />
                                            {post.readTime}
                                        </span>
                                    </div>
                                </div>

                                <div className="relative aspect-[3/2] w-full shrink-0 overflow-hidden rounded-xl bg-[#f0f0ec]">
                                    <BlogThumb
                                        src={post.imageUrl}
                                        alt={post.title}
                                        category={post.category}
                                        sizes="(min-width: 768px) 200px, (min-width: 640px) 160px, 128px"
                                        className="object-cover transition-transform duration-500 group-hover:scale-[1.04] motion-reduce:transition-none motion-reduce:group-hover:scale-100"
                                        fallbackIndex={post.id}
                                    />
                                </div>
                            </article>
                        </Link>
                    </motion.div>
                    )
                })}

                {/* 조회 실패 / 발행 글 없음 / 조건 불일치를 각각 다르게 안내한다. */}
                {filteredPosts.length === 0 && (
                    <motion.div {...fadeIn} className="py-28 text-center">
                        {/* 빈 화면도 지금 무엇을 보고 있는지 말한다 — 검색 중이면 돋보기,
                            카테고리를 좁힌 상태면 그 카테고리의 마크. */}
                        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-[#ECFDF5]">
                            {normalizedQuery ? (
                                <Search className="h-5 w-5 text-[#084734]/60" aria-hidden />
                            ) : (
                                (() => {
                                    const EmptyIcon = getCategoryIcon(activeCategory)
                                    return <EmptyIcon className="h-5 w-5 text-[#084734]/60" aria-hidden />
                                })()
                            )}
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
