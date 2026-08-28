import { NextRequest, NextResponse } from "next/server"

import { verifyAdmin } from "@/lib/admin-auth"
import { adminCachedJson } from "@/lib/admin-api-response"
// 집계·캐시 정본은 lib으로 이관 — Overview 서버 프리페치가 같은 함수를 직접 부른다.
import { getCachedOsSummary } from "@/lib/admin/overview/os-summary"

export async function GET(req: NextRequest) {
  const err = await verifyAdmin(req)
  if (err) return err

  try {
    return adminCachedJson(await getCachedOsSummary())
  } catch (error) {
    console.error("[GET /api/admin/os-summary]", error)
    return NextResponse.json({ error: "Failed to fetch OS summary" }, { status: 500 })
  }
}
