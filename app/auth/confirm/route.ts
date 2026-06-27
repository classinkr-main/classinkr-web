import { NextRequest, NextResponse } from "next/server"
import type { EmailOtpType, User } from "@supabase/supabase-js"

import { upsertPublicUserProfile } from "@/lib/auth/public-user"
import { ANONYMOUS_ID_COOKIE } from "@/lib/consent/consent"
import { stitchIdentity } from "@/lib/identity/stitch"
import { createSupabaseServerClient } from "@/lib/supabase/server"

function getSafeNextUrl(req: NextRequest) {
  const rawNext = req.nextUrl.searchParams.get("next") ?? "/account"
  try {
    const nextUrl = new URL(rawNext, req.nextUrl.origin)
    if (nextUrl.origin !== req.nextUrl.origin) return new URL("/account", req.nextUrl.origin)
    return nextUrl
  } catch {
    return new URL("/account", req.nextUrl.origin)
  }
}

function loginError(req: NextRequest, reason: string) {
  const url = new URL("/login", req.nextUrl.origin)
  url.searchParams.set("auth_error", reason)
  return NextResponse.redirect(url)
}

/**
 * 이메일 확인(회원가입)·비밀번호 재설정 링크의 착지점.
 * token_hash + type(권장, 크로스 디바이스 안전) 또는 code(PKCE) 둘 다 처리한다.
 */
export async function GET(req: NextRequest) {
  const tokenHash = req.nextUrl.searchParams.get("token_hash")
  const type = req.nextUrl.searchParams.get("type") as EmailOtpType | null
  const code = req.nextUrl.searchParams.get("code")
  const nextUrl = getSafeNextUrl(req)

  const supabase = await createSupabaseServerClient()

  let user: User | null = null

  if (tokenHash && type) {
    const { data, error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash })
    if (error || !data.user) return loginError(req, "verify_failed")
    user = data.user
  } else if (code) {
    const { data, error } = await supabase.auth.exchangeCodeForSession(code)
    if (error || !data.user) return loginError(req, "exchange_failed")
    user = data.user
  } else {
    return loginError(req, "missing_token")
  }

  try {
    const profile = await upsertPublicUserProfile(user)
    await stitchIdentity({
      anonymousId: req.cookies.get(ANONYMOUS_ID_COOKIE)?.value ?? null,
      userId: user.id,
      leadId: profile.lead_id,
      email: user.email ?? profile.email,
      emailVerified: Boolean(user.email_confirmed_at),
    })
  } catch (profileError) {
    console.error("[auth/confirm] profile upsert failed:", profileError)
  }

  nextUrl.searchParams.delete("auth_error")
  return NextResponse.redirect(nextUrl)
}
