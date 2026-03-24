import { getPublishedPosts } from "@/lib/repositories/blog"
import BlogPageClient from "./BlogPageClient"

export default async function BlogPage() {
    const posts = await getPublishedPosts()
    return <BlogPageClient posts={posts} />
}
