import { NextRequest, NextResponse } from "next/server"
import { verifyAdmin } from "@/lib/admin-auth"
import { resolveSegmentRecipients } from "@/lib/automation-engine"
import type { SegmentConfig } from "@/lib/automation-types"

/**
 * POST /api/admin/automation/segment/preview
 * 세그먼트 조건에 해당하는 수신자 수를 미리보기로 반환.
 * 규칙 생성 폼 Step2에서 실시간 카운트 표시용.
 */
export async function POST(req: NextRequest) {
  const authError = verifyAdmin(req)
  if (authError) return authError

  try {
    const body = await req.json()
    const segmentConfig: SegmentConfig = body.segmentConfig ?? {}

    const allRecipients = await resolveSegmentRecipients(segmentConfig)

    // 테이블별 분류
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
