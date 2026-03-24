import { NextRequest, NextResponse } from "next/server"
import { updatePost, trashPost, permanentDeletePost, restorePost } from "@/lib/repositories/blog"
import { verifyAdmin } from "@/lib/admin-auth"

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authError = verifyAdmin(req)
  if (authError) return authError

  try {
    const { id } = await params
    const numId = parseInt(id, 10)
    if (isNaN(numId)) {
      return NextResponse.json({ error: "Invalid id" }, { status: 400 })
    }

    const body = await req.json()

    // Restore from trash
    if (body.restore === true) {
      const post = await restorePost(numId)
      if (!post) return NextResponse.json({ error: "Post not found" }, { status: 404 })
      return NextResponse.json({ post })
    }

    const post = await updatePost(numId, body)
    if (!post) return NextResponse.json({ error: "Post not found" }, { status: 404 })
    return NextResponse.json({ post })
  } catch {
    return NextResponse.json({ error: "Failed to update post" }, { status: 500 })
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authError = verifyAdmin(req)
  if (authError) return authError

  try {
    const { id } = await params
    const numId = parseInt(id, 10)
    if (isNaN(numId)) {
      return NextResponse.json({ error: "Invalid id" }, { status: 400 })
    }

    const permanent = req.nextUrl.searchParams.get("permanent") === "true"
    const ok = permanent ? await permanentDeletePost(numId) : await trashPost(numId)

    if (!ok) return NextResponse.json({ error: "Post not found" }, { status: 404 })
    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ error: "Failed to delete post" }, { status: 500 })
  }
}
