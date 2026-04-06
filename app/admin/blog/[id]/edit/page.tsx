import { notFound } from "next/navigation"
import BlogPostEditor from "@/components/admin/BlogPostEditor"
import { getAllPosts, getPostById } from "@/lib/repositories/blog"

interface AdminBlogEditPageProps {
  params: Promise<{ id: string }>
}

export default async function AdminBlogEditPage({
  params,
}: AdminBlogEditPageProps) {
  const { id } = await params
  const post = await getPostById(Number(id))
  const posts = await getAllPosts()

  if (!post) {
    notFound()
  }

  return <BlogPostEditor mode="edit" initialPost={post} allPosts={posts} />
}
