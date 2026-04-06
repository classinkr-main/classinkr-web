import BlogPostEditor from "@/components/admin/BlogPostEditor"
import { getAllPosts } from "@/lib/repositories/blog"

export default async function AdminBlogNewPage() {
  const posts = await getAllPosts()

  return <BlogPostEditor mode="create" allPosts={posts} />
}
