import { NextRequest, NextResponse } from "next/server"

import { verifyAdmin } from "@/lib/admin-auth"
import { runGoldenEval } from "@/lib/chatbot/eval"

// 골든셋 품질 평가 실행. body: { judge?: boolean, limit?: number }
export async function POST(req: NextRequest) {
  const authError = await verifyAdmin(req)
  if (authError) return authError

  let body: { judge?: boolean; limit?: number } = {}
  try {
    body = await req.json()
  } catch {
    body = {}
  }

  try {
    const report = await runGoldenEval({
      judge: body.judge,
      limit: typeof body.limit === "number" ? body.limit : undefined,
    })
    return NextResponse.json(report)
  } catch (error) {
    console.error("[POST /api/admin/chatbot/eval] error:", error)
    return NextResponse.json(
      { error: "챗봇 품질 평가를 실행하지 못했습니다." },
      { status: 500 }
    )
  }
}
