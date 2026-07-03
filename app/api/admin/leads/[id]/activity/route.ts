import { NextRequest, NextResponse } from "next/server"

import { adminCachedJson } from "@/lib/admin-api-response"
import { CRM_STAFF_ADMIN_API_ROLES, requireVerifiedAdminContext } from "@/lib/admin-auth"
import { getLeadActivity } from "@/lib/repositories/lead-activity"

type Params = { params: Promise<{ id: string }> }

// 리드 단위 인증/행동 인텔리전스 — user_profiles + material_downloads + client_events 조인.
export async function GET(req: NextRequest, { params }: Params) {
  const admin = await requireVerifiedAdminContext(req, CRM_STAFF_ADMIN_API_ROLES)
  if (admin instanceof NextResponse) return admin

  const { id } = await params
  if (!id) return NextResponse.json({ error: "lead id required" }, { status: 400 })

  try {
    const activity = await getLeadActivity(id)
    return adminCachedJson(activity)
  } catch (error) {
    console.error("[GET /api/admin/leads/[id]/activity] error:", error)
    return NextResponse.json({ error: "Failed to fetch lead activity" }, { status: 500 })
  }
}
