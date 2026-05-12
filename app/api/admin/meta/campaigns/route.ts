import { NextRequest, NextResponse } from "next/server"

import { verifyAdmin } from "@/lib/admin-auth"
import { getMetaCampaignDashboard } from "@/lib/meta/marketing"

const ALLOWED_DATE_PRESETS = new Set([
  "today",
  "yesterday",
  "last_7d",
  "last_14d",
  "last_30d",
  "last_90d",
  "this_month",
  "last_month",
])

export async function GET(req: NextRequest) {
  const err = await verifyAdmin(req)
  if (err) return err

  const datePreset = req.nextUrl.searchParams.get("datePreset") ?? "last_30d"
  const limitValue = Number(req.nextUrl.searchParams.get("limit") ?? 50)
  const limit = Number.isFinite(limitValue) ? Math.min(Math.max(limitValue, 1), 100) : 50

  try {
    const dashboard = await getMetaCampaignDashboard({
      datePreset: ALLOWED_DATE_PRESETS.has(datePreset) ? datePreset : "last_30d",
      limit,
    })

    return NextResponse.json({ ok: true, ...dashboard })
  } catch (error) {
    console.error("[GET /api/admin/meta/campaigns]", error)
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Meta campaign fetch failed.",
      },
      { status: 500 }
    )
  }
}
