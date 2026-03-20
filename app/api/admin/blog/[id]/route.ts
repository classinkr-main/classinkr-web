import { NextRequest, NextResponse } from "next/server"
import { updatePost, deletePost } from "@/lib/blog-data"
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
    const post = await updatePost(numId, body)

    if (!post) {
      return NextResponse.json({ error: "Post not found" }, { status: 404 })
    }

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

    const deleted = await deletePost(numId)

    if (!deleted) {
      return NextResponse.json({ error: "Post not found" }, { status: 404 })
    }

    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ error: "Failed to delete post" }, { status: 500 })
  }
}
