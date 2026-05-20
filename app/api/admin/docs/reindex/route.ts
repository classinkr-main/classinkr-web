import { NextRequest, NextResponse } from "next/server"

import { verifyAdmin } from "@/lib/admin-auth"
import { reindexDocsAiChunks } from "@/lib/admin-docs"

export async function POST(req: NextRequest) {
  const authError = await verifyAdmin(req)
  if (authError) return authError

  try {
    const body = await req.json().catch(() => null) as { articleId?: unknown } | null
    const articleId = typeof body?.articleId === "string" ? body.articleId : null
    const result = await reindexDocsAiChunks(articleId)
    return NextResponse.json(result)
  } catch (error) {
    console.error("[POST /api/admin/docs/reindex] error:", error)
    return NextResponse.json(
      { error: "문서 검색 인덱스를 재생성하지 못했습니다." },
      { status: 500 }
    )
  }
}
