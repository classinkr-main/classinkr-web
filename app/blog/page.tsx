import { getPublishedPosts } from "@/lib/blog-data"
import BlogPageClient from "./BlogPageClient"

export default async function BlogPage() {
    const posts = await getPublishedPosts()
    return <BlogPageClient posts={posts} />
}
