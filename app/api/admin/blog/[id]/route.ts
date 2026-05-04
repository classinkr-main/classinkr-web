import { NextRequest, NextResponse } from "next/server"
import { revalidatePath } from "next/cache"
import { updatePost, trashPost, permanentDeletePost, restorePost } from "@/lib/repositories/blog"
import { verifyAdmin } from "@/lib/admin-auth"

// id ?뚮씪誘명꽣??UUID ?먮뒗 ?덇굅??numericId 紐⑤몢 ?덉슜
function parsePostId(id: string): { uuid?: string; numId?: number } {
  if (id.includes("-")) return { uuid: id }
  const n = parseInt(id, 10)
  return isNaN(n) ? {} : { numId: n }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authError = await verifyAdmin(req)
  if (authError) return authError

  try {
    const { id } = await params
    const { uuid, numId } = parsePostId(id)
    if (!uuid && numId === undefined) {
      return NextResponse.json({ error: "Invalid id" }, { status: 400 })
    }

    const body = await req.json()

    // Restore from trash
    if (body.restore === true) {
      const post = await restorePost(numId ?? 0, uuid)
      if (!post) return NextResponse.json({ error: "Post not found" }, { status: 404 })
      revalidatePath("/blog")
      return NextResponse.json({ post })
    }

    const post = await updatePost(numId ?? 0, body, uuid)
    if (!post) return NextResponse.json({ error: "Post not found" }, { status: 404 })
    // 諛쒗뻾/鍮꾧났媛??꾪솚 ?먮뒗 肄섑뀗痢?蹂寃???釉붾줈洹?罹먯떆 臾댄슚??
    revalidatePath("/blog")
    revalidatePath(`/blog/${post.slug}`)
    return NextResponse.json({ post })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to update post" },
      { status: 500 }
    )
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authError = await verifyAdmin(req)
  if (authError) return authError

  try {
    const { id } = await params
    const { uuid, numId } = parsePostId(id)
    if (!uuid && numId === undefined) {
      return NextResponse.json({ error: "Invalid id" }, { status: 400 })
    }

    const permanent = req.nextUrl.searchParams.get("permanent") === "true"
    const ok = permanent
      ? await permanentDeletePost(numId ?? 0, uuid)
      : await trashPost(numId ?? 0, uuid)

    if (!ok) return NextResponse.json({ error: "Post not found" }, { status: 404 })
    revalidatePath("/blog")
    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ error: "Failed to delete post" }, { status: 500 })
  }
}
