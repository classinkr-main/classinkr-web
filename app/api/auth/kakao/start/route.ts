import { randomUUID } from "node:crypto"
import { NextRequest, NextResponse } from "next/server"

const STATE_COOKIE = "cln_kakao_oauth_state"
const NEXT_COOKIE = "cln_kakao_oauth_next"

function getSafeNextPath(req: NextRequest) {
  const rawNext = req.nextUrl.searchParams.get("next") ?? "/resources"
  try {
    const nextUrl = new URL(rawNext, req.nextUrl.origin)
    if (nextUrl.origin !== req.nextUrl.origin) return "/resources"
    return `${nextUrl.pathname}${nextUrl.search}${nextUrl.hash}`
  } catch {
    return "/resources"
  }
}

export async function GET(req: NextRequest) {
  const clientId = process.env.KAKAO_REST_API_KEY?.trim()
  if (!clientId) {
    const fallback = new URL(getSafeNextPath(req), req.nextUrl.origin)
    fallback.searchParams.set("auth_error", "kakao_not_configured")
    return NextResponse.redirect(fallback)
  }

  const state = randomUUID()
  const redirectUri = `${req.nextUrl.origin}/api/auth/kakao/callback`
  const authorizeUrl = new URL("https://kauth.kakao.com/oauth/authorize")
  authorizeUrl.searchParams.set("response_type", "code")
  authorizeUrl.searchParams.set("client_id", clientId)
  authorizeUrl.searchParams.set("redirect_uri", redirectUri)
  authorizeUrl.searchParams.set("state", state)
  authorizeUrl.searchParams.set("scope", "account_email,profile_nickname")

  const response = NextResponse.redirect(authorizeUrl)
  const secure = process.env.NODE_ENV === "production"
  response.cookies.set(STATE_COOKIE, state, {
    httpOnly: true,
    sameSite: "lax",
    secure,
    path: "/",
    maxAge: 60 * 10,
  })
  response.cookies.set(NEXT_COOKIE, getSafeNextPath(req), {
    httpOnly: true,
    sameSite: "lax",
    secure,
    path: "/",
    maxAge: 60 * 10,
  })
  return response
}
