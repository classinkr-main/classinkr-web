import { NextRequest, NextResponse } from "next/server"

import { upsertPublicUserProfile } from "@/lib/auth/public-user"
import { ANONYMOUS_ID_COOKIE } from "@/lib/consent/consent"
import { stitchIdentity } from "@/lib/identity/stitch"
import { createSupabaseServerClient } from "@/lib/supabase/server"

function getSafeNextUrl(req: NextRequest) {
  const rawNext = req.nextUrl.searchParams.get("next") ?? "/resources"
  try {
    const nextUrl = new URL(rawNext, req.nextUrl.origin)
    if (nextUrl.origin !== req.nextUrl.origin) return new URL("/resources", req.nextUrl.origin)
    return nextUrl
  } catch {
    return new URL("/resources", req.nextUrl.origin)
  }
}

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code")
  const nextUrl = getSafeNextUrl(req)

  if (!code) {
    nextUrl.searchParams.set("auth_error", "missing_code")
    return NextResponse.redirect(nextUrl)
  }

  const supabase = await createSupabaseServerClient()
  const { data, error } = await supabase.auth.exchangeCodeForSession(code)

  if (error || !data.user) {
    nextUrl.searchParams.set("auth_error", "exchange_failed")
    return NextResponse.redirect(nextUrl)
  }

  try {
    const profile = await upsertPublicUserProfile(data.user)
    await stitchIdentity({
      anonymousId: req.cookies.get(ANONYMOUS_ID_COOKIE)?.value ?? null,
      userId: data.user.id,
      leadId: profile.lead_id,
      email: data.user.email ?? profile.email,
      emailVerified: Boolean(data.user.email_confirmed_at),
    })
  } catch (profileError) {
    console.error("[auth/callback] profile upsert failed:", profileError)
  }

  nextUrl.searchParams.delete("auth_error")
  return NextResponse.redirect(nextUrl)
}
