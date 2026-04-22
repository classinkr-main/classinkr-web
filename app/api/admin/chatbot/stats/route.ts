import { NextRequest, NextResponse } from "next/server"

import { verifyAdmin } from "@/lib/admin-auth"
import { getChatbotStats } from "@/lib/chatbot/service"

export async function GET(req: NextRequest) {
  const authError = await verifyAdmin(req)
  if (authError) return authError

  try {
    const stats = await getChatbotStats(req.nextUrl.searchParams)
    return NextResponse.json(stats)
  } catch (error) {
    console.error("[GET /api/admin/chatbot/stats] error:", error)
    return NextResponse.json(
      { error: "챗봇 통계를 조회하지 못했습니다." },
      { status: 500 }
    )
  }
}
