import { NextRequest, NextResponse } from "next/server"
import { revalidatePath } from "next/cache"
import { getAllPosts, createPost, getTrashedPosts } from "@/lib/repositories/blog"
import { verifyAdmin } from "@/lib/admin-auth"
import { adminCachedJson } from "@/lib/admin-api-response"
import { validatePublicMarkdownContent } from "@/lib/admin/public-content-validation"

function revalidatePublicBlogSurfaces(slug?: string) {
  revalidatePath("/blog")
  revalidatePath("/blog/rss.xml")
  revalidatePath("/sitemap.xml")
  revalidatePath("/updates")
  revalidatePath("/about")
  if (slug) revalidatePath(`/blog/${slug}`)
}

export async function GET(req: NextRequest) {
  const authError = await verifyAdmin(req)
  if (authError) return authError

  try {
    const trash = req.nextUrl.searchParams.get("trash") === "1"
    const posts = trash ? await getTrashedPosts() : await getAllPosts()
    return adminCachedJson({ posts })
  } catch {
    return NextResponse.json({ error: "Failed to read posts" }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  const authError = await verifyAdmin(req)
  if (authError) return authError

  try {
    const body = await req.json()

    if (!body.title || !body.excerpt || !body.category) {
      return NextResponse.json(
        { error: "title, excerpt, category are required" },
        { status: 400 }
      )
    }

    const contentError = validatePublicMarkdownContent(body.contentMarkdown)
    if (contentError) {
      return NextResponse.json({ error: contentError }, { status: 400 })
    }

    const post = await createPost(body)
    // 발행 상태면 블로그 페이지 캐시를 즉시 무효화
    if (post.status === "published") {
      revalidatePublicBlogSurfaces(post.slug)
    }
    return NextResponse.json({ post }, { status: 201 })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to create post" },
      { status: 500 }
    )
  }
}
