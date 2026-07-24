import { NextRequest, NextResponse } from "next/server"

import { verifyAdmin } from "@/lib/admin-auth"
import { adminCachedJson } from "@/lib/admin-api-response"
import { listAdminDocsContent } from "@/lib/admin-docs"

export async function GET(req: NextRequest) {
  const authError = await verifyAdmin(req)
  if (authError) return authError

  try {
    const result = await listAdminDocsContent()
    return adminCachedJson(result)
  } catch (error) {
    console.error("[GET /api/admin/docs] error:", error)
    return NextResponse.json(
      { error: "문서 목록을 조회하지 못했습니다." },
      { status: 500 }
    )
  }
}
