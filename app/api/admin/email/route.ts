/**
 * ─────────────────────────────────────────────────────────────
 * /api/admin/email  —  이메일 캠페인 이력 조회 (관리자 전용)
 * ─────────────────────────────────────────────────────────────
 *
 * GET → 전체 캠페인 이력 조회 (최신순)
 */

import { NextRequest, NextResponse } from "next/server"
import { verifyAdmin } from "@/lib/admin-auth"
import { getAllCampaigns } from "@/lib/marketing-data"

export async function GET(req: NextRequest) {
  const authError = verifyAdmin(req)
  if (authError) return authError

  const campaigns = await getAllCampaigns()

  // 최신순 정렬
  campaigns.sort((a, b) =>
    new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  )

  return NextResponse.json({ campaigns })
}
