import { createServerClient } from "@supabase/ssr"
import type { User } from "@supabase/supabase-js"
import { NextRequest, NextResponse } from "next/server"

import { upsertPublicUserProfile } from "@/lib/auth/public-user"
import { ANONYMOUS_ID_COOKIE } from "@/lib/consent/consent"
import { stitchIdentity } from "@/lib/identity/stitch"
import { createSupabaseAdminClient } from "@/lib/supabase/admin"
import { getSupabaseBrowserEnv } from "@/lib/supabase/public-env"

const STATE_COOKIE = "cln_naver_oauth_state"
const NEXT_COOKIE = "cln_naver_oauth_next"

interface NaverTokenResponse {
  access_token?: string
  token_type?: string
  error?: string
  error_description?: string
}

interface NaverProfileResponse {
  response?: {
    id?: string
    email?: string
    name?: string
    nickname?: string
    mobile?: string
  }
  resultcode?: string
  message?: string
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

async function exchangeNaverCode(req: NextRequest, code: string, state: string) {
  const clientId = process.env.NAVER_CLIENT_ID?.trim()
  const clientSecret = process.env.NAVER_CLIENT_SECRET?.trim()
  if (!clientId || !clientSecret) throw new Error("Naver OAuth is not configured.")

  const tokenUrl = new URL("https://nid.naver.com/oauth2.0/token")
  tokenUrl.searchParams.set("grant_type", "authorization_code")
  tokenUrl.searchParams.set("client_id", clientId)
  tokenUrl.searchParams.set("client_secret", clientSecret)
  tokenUrl.searchParams.set("code", code)
  tokenUrl.searchParams.set("state", state)

  const response = await fetch(tokenUrl, { cache: "no-store" })
  const token = (await response.json().catch(() => null)) as NaverTokenResponse | null
  if (!response.ok || !token?.access_token) {
    throw new Error(token?.error_description ?? token?.error ?? "Failed to exchange Naver code.")
  }
  return token.access_token
}

async function fetchNaverProfile(accessToken: string) {
  const response = await fetch("https://openapi.naver.com/v1/nid/me", {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: "no-store",
  })
  const profile = (await response.json().catch(() => null)) as NaverProfileResponse | null
  const data = profile?.response
  if (!response.ok || !data?.id) {
    throw new Error(profile?.message ?? "Failed to fetch Naver profile.")
  }
  return data
}

async function ensureNaverUser(profile: NonNullable<NaverProfileResponse["response"]>) {
  const admin = createSupabaseAdminClient()
  const providerId = profile.id
  const email = profile.email?.trim().toLowerCase() || `naver_${providerId}@naver.invalid`
  const name = profile.name?.trim() || profile.nickname?.trim() || "Naver User"

  const { data: existingProfile } = await admin
    .from("user_profiles")
    .select("id")
    .eq("provider", "naver")
    .eq("provider_id", providerId)
    .maybeSingle()

  if (existingProfile?.id) {
    return { email, userId: existingProfile.id as string }
  }

  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email,
    email_confirm: true,
    user_metadata: {
      provider: "naver",
      provider_id: providerId,
      sub: providerId,
      name,
      phone: profile.mobile ?? null,
    },
  })

  if (createError && !createError.message.toLowerCase().includes("already")) {
    throw createError
  }

  return { email, userId: created.user?.id ?? null }
}

async function issueSupabaseSession(req: NextRequest, email: string, response: NextResponse) {
  const admin = createSupabaseAdminClient()
  let { data: linkData, error: linkError } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email,
  })

  if (linkError) {
    const { error: createError } = await admin.auth.admin.createUser({
      email,
      email_confirm: true,
      user_metadata: { provider: "naver" },
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
    throw linkError ?? new Error("Naver session token was not issued.")
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
  if (error || !data.user) throw error ?? new Error("Failed to verify Naver session.")
  return data.user
}

export async function GET(req: NextRequest) {
  const expectedState = req.cookies.get(STATE_COOKIE)?.value
  const state = req.nextUrl.searchParams.get("state")
  const code = req.nextUrl.searchParams.get("code")

  if (!expectedState || !state || expectedState !== state || !code) {
    return redirectWithError(req, "naver_state")
  }

  const nextUrl = getSafeNextUrl(req)
  const response = NextResponse.redirect(nextUrl)
  response.cookies.set(STATE_COOKIE, "", { maxAge: 0, path: "/" })
  response.cookies.set(NEXT_COOKIE, "", { maxAge: 0, path: "/" })

  try {
    const accessToken = await exchangeNaverCode(req, code, state)
    const profile = await fetchNaverProfile(accessToken)
    const { email } = await ensureNaverUser(profile)
    const user = (await issueSupabaseSession(req, email, response)) as User
    const publicProfile = await upsertPublicUserProfile(user)
    await stitchIdentity({
      anonymousId: req.cookies.get(ANONYMOUS_ID_COOKIE)?.value ?? null,
      userId: user.id,
      leadId: publicProfile.lead_id,
      email: user.email ?? publicProfile.email,
      // Naver /v1/nid/me는 이메일 검증 플래그를 제공하지 않으므로 미검증으로 취급한다(D4).
      // 이메일 문자열로 lead를 자동연결하지 않는다. 계정 사일로/탈취 방지는 Task 7.
      emailVerified: false,
    })
    nextUrl.searchParams.delete("auth_error")
    return response
  } catch (error) {
    console.error("[naver/callback] failed:", error)
    return redirectWithError(req, "naver_failed")
  }
}
