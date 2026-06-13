import { NextRequest, NextResponse } from "next/server"

import { verifyAdmin } from "@/lib/admin-auth"
import { listDocGapBacklog } from "@/lib/chatbot/doc-gaps"

// 문서 보강 큐 — 매핑 문서 없는 질문 클러스터 + zero-result 검색어.
export async function GET(req: NextRequest) {
  const authError = await verifyAdmin(req)
  if (authError) return authError

  const limitParam = Number(req.nextUrl.searchParams.get("limit"))
  const limit = Number.isFinite(limitParam) && limitParam > 0 ? Math.floor(limitParam) : undefined

  try {
    const backlog = await listDocGapBacklog({ limit })
    return NextResponse.json(backlog)
  } catch (error) {
    console.error("[GET /api/admin/docs/gaps] error:", error)
    return NextResponse.json({ error: "문서 보강 큐를 조회하지 못했습니다." }, { status: 500 })
  }
}
