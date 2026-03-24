import Image from "next/image"
import Link from "next/link"
import { notFound } from "next/navigation"
import { ArrowRight, Clock } from "lucide-react"
import BlogMarkdownRenderer from "@/components/blog/BlogMarkdownRenderer"
import {
  getPublishedPostBySlug,
  getRelatedPosts,
} from "@/lib/blog-data"
import { extractMarkdownHeadings } from "@/lib/blog-markdown"

interface BlogDetailPageProps {
  params: Promise<{ slug: string }>
}

export default async function BlogDetailPage({
  params,
}: BlogDetailPageProps) {
  const { slug } = await params
  const post = await getPublishedPostBySlug(slug)

  if (!post) {
    notFound()
  }

  const headings = extractMarkdownHeadings(post.contentMarkdown)
  const relatedPosts = await getRelatedPosts(post, 3)
  const benefits = post.benefitItems.filter(Boolean)

  return (
    <div className="min-h-screen bg-[#FAFAF8] text-[#111110]">
      <section className="px-6 pb-10 pt-32 md:pt-40">
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

              <h1 className="max-w-4xl text-[2.4rem] font-bold leading-[1.05] tracking-[-0.05em] text-[#111110] md:text-[4.2rem]">
                {post.title}
              </h1>

              <p className="mt-6 max-w-3xl text-[18px] leading-8 text-[#1a1a1a]/55 md:text-[20px]">
                {post.excerpt}
              </p>

              <div className="mt-8 flex flex-wrap items-center gap-4 text-sm text-[#1a1a1a]/40">
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
            </div>

            <div className="overflow-hidden rounded-[32px] border border-[#e8e8e4] bg-white shadow-sm">
              <div className="relative aspect-[16/10] overflow-hidden">
                <Image
                  src={post.heroImageUrl || post.imageUrl}
                  alt={post.heroImageAlt || post.thumbnailAlt || post.title}
                  fill
                  className="object-cover"
                  priority
                />
              </div>
            </div>
          </div>
        </div>
      </section>

      {benefits.length > 0 && (
        <section className="px-6 pb-8">
          <div className="mx-auto max-w-[1200px] rounded-[32px] border border-[#dcebd9] bg-white p-6 shadow-sm md:p-8">
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

      <section className="px-6 pb-20 pt-10">
        <div className="mx-auto grid max-w-[1200px] gap-12 lg:grid-cols-[220px_minmax(0,1fr)]">
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

          <div className="min-w-0">
            <div className="rounded-[36px] border border-[#e8e8e4] bg-white px-6 py-8 shadow-sm md:px-10 md:py-12">
              <BlogMarkdownRenderer markdown={post.contentMarkdown} />
            </div>

            <div className="mt-10 rounded-[32px] border border-[#e8e8e4] bg-white p-6 shadow-sm md:p-8">
              <div className="flex flex-col gap-6 md:flex-row md:items-center">
                <div className="relative h-16 w-16 overflow-hidden rounded-full bg-[#f0f0ec]">
                  {post.authorAvatarUrl ? (
                    <Image
                      src={post.authorAvatarUrl}
                      alt={post.author}
                      fill
                      className="object-cover"
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
                <div className="mb-5 flex items-end justify-between gap-4">
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
                        <Image
                          src={relatedPost.imageUrl}
                          alt={relatedPost.thumbnailAlt || relatedPost.title}
                          fill
                          className="object-cover transition-transform duration-500 group-hover:scale-105"
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

            <div className="mt-12 overflow-hidden rounded-[36px] bg-[#111110] p-8 text-white shadow-sm md:p-10">
              <p className="text-[12px] font-medium uppercase tracking-[0.24em] text-white/35">
                {post.cta.eyebrow}
              </p>
              <div className="mt-4 max-w-2xl">
                <h2 className="text-[2rem] font-semibold tracking-[-0.04em] text-white md:text-[2.4rem]">
                  {post.cta.title}
                </h2>
                <p className="mt-4 text-[15px] leading-7 text-white/58">
                  {post.cta.description}
                </p>
              </div>
              <div className="mt-8">
                <Link
                  href={post.cta.buttonHref}
                  className="inline-flex items-center gap-2 rounded-full bg-white px-5 py-3 text-sm font-semibold text-[#111110] transition-transform hover:-translate-y-0.5"
                >
                  {post.cta.buttonLabel}
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}
