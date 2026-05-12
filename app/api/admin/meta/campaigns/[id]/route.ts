import { NextRequest, NextResponse } from "next/server"

import { verifyAdmin } from "@/lib/admin-auth"
import { updateMetaCampaignStatus } from "@/lib/meta/marketing"

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const err = await verifyAdmin(req)
  if (err) return err

  try {
    const { id } = await params
    const body = (await req.json().catch(() => null)) as { status?: unknown } | null
    const status = typeof body?.status === "string" ? body.status.toUpperCase() : ""

    if (status !== "ACTIVE" && status !== "PAUSED") {
      return NextResponse.json(
        { ok: false, error: "status must be ACTIVE or PAUSED." },
        { status: 400 }
      )
    }

    await updateMetaCampaignStatus(id, status)
    return NextResponse.json({ ok: true, id, status })
  } catch (error) {
    console.error("[PATCH /api/admin/meta/campaigns/[id]]", error)
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Meta campaign update failed.",
      },
      { status: 500 }
    )
  }
}
