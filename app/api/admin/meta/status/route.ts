import { NextRequest, NextResponse } from "next/server"

import { verifyAdmin } from "@/lib/admin-auth"
import { getMetaAdAccountStatus } from "@/lib/meta/marketing"

export async function GET(req: NextRequest) {
  const err = await verifyAdmin(req)
  if (err) return err

  try {
    const account = await getMetaAdAccountStatus()
    return NextResponse.json({ ok: true, account })
  } catch (error) {
    console.error("[GET /api/admin/meta/status]", error)
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Meta account check failed.",
      },
      { status: 500 }
    )
  }
}
