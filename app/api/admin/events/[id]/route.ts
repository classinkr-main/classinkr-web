import { NextRequest, NextResponse } from "next/server"
import { verifyAdmin } from "@/lib/admin-auth"
import { validatePublicMarkdownContent } from "@/lib/admin/public-content-validation"
import {
  updatePublicEvent,
  deletePublicEvent,
  getPublicEventById,
} from "@/lib/repositories/public-events"
import { revalidatePublicEventSurfaces } from "../_revalidate"

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const err = await verifyAdmin(req)
  if (err) return err
  const { id } = await params
  try {
    const patch = await req.json()
    const contentError = validatePublicMarkdownContent(patch.contentMarkdown)
    if (contentError) {
      return NextResponse.json({ error: contentError }, { status: 400 })
    }
    const existing = await getPublicEventById(id)
    const updated = await updatePublicEvent(id, patch)
    if (!updated) return NextResponse.json({ error: "Not found" }, { status: 404 })
    revalidatePublicEventSurfaces(existing?.slug, updated.slug)
    return NextResponse.json(updated)
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "행사 수정에 실패했습니다." },
      { status: 500 }
    )
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const err = await verifyAdmin(req)
  if (err) return err
  const { id } = await params
  try {
    const existing = await getPublicEventById(id)
    await deletePublicEvent(id)
    revalidatePublicEventSurfaces(existing?.slug)
    return NextResponse.json({ ok: true })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "행사 삭제에 실패했습니다." },
      { status: 500 }
    )
  }
}
