import { NextRequest, NextResponse } from "next/server"
import { createServerClient } from "@supabase/ssr"
import { createSupabaseAdminClient } from "@/lib/supabase/admin"
import { getSupabaseBrowserEnv, hasSupabaseBrowserEnv } from "@/lib/supabase/public-env"
import type { Database } from "@/lib/supabase/database.types"

/**
 * GET /api/partner/data — 파트너 대시보드 데이터
 * 응답: { partner, quotes, contracts, receipts, userRole }
 */

interface ResolvedPartnerInfo {
  partnerId: string
  userRole: "admin" | "member"
}

async function resolvePartnerInfo(req: NextRequest): Promise<ResolvedPartnerInfo | null> {
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
    .select("partner_id, role")
    .eq("user_id", user.id)
    .eq("status", "active")
    .single()
  if (!data?.partner_id) return null
  return { partnerId: data.partner_id, userRole: data.role as "admin" | "member" }
}

export async function GET(req: NextRequest) {
  const partnerInfo = await resolvePartnerInfo(req)
  if (!partnerInfo) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const { partnerId, userRole } = partnerInfo

  const admin = createSupabaseAdminClient()

  const [partnerRes, quotesRes, contractsRes, receiptsRes] = await Promise.all([
    admin.from("partners").select("*").eq("id", partnerId).single(),
    admin.from("quotes").select("*").eq("partner_id", partnerId).order("created_at", { ascending: false }),
    admin.from("contracts").select("id, contract_number, title, status, total_amount, valid_until, sign_token, partner_signed_at, created_at").eq("partner_id", partnerId).order("created_at", { ascending: false }),
    admin.from("receipts").select("*").eq("partner_id", partnerId).order("created_at", { ascending: false }),
  ])

  if (partnerRes.error) {
    console.error("[GET /api/partner/data] partner query failed:", partnerRes.error)
    return NextResponse.json({ error: "데이터 조회 실패" }, { status: 500 })
  }

  return NextResponse.json({
    partner: partnerRes.data,
    quotes: quotesRes.data ?? [],
    contracts: contractsRes.data ?? [],
    receipts: receiptsRes.data ?? [],
    userRole,
  })
}
