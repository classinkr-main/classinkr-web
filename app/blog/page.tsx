import type { Metadata } from "next"
import { getPublishedPosts } from "@/lib/repositories/blog"
import BlogPageClient from "./BlogPageClient"

export const revalidate = 3600 // 1시간마다 재생성

export const metadata: Metadata = {
  title: "블로그",
  description: "학원 운영 노하우, 에듀테크 트렌드, Classin 활용 사례까지 — 교육 현장에 실질적으로 도움이 되는 인사이트를 공유합니다.",
  openGraph: {
    title: "블로그 | Classin",
    description: "학원 운영 노하우, 에듀테크 트렌드, Classin 활용 사례까지 — 교육 현장에 실질적으로 도움이 되는 인사이트를 공유합니다.",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "블로그 | Classin",
    description: "학원 운영 노하우, 에듀테크 트렌드, Classin 활용 사례까지 — 교육 현장에 실질적으로 도움이 되는 인사이트를 공유합니다.",
  },
}

export default async function BlogPage() {
    const posts = await getPublishedPosts()
    return <BlogPageClient posts={posts} />
}
