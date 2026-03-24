import BlogPostEditor from "@/components/admin/BlogPostEditor"
import { getAllPosts } from "@/lib/blog-data"

export default async function AdminBlogNewPage() {
  const posts = await getAllPosts()

  return <BlogPostEditor mode="create" allPosts={posts} />
}
