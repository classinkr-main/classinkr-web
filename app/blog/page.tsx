import type { Metadata } from "next"
import { getPublishedPosts } from "@/lib/repositories/blog"
import type { BlogPost } from "@/lib/blog-types"
import { createPublicMetadata } from "@/lib/seo"
import BlogPageClient from "./BlogPageClient"

export const revalidate = 3600 // 1시간마다 재생성

const baseMetadata = createPublicMetadata({
  title: "블로그",
  description: "학원 운영 노하우, 에듀테크 트렌드, Classin 활용 사례까지 — 교육 현장에 실질적으로 도움이 되는 인사이트를 공유합니다.",
  path: "/blog",
})

// canonical·og:image·twitter 는 createPublicMetadata 가 만들고, RSS 구독 링크는 alternates 에 병합한다.
export const metadata: Metadata = {
  ...baseMetadata,
  alternates: {
    ...baseMetadata.alternates,
    types: { "application/rss+xml": "/blog/rss.xml" },
  },
}

// 목록 조회 실패로 페이지 전체를 죽이지 않는다 — /events, /about 과 같은 방어 패턴.
// 실패는 삼키되 loadFailed로 구분해 넘겨서, 클라이언트가 "글이 0개"와 "못 불러옴"을 다르게 안내한다.
export default async function BlogPage() {
    let posts: BlogPost[] = []
    let loadFailed = false
    try {
        posts = await getPublishedPosts()
    } catch (error) {
        loadFailed = true
        console.error("[blog] 목록 조회 실패:", error)
    }
    return <BlogPageClient posts={posts} loadFailed={loadFailed} />
}
