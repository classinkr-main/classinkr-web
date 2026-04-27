import { NextRequest, NextResponse } from "next/server"

import { verifyAdmin } from "@/lib/admin-auth"
import { listQuestionClusters } from "@/lib/chatbot/service"

export async function GET(req: NextRequest) {
  const authError = await verifyAdmin(req)
  if (authError) return authError

  try {
    const result = await listQuestionClusters(req.nextUrl.searchParams)
    return NextResponse.json(result)
  } catch (error) {
    console.error("[GET /api/admin/chatbot/questions] error:", error)
    return NextResponse.json(
      { error: "질문 클러스터를 조회하지 못했습니다." },
      { status: 500 }
    )
  }
}
