import { NextRequest, NextResponse } from "next/server"

import { verifyAdmin } from "@/lib/admin-auth"
import { getMetaAdAccountStatus, MetaConfigError } from "@/lib/meta/marketing"

export async function GET(req: NextRequest) {
  const err = await verifyAdmin(req)
  if (err) return err

  try {
    const account = await getMetaAdAccountStatus()
    return NextResponse.json({ ok: true, account })
  } catch (error) {
    if (error instanceof MetaConfigError) {
      console.warn(`[GET /api/admin/meta/status] Meta 연동 미설정: ${error.message}`)
      return NextResponse.json(
        { ok: false, configured: false, error: "Meta 연동이 설정되지 않았습니다." },
        { status: 503 }
      )
    }

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
