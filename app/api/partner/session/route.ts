import { NextRequest, NextResponse } from "next/server"
import { createSupabaseAdminClient } from "@/lib/supabase/admin"
import { resolvePartnerAccountContext } from "@/lib/partner-portal/context"

/**
 * POST /api/partner/session — 로그인 후 last_login_at, status 갱신
 * GET  /api/partner/session — 현재 파트너 세션 정보 반환
 */

export async function POST(req: NextRequest) {
  const context = await resolvePartnerAccountContext(req)
  if (!context) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const admin = createSupabaseAdminClient()
  const table = context.source === "v2" ? "partner_account_users" : "partner_users"
  const { error } = await admin
    .from(table)
    .update({ last_login_at: new Date().toISOString(), status: "active" })
    .eq("user_id", context.userId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

export async function GET(req: NextRequest) {
  const context = await resolvePartnerAccountContext(req)
  if (!context) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const admin = createSupabaseAdminClient()

  if (context.source === "v2" && context.partnerAccountId) {
    const { data: partnerUser, error } = await admin
      .from("partner_account_users")
      .select("*, partner_accounts(*)")
      .eq("user_id", context.userId)
      .eq("status", "active")
      .single()

    if (error || !partnerUser) {
      return NextResponse.json({ error: "파트너 계정을 찾을 수 없습니다" }, { status: 403 })
    }

    return NextResponse.json({ partnerUser, context })
  }

  const { data: partnerUser, error } = await admin
    .from("partner_users")
    .select("*, partners(*)")
    .eq("user_id", context.userId)
    .eq("status", "active")
    .single()

  if (error || !partnerUser) {
    return NextResponse.json({ error: "파트너 계정을 찾을 수 없습니다" }, { status: 403 })
  }

  return NextResponse.json({ partnerUser, context })
}
