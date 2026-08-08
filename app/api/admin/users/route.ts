import { NextRequest, NextResponse } from "next/server"

import { isNavPresetKey, normalizeNavOverrides } from "@/components/admin/admin-nav-access"
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

  if (!userId) {
    return NextResponse.json({ error: "userId is required" }, { status: 400 })
  }

  const supabase = createSupabaseAdminClient()

  // nav 배치 갱신 — capabilities와 별개 축이라 별도 분기·별도 감사 로그를 쓴다.
  if ("navPreset" in (body ?? {}) || "navOverrides" in (body ?? {})) {
    const rawPreset = body?.navPreset
    if (rawPreset != null && !isNavPresetKey(rawPreset)) {
      return NextResponse.json({ error: "Unknown navPreset" }, { status: 400 })
    }

    const navPreset = (rawPreset ?? null) as string | null
    const navOverrides = normalizeNavOverrides(body?.navOverrides)

    const { data, error } = await supabase
      .from("admin_profiles")
      .update({ nav_preset: navPreset, nav_overrides: navOverrides })
      .eq("user_id", userId)
      .select("user_id, display_name, role, status, nav_preset, nav_overrides")
      .single()

    if (error || !data) {
      console.error("[PATCH /api/admin/users nav]", error)
      return NextResponse.json({ error: "Failed to update admin nav access" }, { status: 500 })
    }

    await logAdminAudit({
      admin,
      action: "admin.nav_access.update",
      targetType: "admin_profile",
      targetId: userId,
      payload: { navPreset, navOverrides },
    })

    return NextResponse.json({ user: data })
  }

  const capabilities = normalizeAdminCapabilities(body?.capabilities)

  if (!capabilities) {
    return NextResponse.json(
      { error: "userId and a valid capabilities array are required" },
      { status: 400 }
    )
  }

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
