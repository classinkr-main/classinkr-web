import type { Metadata } from "next"
import Image from "next/image"
import Link from "next/link"
import { notFound, permanentRedirect } from "next/navigation"
import { ArrowRight, Clock } from "lucide-react"
import BlogMarkdownRenderer from "@/components/blog/BlogMarkdownRenderer"
import { ArticleImageLightbox } from "@/components/blog/ArticleImageLightbox"
import { ReadingProgress } from "@/components/blog/ReadingProgress"
import { ShareActions } from "@/components/blog/ShareActions"
import { TrackedLink } from "@/components/TrackedLink"
import { LeadMagnetGate } from "@/components/blog/LeadMagnetGate"
import { SafeBlogImage } from "@/components/blog/SafeBlogImage"
import {
  getPublishedPostBySlug,
  getRelatedPosts,
} from "@/lib/repositories/blog"
import { getLeadMagnetBySlugFromStore } from "@/lib/repositories/lead-magnets"
import { extractMarkdownHeadings } from "@/lib/blog-markdown"
import { getBlogSlugRedirect, getCanonicalBlogSlug } from "@/lib/blog-slug-redirects"
import { sanitizePublicUrl } from "@/lib/safe-public-url"
import { JsonLd } from "@/components/seo/JsonLd"
import {
  createArticleJsonLd,
  createBreadcrumbJsonLd,
  toAbsoluteUrl,
} from "@/lib/seo"

export const revalidate = 3600 // 1시간마다 재생성
export const dynamicParams = true

