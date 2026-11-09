import { getPublishedHardwareCasePosts } from "@/lib/repositories/blog"
import ProductHWPageClient, { type HardwareCasePost } from "./ProductHWPageClient"

/** 설치 사례는 블로그에서 읽는다 — 블로그 목록과 같은 주기(1시간)로 다시 만든다. */
export const revalidate = 3600

/** 카드 한 줄(3열)만 노출한다. 나머지는 블로그 '성공 사례'에서 본다. */
const HARDWARE_CASE_LIMIT = 3

export default async function ProductHWPage() {
    // 사례 조회 실패로 제품 페이지 전체를 죽이지 않는다 — 빈 배열이면 섹션 자체를 숨긴다.
    const posts = await getPublishedHardwareCasePosts(HARDWARE_CASE_LIMIT).catch((error: unknown) => {
        console.error("[product/hw] 설치 사례 조회 실패:", error)
        return []
    })
    const casePosts: HardwareCasePost[] = posts.map((post) => ({
        id: post.id,
        slug: post.slug,
        title: post.title,
        excerpt: post.excerpt,
        category: post.category,
        date: post.date,
        imageUrl: post.imageUrl,
        thumbnailAlt: post.thumbnailAlt,
    }))

    return <ProductHWPageClient casePosts={casePosts} />
}
