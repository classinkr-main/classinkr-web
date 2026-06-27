import { createServerClient } from "@supabase/ssr"
import type { User } from "@supabase/supabase-js"
import { NextRequest, NextResponse } from "next/server"

import { upsertPublicUserProfile } from "@/lib/auth/public-user"
import { ANONYMOUS_ID_COOKIE } from "@/lib/consent/consent"
import { stitchIdentity } from "@/lib/identity/stitch"
import { createSupabaseAdminClient } from "@/lib/supabase/admin"
import { getSupabaseBrowserEnv } from "@/lib/supabase/public-env"

const STATE_COOKIE = "cln_kakao_oauth_state"
const NEXT_COOKIE = "cln_kakao_oauth_next"

interface KakaoTokenResponse {
  access_token?: string
  token_type?: string
  error?: string
  error_description?: string
}

interface KakaoProfileResponse {
  id?: number | string
  kakao_account?: {
    email?: string
    is_email_verified?: boolean
    is_email_valid?: boolean
    profile?: {
      nickname?: string
    }
  }
}

interface KakaoProfile {
  id: string
  email: string | null
  nickname: string | null
  emailVerified: boolean
}

function getSafeNextUrl(req: NextRequest) {
  const rawNext = req.cookies.get(NEXT_COOKIE)?.value ?? "/resources"
  try {
    const nextUrl = new URL(rawNext, req.nextUrl.origin)
    if (nextUrl.origin !== req.nextUrl.origin) return new URL("/resources", req.nextUrl.origin)
    return nextUrl
  } catch {
    return new URL("/resources", req.nextUrl.origin)
  }
}

function redirectWithError(req: NextRequest, code: string) {
  const nextUrl = getSafeNextUrl(req)
  nextUrl.searchParams.set("auth_error", code)
  const response = NextResponse.redirect(nextUrl)
  response.cookies.set(STATE_COOKIE, "", { maxAge: 0, path: "/" })
  response.cookies.set(NEXT_COOKIE, "", { maxAge: 0, path: "/" })
  return response
}

async function exchangeKakaoCode(req: NextRequest, code: string) {
  const clientId = process.env.KAKAO_REST_API_KEY?.trim()
  const clientSecret = process.env.KAKAO_CLIENT_SECRET?.trim()
  if (!clientId) throw new Error("Kakao OAuth is not configured.")

  const redirectUri = `${req.nextUrl.origin}/api/auth/kakao/callback`
  const params = new URLSearchParams()
  params.set("grant_type", "authorization_code")
  params.set("client_id", clientId)
  if (clientSecret) params.set("client_secret", clientSecret)
  params.set("code", code)
  params.set("redirect_uri", redirectUri)

  const response = await fetch("https://kauth.kakao.com/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded;charset=utf-8" },
    body: params.toString(),
    cache: "no-store",
  })
  const token = (await response.json().catch(() => null)) as KakaoTokenResponse | null
  if (!response.ok || !token?.access_token) {
    throw new Error(token?.error_description ?? token?.error ?? "Failed to exchange Kakao code.")
  }
  return token.access_token
}

async function fetchKakaoProfile(accessToken: string): Promise<KakaoProfile> {
  const response = await fetch("https://kapi.kakao.com/v2/user/me", {
    method: "GET",
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: "no-store",
  })
  const profile = (await response.json().catch(() => null)) as KakaoProfileResponse | null
  if (!response.ok || profile?.id === undefined || profile?.id === null) {
    throw new Error("Failed to fetch Kakao profile.")
  }

  const account = profile.kakao_account
  return {
    id: String(profile.id),
    email: account?.email?.trim().toLowerCase() || null,
    nickname: account?.profile?.nickname?.trim() || null,
    emailVerified: Boolean(account?.is_email_verified && account?.is_email_valid),
  }
}

async function ensureKakaoUser(profile: KakaoProfile) {
  const admin = createSupabaseAdminClient()
  const providerId = profile.id
  const email = profile.email || `kakao_${providerId}@kakao.invalid`
  const name = profile.nickname || "Kakao User"

  const { data: existingProfile } = await admin
    .from("user_profiles")
    .select("id")
    .eq("provider", "kakao")
    .eq("provider_id", providerId)
    .maybeSingle()

  if (existingProfile?.id) {
    return { email, userId: existingProfile.id as string }
  }

  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email,
    email_confirm: profile.emailVerified,
    user_metadata: {
      provider: "kakao",
      provider_id: providerId,
      sub: providerId,
      name,
    },
  })

  if (createError && !createError.message.toLowerCase().includes("already")) {
    throw createError
  }

  return { email, userId: created.user?.id ?? null }
}

async function issueSupabaseSession(
  req: NextRequest,
  email: string,
  emailVerified: boolean,
  response: NextResponse,
) {
  const admin = createSupabaseAdminClient()
  let { data: linkData, error: linkError } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email,
  })

  if (linkError) {
    const { error: createError } = await admin.auth.admin.createUser({
      email,
      email_confirm: emailVerified,
      user_metadata: { provider: "kakao" },
    })
    if (createError && !createError.message.toLowerCase().includes("already")) {
      throw createError
    }
    const retry = await admin.auth.admin.generateLink({ type: "magiclink", email })
    linkData = retry.data
    linkError = retry.error
  }

  const hashedToken = (linkData as { properties?: { hashed_token?: string } } | null)
    ?.properties?.hashed_token
  if (linkError || !hashedToken) {
    throw linkError ?? new Error("Kakao session token was not issued.")
  }

  const { url, publishableKey } = getSupabaseBrowserEnv()
  const supabase = createServerClient(url, publishableKey, {
    cookies: {
      getAll() {
        return req.cookies.getAll()
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value, options }) => {
          response.cookies.set(name, value, options)
        })
      },
    },
  })

  const { data, error } = await supabase.auth.verifyOtp({
    type: "email",
    token_hash: hashedToken,
  })
  if (error || !data.user) throw error ?? new Error("Failed to verify Kakao session.")
  return data.user
}

export async function GET(req: NextRequest) {
  const expectedState = req.cookies.get(STATE_COOKIE)?.value
  const state = req.nextUrl.searchParams.get("state")
  const code = req.nextUrl.searchParams.get("code")

  if (!expectedState || !state || expectedState !== state || !code) {
    return redirectWithError(req, "kakao_state")
  }

  const nextUrl = getSafeNextUrl(req)
  const response = NextResponse.redirect(nextUrl)
  response.cookies.set(STATE_COOKIE, "", { maxAge: 0, path: "/" })
  response.cookies.set(NEXT_COOKIE, "", { maxAge: 0, path: "/" })

  try {
    const accessToken = await exchangeKakaoCode(req, code)
    const profile = await fetchKakaoProfile(accessToken)
    if (!profile.id) {
      return redirectWithError(req, "kakao_email")
    }
    const { email } = await ensureKakaoUser(profile)
    const user = (await issueSupabaseSession(
      req,
      email,
      profile.emailVerified,
      response,
    )) as User
    const publicProfile = await upsertPublicUserProfile(user)
    await stitchIdentity({
      anonymousId: req.cookies.get(ANONYMOUS_ID_COOKIE)?.value ?? null,
      userId: user.id,
      leadId: publicProfile.lead_id,
      email: user.email ?? publicProfile.email,
      emailVerified: profile.emailVerified,
    })
    nextUrl.searchParams.delete("auth_error")
    return response
  } catch (error) {
    console.error("[kakao/callback] failed:", error)
    return redirectWithError(req, "kakao_failed")
  }
}
