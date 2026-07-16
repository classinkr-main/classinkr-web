import { NextRequest, NextResponse } from "next/server"

import { normalizeAdminCapabilities } from "@/lib/admin-capabilities"
import {
  requireVerifiedAdminContext,
  STAFF_ADMIN_API_ROLES,
} from "@/lib/admin-auth"
import { logAdminAudit } from "@/lib/auth/audit"
import { listAdminUserDirectory } from "@/lib/repositories/admin-users"
import { createSupabaseAdminClient } from "@/lib/supabase/admin"

export async function GET(req: NextRequest) {
  const admin = await requireVerifiedAdminContext(req, STAFF_ADMIN_API_ROLES)
  if (admin instanceof NextResponse) return admin

  try {
    const directory = await listAdminUserDirectory()
    return NextResponse.json({
      ...directory,
      viewer: { role: admin.role },
    })
  } catch (error) {
    console.error("[GET /api/admin/users]", error)
    return NextResponse.json({ error: "Failed to load admin users" }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest) {
  const admin = await requireVerifiedAdminContext(req, ["SUPER_ADMIN"])
  if (admin instanceof NextResponse) return admin

  const body = await req.json().catch(() => null)
  const userId = typeof body?.userId === "string" ? body.userId.trim() : ""
  const capabilities = normalizeAdminCapabilities(body?.capabilities)

  if (!userId || !capabilities) {
    return NextResponse.json(
      { error: "userId and a valid capabilities array are required" },
      { status: 400 }
    )
  }

  const supabase = createSupabaseAdminClient()
  const { data, error } = await supabase
    .from("admin_profiles")
    .update({ capabilities })
    .eq("user_id", userId)
    .select("user_id, display_name, role, status, capabilities")
    .single()

  if (error || !data) {
    console.error("[PATCH /api/admin/users]", error)
    return NextResponse.json({ error: "Failed to update admin capabilities" }, { status: 500 })
  }

  await logAdminAudit({
    admin,
    action: "admin.capabilities.update",
    targetType: "admin_profile",
    targetId: userId,
    payload: { capabilities },
  })

  return NextResponse.json({ user: data })
}
