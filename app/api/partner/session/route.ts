import { NextRequest, NextResponse } from "next/server"
import { createServerClient } from "@supabase/ssr"
import { createSupabaseAdminClient } from "@/lib/supabase/admin"
import { getSupabaseBrowserEnv, hasSupabaseBrowserEnv } from "@/lib/supabase/public-env"
import type { Database } from "@/lib/supabase/database.types"

/**
 * POST /api/partner/session — 로그인 후 last_login_at, status 갱신
 * GET  /api/partner/session — 현재 파트너 세션 정보 반환
 */

async function getPartnerUser(req: NextRequest) {
  if (!hasSupabaseBrowserEnv()) return null
  const { url, publishableKey } = getSupabaseBrowserEnv()
  const supabase = createServerClient<Database>(url, publishableKey, {
    cookies: {
      getAll() { return req.cookies.getAll() },
      setAll() {},
    },
  })
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) return null
  return user
}

export async function POST(req: NextRequest) {
  const user = await getPartnerUser(req)
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const admin = createSupabaseAdminClient()
  const { error } = await admin
    .from("partner_users")
    .update({ last_login_at: new Date().toISOString(), status: "active" })
    .eq("user_id", user.id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

export async function GET(req: NextRequest) {
  const user = await getPartnerUser(req)
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const admin = createSupabaseAdminClient()
  const { data: partnerUser, error } = await admin
    .from("partner_users")
    .select("*, partners(*)")
    .eq("user_id", user.id)
    .eq("status", "active")
    .single()

  if (error || !partnerUser) {
    return NextResponse.json({ error: "파트너 계정을 찾을 수 없습니다" }, { status: 403 })
  }

  return NextResponse.json({ partnerUser })
}
