import { ArrowRight } from "lucide-react"

import { BlogPostCard } from "@/components/blog/BlogPostCard"
import { TrackedLink } from "@/components/TrackedLink"
import type { BlogPost } from "@/lib/blog-types"

/**
 * 설치 사례 카드에 필요한 필드만 — 서버(page.tsx)가 블로그 글에서 골라 내려준다.
 * 사례 원본은 블로그 '성공 사례' 카테고리 + '하드웨어' 태그다(lib/blog-types.ts).
 */
export type HardwareCasePost = Pick<
    BlogPost,
    "id" | "slug" | "title" | "excerpt" | "category" | "date" | "imageUrl" | "thumbnailAlt"
>

/**
 * /product/hw 설치 사례. 공개된 사례 글이 없으면 섹션을 그리지 않는다 —
 * 빈 자리나 예시 사례로 채우지 않는다(사실 확인된 공개 동의 사례만 블로그에 올린다).
 */
export default function HardwareCaseStories({ posts }: { posts: HardwareCasePost[] }) {
    if (posts.length === 0) return null

    return (
        <section aria-labelledby="hw-case-stories" className="bg-surface-paper py-24 md:py-32">
            <div className="container mx-auto px-4 lg:px-8">
                <div className="mx-auto mb-14 max-w-5xl text-center">
                    <p className="mb-3 text-label tracking-label font-semibold text-fg-accent">설치 사례</p>
                    <h2 id="hw-case-stories" className="text-h2 text-fg-ink">
                        Classin Board가 들어간
                        <br />
                        <span className="text-fg-accent">실제 교실들</span>
                    </h2>
                    <p className="mt-5 text-body text-fg-muted">어떤 공간에 어떻게 설치하고 수업을 바꿨는지, 현장 사례로 확인하세요.</p>
                </div>

                <ul className="mx-auto grid max-w-5xl gap-8 sm:grid-cols-2 lg:grid-cols-3">
                    {posts.map((post) => (
                        <li key={post.id}>
                            <BlogPostCard post={post} sizes="(min-width: 1024px) 320px, (min-width: 640px) 50vw, 100vw" />
                        </li>
                    ))}
                </ul>

                <div className="mt-12 text-center">
                    <TrackedLink
                        href="/blog"
                        ctaId="hw_case_stories_more"
                        tracking={{ surface: "hw_case_stories" }}
                        className="inline-flex items-center gap-1.5 text-ui font-semibold text-fg-accent hover:text-fg-accent-hover"
                    >
                        블로그에서 사례 더 보기
                        <ArrowRight aria-hidden className="h-4 w-4" />
                    </TrackedLink>
                </div>
            </div>
        </section>
    )
}