// Next.js dynamic params arrive URL-encoded for non-ASCII paths; decode before DB lookup.
function decodeSlug(raw: string) {
  try { return decodeURIComponent(raw) } catch { return raw }
}

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
  const canonicalSlug = getCanonicalBlogSlug(decodeSlug(slug))
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
  const canonical = toAbsoluteUrl(`/blog/${post.slug}`)
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
  const decodedSlug = decodeSlug(slug)
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

  return (
    <div className="min-h-screen bg-[#FAFAF8] text-[#111110]">
      <ReadingProgress />
      <ArticleImageLightbox />
      <JsonLd
        data={[
          createArticleJsonLd({
            path: `/blog/${post.slug}`,
            title: post.title,
            description: post.excerpt,
            imageUrl: post.heroImageUrl || post.imageUrl || undefined,
            datePublished: post.publishedAt,
            dateModified: post.updatedAt,
            authorName: post.author,
          }),
          createBreadcrumbJsonLd([
            { name: "홈", path: "/" },
            { name: "블로그", path: "/blog" },
            { name: post.title, path: `/blog/${post.slug}` },
          ]),
        ]}
      />
      <section className="px-4 pb-10 pt-28 sm:px-6 md:pt-40">
        <div className="mx-auto max-w-[1200px]">
          <Link
            href="/blog"
            className="mb-8 inline-flex items-center gap-2 text-sm text-[#1a1a1a]/45 transition-colors hover:text-[#084734]"
          >
            <ArrowRight className="h-4 w-4 rotate-180" />
            블로그로 돌아가기
          </Link>

          <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_420px] lg:items-end">
            <div>
              <div className="mb-4 flex flex-wrap items-center gap-2 text-[12px]">
                <span className="rounded-full bg-[#111110] px-3 py-1 font-medium text-white">
                  {post.category}
                </span>
                {post.tags.slice(0, 2).map((tag) => (
                  <span
                    key={tag}
                    className="rounded-full border border-[#dfe3d4] bg-white px-3 py-1 text-[#084734]"
                  >
                    {tag}
                  </span>
                ))}
              </div>

              <h1 className="max-w-4xl text-[2.15rem] font-bold leading-[1.08] tracking-[-0.05em] text-[#111110] sm:text-[2.4rem] md:text-[4.2rem]">
                {post.title}
              </h1>

              {/* 모바일에서 발췌문이 첫 화면을 다 차지하지 않도록 3줄 제한 */}
              <p className="mt-5 line-clamp-3 max-w-3xl text-[16px] leading-7 text-[#1a1a1a]/55 sm:mt-6 md:line-clamp-none md:text-[20px] md:leading-8">
                {post.excerpt}
              </p>

              <div className="mt-7 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-[#1a1a1a]/40 sm:mt-8">
                <span>{post.date}</span>
                <span>•</span>
                <span className="inline-flex items-center gap-1.5">
                  <Clock className="h-4 w-4" />
                  {post.readTime}
                </span>
                <span>•</span>
                <span>
                  {post.author} · {post.authorRole}
                </span>
              </div>

              <div className="mt-6">
                <ShareActions title={post.title} url={toAbsoluteUrl(`/blog/${post.slug}`)} />
              </div>
            </div>

            <div className="overflow-hidden rounded-[24px] border border-[#e8e8e4] bg-white shadow-sm md:rounded-[32px]">
              <div className="relative aspect-[16/10] overflow-hidden">
                <SafeBlogImage
                  src={post.heroImageUrl || post.imageUrl}
                  alt={post.heroImageAlt || post.thumbnailAlt || post.title}
                  fill
                  className="object-cover"
                  sizes="(min-width: 1024px) 420px, 100vw"
                  priority
                  fallbackIndex={post.id}
                />
              </div>
            </div>
          </div>
        </div>
      </section>

      {benefits.length > 0 && (
        <section className="px-4 pb-8 sm:px-6">
          <div className="mx-auto max-w-[1200px] rounded-[24px] border border-[#dcebd9] bg-white p-5 shadow-sm md:rounded-[32px] md:p-8">
            <div className="grid gap-6 md:grid-cols-[220px_minmax(0,1fr)] md:items-start">
              <div>
                <p className="text-[12px] font-medium uppercase tracking-[0.24em] text-[#084734]/55">
                  Why Read This
                </p>
                <h2 className="mt-3 text-2xl font-semibold tracking-[-0.03em] text-[#111110]">
                  이 글을 읽으면 좋은 점
                </h2>
                {post.targetReader && (
                  <p className="mt-3 text-sm leading-6 text-[#1a1a1a]/45">
                    추천 대상: {post.targetReader}
                  </p>
                )}
              </div>

              <div className="grid gap-4 md:grid-cols-3">
                {benefits.map((benefit, index) => (
                  <div
                    key={benefit}
                    className="rounded-[24px] border border-[#e8e8e4] bg-[#fcfcfb] p-5"
                  >
                    <p className="text-[12px] font-medium uppercase tracking-[0.24em] text-[#084734]/45">
                      Point {index + 1}
                    </p>
                    <p className="mt-3 text-[15px] leading-7 text-[#1a1a1a]/75">
                      {benefit}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>
      )}

      <section className="px-4 pb-16 pt-8 sm:px-6 md:pb-20 md:pt-10">
        <div className={`mx-auto max-w-[1200px] gap-12 ${
          post.pageLayout === "minimal"
            ? "flex flex-col"
            : "grid lg:grid-cols-[220px_minmax(0,1fr)]"
        }`}>
          {post.pageLayout !== "minimal" && (
            <aside className="hidden lg:block">
              <div className="sticky top-28 rounded-[28px] border border-[#e8e8e4] bg-white p-5 shadow-sm">
                <p className="text-[12px] font-medium uppercase tracking-[0.24em] text-[#084734]/45">
                  On This Page
                </p>
                <div className="mt-4 space-y-3">
                  {headings.map((heading) => (
                    <a
                      key={heading.id}
                      href={`#${heading.id}`}
                      className={`block text-sm leading-6 text-[#1a1a1a]/45 transition-colors hover:text-[#084734] ${
                        heading.level === 3 ? "pl-4" : ""
                      }`}
                    >
                      {heading.text}
                    </a>
                  ))}
                </div>
              </div>
            </aside>
          )}

          <div className={post.pageLayout === "minimal" ? "mx-auto w-full max-w-3xl" : "min-w-0"}>
            {post.pageLayout !== "minimal" && headings.length > 0 && (
              <details className="group mb-5 rounded-2xl border border-[#e8e8e4] bg-white px-4 py-3 lg:hidden">
                <summary className="flex cursor-pointer list-none items-center justify-between text-sm font-bold text-[#111110] [&::-webkit-details-marker]:hidden">
                  목차 보기
                  <svg
                    className="h-4 w-4 text-[#084734] transition-transform duration-200 group-open:rotate-180"
                    viewBox="0 0 16 16"
                    fill="none"
                    aria-hidden="true"
                  >
                    <path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </summary>
                <div className="space-y-2 pt-3">
                  {headings.map((heading) => (
                    <a
                      key={heading.id}
                      href={`#${heading.id}`}
                      className={`block text-sm leading-6 text-[#1a1a1a]/55 transition-colors hover:text-[#084734] ${
                        heading.level === 3 ? "pl-4" : ""
                      }`}
                    >
                      {heading.text}
                    </a>
                  ))}
                </div>
              </details>
            )}
            <div className="rounded-[24px] border border-[#e8e8e4] bg-white px-5 py-7 shadow-sm md:rounded-[36px] md:px-10 md:py-12">
              <BlogMarkdownRenderer markdown={post.contentMarkdown} />
            </div>

            {leadMagnet && (
              <LeadMagnetGate leadMagnet={leadMagnet} postSlug={post.slug} />
            )}

            <div className="mt-8 rounded-[24px] border border-[#e8e8e4] bg-white p-5 shadow-sm md:mt-10 md:rounded-[32px] md:p-8">
              <div className="flex flex-col gap-6 md:flex-row md:items-center">
                <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-full bg-[#f0f0ec]">
                  {post.authorAvatarUrl ? (
                    <Image
                      src={post.authorAvatarUrl}
                      alt={post.author}
                      fill
                      className="object-cover"
                      sizes="64px"
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center text-lg font-semibold text-[#084734]">
                      {post.author.slice(0, 1)}
                    </div>
                  )}
                </div>

                <div className="min-w-0">
                  <p className="text-lg font-semibold text-[#111110]">
                    {post.author}
                  </p>
                  <p className="text-sm text-[#1a1a1a]/45">{post.authorRole}</p>
                  <p className="mt-3 text-[15px] leading-7 text-[#1a1a1a]/65">
                    {post.authorBio}
                  </p>
                </div>
              </div>
            </div>

            {relatedPosts.length > 0 && (
              <div className="mt-12">
                <div className="mb-5 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
                  <div>
                    <p className="text-[12px] font-medium uppercase tracking-[0.24em] text-[#084734]/45">
                      Recommended
                    </p>
                    <h2 className="mt-2 text-3xl font-semibold tracking-[-0.03em] text-[#111110]">
                      다음으로 읽으면 좋은 글
                    </h2>
                  </div>
                  <Link
                    href="/blog"
                    className="text-sm text-[#084734] transition-colors hover:text-[#111110]"
                  >
                    전체 글 보기
                  </Link>
                </div>

                <div className="grid gap-4 md:grid-cols-3">
                  {relatedPosts.map((relatedPost) => (
                    <Link
                      key={relatedPost.id}
                      href={`/blog/${relatedPost.slug}`}
                      className="group overflow-hidden rounded-[28px] border border-[#e8e8e4] bg-white shadow-sm transition-transform hover:-translate-y-1"
                    >
                      <div className="relative aspect-[4/3] overflow-hidden">
                        <SafeBlogImage
                          src={relatedPost.imageUrl}
                          alt={relatedPost.thumbnailAlt || relatedPost.title}
                          fill
                          className="object-cover transition-transform duration-500 group-hover:scale-105"
                          sizes="(min-width: 1024px) 360px, (min-width: 768px) 33vw, 100vw"
                          fallbackIndex={relatedPost.id}
                        />
                      </div>
                      <div className="p-5">
                        <p className="text-[12px] text-[#084734]/60">
                          {relatedPost.category}
                        </p>
                        <h3 className="mt-2 line-clamp-2 text-lg font-semibold tracking-[-0.02em] text-[#111110]">
                          {relatedPost.title}
                        </h3>
                        <p className="mt-3 line-clamp-3 text-[14px] leading-6 text-[#1a1a1a]/45">
                          {relatedPost.excerpt}
                        </p>
                      </div>
                    </Link>
                  ))}
                </div>
              </div>
            )}

            {ctaHref && (
            <div className="mt-12 overflow-hidden rounded-[24px] bg-[#111110] p-6 text-white shadow-sm md:rounded-[36px] md:p-10">
              <p className="text-[12px] font-medium uppercase tracking-[0.24em] text-white/35">
                {post.cta.eyebrow}
              </p>
              <div className="mt-4 max-w-2xl">
                <h2 className="text-[1.75rem] font-semibold tracking-[-0.04em] text-white md:text-[2.4rem]">
                  {post.cta.title}
                </h2>
                <p className="mt-4 text-[15px] leading-7 text-white/58">
                  {post.cta.description}
                </p>
              </div>
              <div className="mt-8">
                <TrackedLink
                  href={ctaHref}
                  ctaId="blog_detail_cta"
                  tracking={{ slug: post.slug }}
                  className="inline-flex items-center gap-2 rounded-full bg-white px-5 py-3 text-sm font-semibold text-[#111110] transition-transform hover:-translate-y-0.5"
                >
                  {post.cta.buttonLabel}
                  <ArrowRight className="h-4 w-4" />
                </TrackedLink>
              </div>
            </div>
            )}
          </div>
        </div>
      </section>
    </div>
  )
}
