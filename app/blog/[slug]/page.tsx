import type { Metadata } from "next"
import { createElement } from "react"
import Link from "next/link"
import { notFound, permanentRedirect } from "next/navigation"
import { ArrowRight, Clock } from "lucide-react"
import { getCategoryIcon } from "@/lib/blog-categories"
import BlogMarkdownRenderer from "@/components/blog/BlogMarkdownRenderer"
import { ArticleImageLightbox } from "@/components/blog/ArticleImageLightbox"
import { ArticleToc } from "@/components/blog/ArticleToc"
import { BlogPostCard } from "@/components/blog/BlogPostCard"
import { ReadingProgress } from "@/components/blog/ReadingProgress"
import { ShareActions } from "@/components/blog/ShareActions"
import { TrackedLink } from "@/components/TrackedLink"
import { LeadMagnetGate } from "@/components/blog/LeadMagnetGate"
import { SafeBlogImage } from "@/components/blog/SafeBlogImage"
import { ResourcesRecommendation } from "@/components/sections/ResourcesRecommendation"
import {
  getPublishedPostBySlug,
  getRelatedPosts,
} from "@/lib/repositories/blog"
import { getLeadMagnetBySlugFromStore } from "@/lib/repositories/lead-magnets"
import { extractMarkdownHeadings } from "@/lib/blog-markdown"
import { resolveBlogContentModifiedAt, resolveBlogPublishedAt } from "@/lib/blog-types"
import { getBlogSlugRedirect, getCanonicalBlogSlug } from "@/lib/blog-slug-redirects"
import { getBlogPostPath, resolveBlogRouteSlug } from "@/lib/blog-slug-route"
import { sanitizePublicImageUrl, sanitizePublicUrl } from "@/lib/safe-public-url"
import { JsonLd } from "@/components/seo/JsonLd"
import {
  createArticleJsonLd,
  createBreadcrumbJsonLd,
  toAbsoluteUrl,
} from "@/lib/seo"

export const revalidate = 3600 // 1시간마다 재생성
export const dynamicParams = true

async function getOptionalRelatedPosts(post: NonNullable<Awaited<ReturnType<typeof getPublishedPostBySlug>>>) {
  try {
    return await getRelatedPosts(post, 3)
  } catch (error) {
    console.warn("[blog detail] related posts skipped:", error)
    return []
  }
}

async function getOptionalLeadMagnet(slug: string | null | undefined) {
  try {
    return await getLeadMagnetBySlugFromStore(slug)
  } catch (error) {
    console.warn("[blog detail] lead magnet skipped:", error)
    return null
  }
}

export async function generateMetadata({
  params,
}: BlogDetailPageProps): Promise<Metadata> {
  const { slug } = await params
  const canonicalSlug = getCanonicalBlogSlug(resolveBlogRouteSlug(slug))
  const post = await getPublishedPostBySlug(canonicalSlug)
  if (!post) {
    return {
      title: "글을 찾을 수 없습니다",
      description: "요청하신 블로그 글을 찾을 수 없습니다.",
    }
  }
  // 어드민에서 입력한 SEO 전용 필드 우선, 없으면 본문 제목/요약 사용
  const metaTitle = post.seoTitle?.trim() || post.title
  const metaDescription = post.seoDescription?.trim() || post.excerpt
  // 히어로/썸네일이 없으면 제목 기반 OG를 동적 생성한다.
  const ogImage =
    post.heroImageUrl ||
    post.imageUrl ||
    toAbsoluteUrl(`/api/og/blog/${encodeURIComponent(post.slug)}`)
  // 공개 URL 은 늘 원래 슬러그(퍼센트 인코딩) 기준 — rewrite 토큰 경로는 밖으로 내보내지 않는다.
  const canonical = toAbsoluteUrl(getBlogPostPath(post.slug))
  return {
    title: metaTitle,
    description: metaDescription,
    alternates: { canonical },
    openGraph: {
      title: metaTitle,
      description: metaDescription,
      type: "article",
      url: canonical,
      images: [{ url: ogImage }],
    },
    twitter: {
      card: "summary_large_image",
      title: metaTitle,
      description: metaDescription,
      images: [ogImage],
    },
  }
}

export async function generateStaticParams() {
  // Supabase 블로그 본문은 빌드 워커에서 전체 사전 생성하지 않고 ISR로 생성한다.
  // 일부 외부 수집 글 렌더링 중 Next 정적 워커가 4GB 힙 한계에 닿는 것을 방지한다.
  return []
}

