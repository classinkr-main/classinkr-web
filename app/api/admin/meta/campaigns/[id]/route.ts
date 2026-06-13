import { NextRequest, NextResponse } from "next/server"

import { verifyAdmin } from "@/lib/admin-auth"
import { MetaConfigError, updateMetaCampaignStatus } from "@/lib/meta/marketing"

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
    if (error instanceof MetaConfigError) {
      console.warn(`[PATCH /api/admin/meta/campaigns/[id]] Meta 연동 미설정: ${error.message}`)
      return NextResponse.json(
        { ok: false, configured: false, error: "Meta 연동이 설정되지 않았습니다." },
        { status: 503 }
      )
    }

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
