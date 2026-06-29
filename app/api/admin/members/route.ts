import { NextRequest, NextResponse } from "next/server"

import { adminCachedJson } from "@/lib/admin-api-response"
import { verifyAdmin } from "@/lib/admin-auth"
import { listAdminMembers } from "@/lib/repositories/admin-members"

// 딜 담당자 배정 드롭다운용 — 활성 admin_profiles 목록.
export async function GET(req: NextRequest) {
  const err = await verifyAdmin(req)
  if (err) return err

  try {
    const members = await listAdminMembers()
    return adminCachedJson({ members })
  } catch (error) {
    console.error("[GET /api/admin/members] error:", error)
    return NextResponse.json({ error: "Failed to fetch members" }, { status: 500 })
  }
}
