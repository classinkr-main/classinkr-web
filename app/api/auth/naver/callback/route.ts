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

function clearOAuthCookies(response: NextResponse) {
  const options = {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  }
  response.cookies.set(STATE_COOKIE, "", options)
  response.cookies.set(NEXT_COOKIE, "", options)
}

function redirectWithError(req: NextRequest, code: string) {
  const nextUrl = getSafeNextUrl(req)
  nextUrl.searchParams.set("auth_error", code)
  const response = NextResponse.redirect(nextUrl)
  clearOAuthCookies(response)
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

// SECURITY: Naver's /v1/nid/me exposes no email-verification flag, so the
// Naver-provided email is UNVERIFIED. We key the Supabase auth identity on a
// synthetic provider-siloed address (naver_<providerId>@naver.invalid) instead
// of the real email. This prevents an email-collision account takeover: a
// magiclink minted against the real email could otherwise resolve to a
// pre-existing account that already owns it. The real email is retained only
// as a non-identity profile attribute (user_metadata.real_email). email_confirm
// is true ONLY because the synthetic .invalid address is non-routable and
// uniquely derived from the Naver account id — it asserts Naver-account
// ownership, not real-mailbox ownership.
function getNaverAuthEmail(providerId: string) {
  return `naver_${providerId}@naver.invalid`
}

async function ensureNaverUser(profile: NonNullable<NaverProfileResponse["response"]>) {
  const admin = createSupabaseAdminClient()
  const providerId = profile.id as string
  const authEmail = getNaverAuthEmail(providerId)
  const realEmail = profile.email?.trim().toLowerCase() || null
  const name = profile.name?.trim() || profile.nickname?.trim() || "Naver User"

  const { data: existingProfile } = await admin
    .from("user_profiles")
    .select("id")
    .eq("provider", "naver")
    .eq("provider_id", providerId)
    .maybeSingle()

  if (existingProfile?.id) {
    return { authEmail, realEmail, userId: existingProfile.id as string }
  }

  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email: authEmail,
    email_confirm: true,
    user_metadata: {
      provider: "naver",
      provider_id: providerId,
      sub: providerId,
      name,
      real_email: realEmail,
      phone: profile.mobile ?? null,
    },
  })

  if (createError && !createError.message.toLowerCase().includes("already")) {
    throw createError
  }

  return { authEmail, realEmail, userId: created.user?.id ?? null }
}

// SECURITY: `authEmail` is always the synthetic provider-siloed address
// (naver_<providerId>@naver.invalid). The magiclink + verifyOtp round trip is
// bound to that address, so the issued session can never land on a pre-existing
// user that owns the real Naver email. Never pass the real email here.
async function issueSupabaseSession(
  req: NextRequest,
  authEmail: string,
  response: NextResponse,
) {
  const admin = createSupabaseAdminClient()
  let { data: linkData, error: linkError } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email: authEmail,
  })

  if (linkError) {
    const { error: createError } = await admin.auth.admin.createUser({
      email: authEmail,
      email_confirm: true,
      user_metadata: { provider: "naver" },
    })
    if (createError && !createError.message.toLowerCase().includes("already")) {
      throw createError
    }
    const retry = await admin.auth.admin.generateLink({ type: "magiclink", email: authEmail })
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
  clearOAuthCookies(response)

  try {
    const accessToken = await exchangeNaverCode(req, code, state)
    const profile = await fetchNaverProfile(accessToken)
    const { authEmail, realEmail } = await ensureNaverUser(profile)
    // SECURITY: mint the session against the synthetic auth email only.
    const user = (await issueSupabaseSession(req, authEmail, response)) as User
    const publicProfile = await upsertPublicUserProfile(user)
    await stitchIdentity({
      anonymousId: req.cookies.get(ANONYMOUS_ID_COOKIE)?.value ?? null,
      userId: user.id,
      leadId: publicProfile.lead_id,
      // SECURITY: Naver email is UNVERIFIED (no flag in /v1/nid/me). Pass the real
      // email for diagnostics but mark emailVerified:false so the stitch never
      // auto-links leads by this email string (D4).
      email: realEmail ?? publicProfile.email,
      emailVerified: false,
    })
    nextUrl.searchParams.delete("auth_error")
    return response
  } catch (error) {
    console.error("[naver/callback] failed:", error)
    return redirectWithError(req, "naver_failed")
  }
}
