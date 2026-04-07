import { NextRequest, NextResponse } from "next/server"
import { verifyAdmin } from "@/lib/admin-auth"
import { resolveSegmentRecipients } from "@/lib/automation-engine"
import type { SegmentConfig } from "@/lib/automation-types"

/**
 * POST /api/admin/automation/segment/preview
 * ?멸렇癒쇳듃 議곌굔???대떦?섎뒗 ?섏떊???섎? 誘몃━蹂닿린濡?諛섑솚.
 * 洹쒖튃 ?앹꽦 ??Step2?먯꽌 ?ㅼ떆媛?移댁슫???쒖떆??
 */
export async function POST(req: NextRequest) {
  const authError = await verifyAdmin(req)
  if (authError) return authError

  try {
    const body = await req.json()
    const segmentConfig: SegmentConfig = body.segmentConfig ?? {}

    const allRecipients = await resolveSegmentRecipients(segmentConfig)

    // ?뚯씠釉붾퀎 遺꾨쪟
    const leadSources = new Set(["demo_modal", "contact_page", "manual"])
    let leads = 0
    let subscribers = 0
    for (const r of allRecipients) {
      if (leadSources.has(r.source)) leads++
      else subscribers++
    }

    return NextResponse.json({
      estimatedCount: allRecipients.length,
      breakdown: { leads, subscribers },
    })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
