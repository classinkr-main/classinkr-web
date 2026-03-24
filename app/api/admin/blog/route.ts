import { NextRequest, NextResponse } from "next/server"
import { getAllPosts, createPost, getTrashedPosts } from "@/lib/repositories/blog"
import { verifyAdmin } from "@/lib/admin-auth"

export async function GET(req: NextRequest) {
  try {
    const trash = req.nextUrl.searchParams.get("trash") === "1"
    const posts = trash ? await getTrashedPosts() : await getAllPosts()
    return NextResponse.json({ posts })
  } catch {
    return NextResponse.json({ error: "Failed to read posts" }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  const authError = verifyAdmin(req)
  if (authError) return authError

  try {
    const body = await req.json()

    if (!body.title || !body.excerpt || !body.category) {
      return NextResponse.json(
        { error: "title, excerpt, category are required" },
        { status: 400 }
      )
    }

    const post = await createPost(body)
    return NextResponse.json({ post }, { status: 201 })
  } catch {
    return NextResponse.json({ error: "Failed to create post" }, { status: 500 })
  }
}