interface BlogDetailPageProps {
  params: Promise<{ slug: string }>
}

export default async function BlogDetailPage({
  params,
}: BlogDetailPageProps) {
  const { slug } = await params
  // params.slug 는 퍼센트 인코딩된 원문이거나, 한글 등 비ASCII 슬러그면 proxy.ts 가 rewrite 한
  // `_u8_` 토큰이다(ISR 캐시 태그가 x-next-cache-tags 헤더에 실려 500 나던 사고 — lib/blog-slug-route.ts).
  // 어느 쪽이든 DB 조회 전에 원래 슬러그로 되돌린다.
  const decodedSlug = resolveBlogRouteSlug(slug)
  const redirectSlug = getBlogSlugRedirect(decodedSlug)
  if (redirectSlug) {
    permanentRedirect(`/blog/${encodeURIComponent(redirectSlug)}`)
  }

  const post = await getPublishedPostBySlug(decodedSlug)

  if (!post) {
    notFound()
  }

  const headings = extractMarkdownHeadings(post.contentMarkdown)
  const [relatedPosts, leadMagnet] = await Promise.all([
    getOptionalRelatedPosts(post),
    getOptionalLeadMagnet(post.leadMagnetSlug),
  ])
  const benefits = post.benefitItems.filter(Boolean)
  const ctaHref = sanitizePublicUrl(post.cta.buttonHref, "")
  const authorAvatarSrc = sanitizePublicImageUrl(post.authorAvatarUrl, "")
  const authorInitial = post.author.trim().slice(0, 1) || "C"
  // 목차가 있을 때만 왼쪽 레일을 연다 — 제목 없는 글에 빈 목차 카드가 서던 걸 막는다.
  const hasToc = post.pageLayout !== "minimal" && headings.length > 0
  // 본문 칼럼(720px)이 화면 가운데 오도록 xl에서는 목차 레일과 같은 폭의 빈 칸을 오른쪽에 둔다.
  const columns = hasToc
    ? "mx-auto max-w-[768px] lg:grid lg:max-w-none lg:grid-cols-[200px_minmax(0,720px)] lg:justify-center lg:gap-x-12 xl:grid-cols-[200px_minmax(0,720px)_200px]"
    : "mx-auto max-w-[768px]"
  const mainColumn = hasToc ? "lg:col-start-2" : ""

  return (
    <div className="min-h-screen bg-[#FAFAF8] text-[#111110]">
      <ReadingProgress />
      <ArticleImageLightbox />
      <JsonLd
        data={[
          createArticleJsonLd({
            type: "BlogPosting",
            path: getBlogPostPath(post.slug),
            title: post.title,
            description: post.excerpt,
            imageUrl: post.heroImageUrl || post.imageUrl || undefined,
            // 화면 날짜(published_at ?? created_at)와 같은 규칙.
            datePublished: resolveBlogPublishedAt(post),
            // updated_at 은 대표 글·공개 토글에도 바뀐다 — 글 내용이 바뀐 시각을 쓴다(사이트맵 lastmod 와 같은 값).
            dateModified: resolveBlogContentModifiedAt(post),
            authorName: post.author,
          }),
          createBreadcrumbJsonLd([
            { name: "홈", path: "/" },
            { name: "블로그", path: "/blog" },
            { name: post.title, path: getBlogPostPath(post.slug) },
          ]),
        ]}
      />

      <div className={`px-4 pb-16 pt-28 sm:px-6 md:pb-20 md:pt-36 ${columns}`}>
        <header className={mainColumn}>
          <Link
            href="/blog"
            className="mb-8 inline-flex items-center gap-1.5 text-sm text-[#615D59] transition-colors hover:text-[#084734]"
          >
            <ArrowRight className="h-4 w-4 rotate-180" aria-hidden />
            블로그
          </Link>

          {/* 목록의 카테고리 글리프를 상세까지 잇는다 — 같은 부호가 같은 뜻을 유지해야 어휘가 된다.
              채운 알약 대신 글자로만: 카테고리는 그린, 태그는 회색. */}
          <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px]">
            <span className="inline-flex items-center gap-1.5 font-medium text-[#084734]">
              {createElement(getCategoryIcon(post.category), {
                "aria-hidden": true,
                className: "h-3.5 w-3.5",
              })}
              {post.category}
            </span>
            {post.tags.slice(0, 2).map((tag) => (
              <span key={tag} className="text-[#615D59]">
                <span aria-hidden className="mr-2 text-[#A39E98]">·</span>
                {tag}
              </span>
            ))}
          </p>

          <h1 className="mt-4 text-[2rem] font-bold leading-[1.18] tracking-[-0.035em] text-[#111110] sm:text-[2.5rem] md:text-[2.75rem]">
            {post.title}
          </h1>

          {/* 모바일에서 발췌문이 첫 화면을 다 차지하지 않도록 3줄 제한 */}
          <p className="mt-5 line-clamp-3 text-[16px] leading-7 text-[#615D59] md:line-clamp-none md:text-[18px] md:leading-8">
            {post.excerpt}
          </p>

          <div className="mt-8 flex flex-wrap items-center justify-between gap-4 border-t border-black/[0.08] pt-5">
            <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-[#615D59]">
              <span className="font-medium text-[#31302E]">{post.author}</span>
              <span aria-hidden className="text-[#A39E98]">·</span>
              <span>{post.date}</span>
              <span aria-hidden className="text-[#A39E98]">·</span>
              <span className="inline-flex items-center gap-1">
                <Clock className="h-3.5 w-3.5" aria-hidden />
                {post.readTime}
              </span>
            </p>
            <ShareActions title={post.title} url={toAbsoluteUrl(getBlogPostPath(post.slug))} />
          </div>

          {/* 대표 이미지는 글자가 박힌 카드가 많아(정사각·세로형 포함) 자르지 않고 칼럼 폭 액자에 담는다. */}
          <div className="relative mt-8 aspect-[16/10] overflow-hidden rounded-2xl bg-white ring-1 ring-black/[0.06]">
            <SafeBlogImage
              src={post.heroImageUrl || post.imageUrl}
              alt={post.heroImageAlt || post.thumbnailAlt || post.title}
              fill
              className="object-contain"
              sizes="(min-width: 768px) 720px, calc(100vw - 32px)"
              priority
              fallbackIndex={post.id}
            />
          </div>

          {benefits.length > 0 && (
            <section aria-label="이 글에서 다루는 것" className="mt-10 border-l-2 border-[#084734] pl-5">
              <p className="text-[13px] font-semibold text-[#084734]">이 글에서 다루는 것</p>
              {post.targetReader && (
                <p className="mt-1 text-[13px] text-[#615D59]">추천 대상: {post.targetReader}</p>
              )}
              <ol className="mt-3 space-y-2">
                {benefits.map((benefit, index) => (
                  <li key={benefit} className="flex gap-3 text-[15px] leading-7 text-[#31302E]">
                    <span aria-hidden className="w-3 shrink-0 tabular-nums text-[#A39E98]">{index + 1}</span>
                    <span>{benefit}</span>
                  </li>
                ))}
              </ol>
            </section>
          )}
        </header>

        {hasToc && (
          <aside className="hidden lg:col-start-1 lg:row-start-2 lg:block">
            <div className="sticky top-28 mt-14 max-h-[calc(100vh-8rem)] overflow-y-auto pb-4">
              <ArticleToc headings={headings} />
            </div>
          </aside>
        )}

        <article className={`min-w-0 ${hasToc ? "lg:col-start-2 lg:row-start-2" : ""}`}>
          {hasToc && (
            <details className="group mt-10 border-y border-black/[0.08] py-3 lg:hidden">
              <summary className="flex min-h-9 cursor-pointer list-none items-center justify-between text-sm font-semibold text-[#111110] [&::-webkit-details-marker]:hidden">
                목차
                <svg
                  className="h-4 w-4 text-[#084734] transition-transform duration-200 group-open:rotate-180"
                  viewBox="0 0 16 16"
                  fill="none"
                  aria-hidden="true"
                >
                  <path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </summary>
              <ol className="space-y-2 pb-1 pt-3">
                {headings.map((heading) => (
                  <li key={heading.id}>
                    <a
                      href={`#${heading.id}`}
                      className={`block text-sm leading-6 text-[#615D59] transition-colors hover:text-[#084734] ${
                        heading.level === 3 ? "pl-4" : ""
                      }`}
                    >
                      {heading.text}
                    </a>
                  </li>
                ))}
              </ol>
            </details>
          )}

          {/* 본문은 카드에 담지 않는다 — 페이지 배경 위로 그대로 흐른다(17px 본문 기준 한 줄 ~42자). */}
          <div className="mt-6">
            <BlogMarkdownRenderer markdown={post.contentMarkdown} />
          </div>

          {leadMagnet && (
            <LeadMagnetGate leadMagnet={leadMagnet} postSlug={post.slug} />
          )}

          {/* 작성자는 카드가 아니라 본문 끝의 서명이다 — 얇은 구분선 위에 작게 얹는다.
              역할·소개는 빈 글에서 빈 <p>가 높이만 먹던 걸 막으려 값이 있을 때만 그린다. */}
          <div className="mt-12 border-t border-[#e8e8e4] pt-5">
            <div className="flex items-center gap-2.5">
              <div className="relative h-8 w-8 shrink-0 overflow-hidden rounded-full bg-[#f0f0ec]">
                {authorAvatarSrc ? (
                  <SafeBlogImage
                    src={authorAvatarSrc}
                    alt={post.author}
                    fill
                    className="object-cover"
                    sizes="32px"
                    fallbackIndex={post.id}
                  />
                ) : (
                  <div className="flex h-full items-center justify-center text-[13px] font-semibold text-[#084734]">
                    {authorInitial}
                  </div>
                )}
              </div>

              <p className="min-w-0 text-[13px] text-[#615D59]">
                <span className="font-medium text-[#31302E]">{post.author}</span>
                {post.authorRole ? <span className="text-[#A39E98]"> · {post.authorRole}</span> : null}
              </p>
            </div>

            {post.authorBio ? (
              <p className="mt-2.5 text-[13px] leading-6 text-[#615D59]">{post.authorBio}</p>
            ) : null}
          </div>

          {/* 도입 CTA는 검은 큰 상자 대신 본문 칼럼 폭의 외곽선 상자 — 그린은 버튼 하나에만. */}
          {ctaHref && (
            <div className="mt-12 rounded-2xl border border-black/[0.12] p-6 md:p-8">
              {post.cta.eyebrow ? (
                <p className="text-[12px] font-semibold text-[#084734]">{post.cta.eyebrow}</p>
              ) : null}
              <h2 className="mt-2 text-[1.5rem] font-bold leading-snug tracking-[-0.03em] text-[#111110] md:text-[1.75rem]">
                {post.cta.title}
              </h2>
              {post.cta.description ? (
                <p className="mt-2 text-[15px] leading-7 text-[#615D59]">{post.cta.description}</p>
              ) : null}
              <TrackedLink
                href={ctaHref}
                ctaId="blog_detail_cta"
                tracking={{ slug: post.slug }}
                className="mt-6 inline-flex items-center gap-2 rounded-[6px] bg-[#084734] px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-[#065c41] active:scale-[0.97]"
              >
                {post.cta.buttonLabel}
                <ArrowRight className="h-4 w-4" aria-hidden />
              </TrackedLink>
            </div>
          )}

          <ResourcesRecommendation surface="blog" />
        </article>
      </div>

      {relatedPosts.length > 0 && (
        <section className="border-t border-[#e8e8e4] px-4 pb-20 pt-14 sm:px-6 md:pb-24 md:pt-16">
          <div className="mx-auto max-w-[1100px]">
            <div className="mb-8 flex items-end justify-between gap-4">
              <h2 className="text-2xl font-bold tracking-[-0.03em] text-[#111110] md:text-[1.75rem]">
                다음으로 읽으면 좋은 글
              </h2>
              <Link
                href="/blog"
                className="inline-flex shrink-0 items-center gap-1 text-sm font-medium text-[#084734] transition-colors hover:text-[#111110]"
              >
                전체 글
                <ArrowRight className="h-4 w-4" aria-hidden />
              </Link>
            </div>

            <div className="grid gap-x-6 gap-y-12 sm:grid-cols-2 lg:grid-cols-3">
              {relatedPosts.map((relatedPost) => (
                <BlogPostCard
                  key={relatedPost.id}
                  post={relatedPost}
                  sizes="(min-width: 1100px) 340px, (min-width: 1024px) 31vw, (min-width: 640px) 46vw, calc(100vw - 32px)"
                />
              ))}
            </div>
          </div>
        </section>
      )}
    </div>
  )
}
