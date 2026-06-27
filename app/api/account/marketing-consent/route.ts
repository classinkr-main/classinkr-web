import { type NextRequest, NextResponse } from "next/server"

import { getPublicUserContext } from "@/lib/auth/public-user"
import { isCrossOriginRequest } from "@/lib/server/same-origin"
import { createSupabaseAdminClient } from "@/lib/supabase/admin"

interface MarketingConsentBody {
  consent?: boolean
}

/**
 * 로그인한 공개 사용자의 마케팅 수신 동의 상태를 반환한다.
 * user_profiles.marketing_consent는 RLS로 보호되므로 admin 클라이언트(service_role)로만 읽는다.
 */
export async function GET() {
  const context = await getPublicUserContext()
  if (!context) {
    return NextResponse.json({ ok: false }, { status: 401 })
  }

  const supabase = createSupabaseAdminClient()
  const { data, error } = await supabase
    .from("user_profiles")
    .select("marketing_consent")
    .eq("id", context.user.id)
    .maybeSingle()

  if (error) {
    return NextResponse.json({ ok: false }, { status: 500 })
  }

  return NextResponse.json({ ok: true, consent: Boolean(data?.marketing_consent) })
}

/**
 * 마케팅 수신 동의 opt-in/철회를 기록한다. 철회는 opt-in과 동일하게 consent:false POST 한 번으로 처리된다.
 * 항상 로그인 사용자의 id로 스코프하며 admin 클라이언트로만 쓴다(서버/익명 클라이언트는 RLS로 0행).
 */
export async function POST(req: NextRequest) {
  if (isCrossOriginRequest(req)) {
    return NextResponse.json({ ok: false }, { status: 403 })
  }

  const context = await getPublicUserContext()
  if (!context) {
    return NextResponse.json({ ok: false }, { status: 401 })
  }

  let body: MarketingConsentBody
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 })
  }

  if (typeof body.consent !== "boolean") {
    return NextResponse.json({ ok: false }, { status: 400 })
  }

  const supabase = createSupabaseAdminClient()
  const { error } = await supabase
    .from("user_profiles")
    .update({ marketing_consent: body.consent })
    .eq("id", context.user.id)

  if (error) {
    return NextResponse.json({ ok: false }, { status: 500 })
  }

  return NextResponse.json({ ok: true, consent: body.consent })
}
