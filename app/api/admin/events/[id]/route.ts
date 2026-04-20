import { NextRequest, NextResponse } from "next/server"
import { verifyAdmin } from "@/lib/admin-auth"
import { updatePublicEvent, deletePublicEvent } from "@/lib/repositories/public-events"

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const err = await verifyAdmin(req)
  if (err) return err
  const { id } = await params
  try {
    const patch = await req.json()
    const updated = await updatePublicEvent(id, patch)
    if (!updated) return NextResponse.json({ error: "Not found" }, { status: 404 })
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
    await deletePublicEvent(id)
    return NextResponse.json({ ok: true })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "행사 삭제에 실패했습니다." },
      { status: 500 }
    )
  }
}
