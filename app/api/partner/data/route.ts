import { NextRequest, NextResponse } from "next/server"
import { createServerClient } from "@supabase/ssr"
import { createSupabaseAdminClient } from "@/lib/supabase/admin"
import { getSupabaseBrowserEnv, hasSupabaseBrowserEnv } from "@/lib/supabase/public-env"
import type { Database } from "@/lib/supabase/database.types"

/**
 * GET /api/partner/data — 파트너 대시보드 데이터
 * 응답: { partner, quotes, contracts, receipts }
 */

async function resolvePartnerId(req: NextRequest): Promise<string | null> {
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

  const admin = createSupabaseAdminClient()
  const { data } = await admin
    .from("partner_users")
    .select("partner_id")
    .eq("user_id", user.id)
    .eq("status", "active")
    .single()
  return data?.partner_id ?? null
}

export async function GET(req: NextRequest) {
  const partnerId = await resolvePartnerId(req)
  if (!partnerId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const admin = createSupabaseAdminClient()

  const [
    { data: partner },
    { data: quotes },
    { data: contracts },
    { data: receipts },
  ] = await Promise.all([
    admin.from("partners").select("*").eq("id", partnerId).single(),
    admin.from("quotes").select("*").eq("partner_id", partnerId).order("created_at", { ascending: false }),
    admin.from("contracts").select("id, contract_number, title, status, total_amount, valid_until, sign_token, partner_signed_at, created_at").eq("partner_id", partnerId).order("created_at", { ascending: false }),
    admin.from("receipts").select("*").eq("partner_id", partnerId).order("created_at", { ascending: false }),
  ])

  return NextResponse.json({ partner, quotes: quotes ?? [], contracts: contracts ?? [], receipts: receipts ?? [] })
}
