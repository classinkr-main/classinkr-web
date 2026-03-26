import { getPublishedPosts } from "@/lib/repositories/blog"
import BlogPageClient from "./BlogPageClient"

export const revalidate = 3600 // 1시간마다 재생성

export default async function BlogPage() {
    const posts = await getPublishedPosts()
    return <BlogPageClient posts={posts} />
}
