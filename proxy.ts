import { createServerClient } from "@supabase/ssr"
import { NextResponse, type NextRequest } from "next/server"

import { isAdminAuthBypassEnabled } from "@/lib/admin-env"
import { updateSupabaseSession } from "@/lib/supabase/middleware"
import { getSupabaseBrowserEnv, hasSupabaseBrowserEnv } from "@/lib/supabase/public-env"

const ADMIN_LOGIN_PATH = "/admin/login"
const PROXY_BYPASS_PATHS = new Set(["/api/meta/webhook"])
const ADMIN_PAGE_ROLES = new Set(["ADMIN", "SUPER_ADMIN"])
const BRANCH_PAGE_ROLES = new Set(["ADMIN", "SUPER_ADMIN", "BRANCH"])

function isProtectedAdminPath(pathname: string) {
  return pathname.startsWith("/admin") && pathname !== ADMIN_LOGIN_PATH
}

function getAllowedAdminPageRoles(pathname: string) {
  return pathname === "/admin/branch" || pathname.startsWith("/admin/branch/")
    ? BRANCH_PAGE_ROLES
    : ADMIN_PAGE_ROLES
}

function hasAllowedAdminPageRole(role: string | undefined, allowedRoles: ReadonlySet<string>) {
  return role ? allowedRoles.has(role.trim().toUpperCase()) : false
}

function getSessionSecret() {
  const sessionSecret = process.env.SESSION_SECRET?.trim()
  if (sessionSecret) return sessionSecret
  if (process.env.NODE_ENV !== "production") return process.env.ADMIN_PASSWORD?.trim() ?? null
  return null
}

function toHex(buffer: ArrayBuffer) {
  return Array.from(new Uint8Array(buffer))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("")
}

function safeEqual(left: string, right: string) {
  if (left.length !== right.length) return false
  let mismatch = 0
  for (let index = 0; index < left.length; index += 1) {
    mismatch |= left.charCodeAt(index) ^ right.charCodeAt(index)
  }
  return mismatch === 0
}

function decodeBase64Url(value: string) {
  const base64 = value.replaceAll("-", "+").replaceAll("_", "/")
  const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, "=")
  const binary = atob(padded)
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index)
  }
  return new TextDecoder().decode(bytes)
}

async function signPayload(payload: string) {
  const secret = getSessionSecret()
  if (!secret) return null

  const encoder = new TextEncoder()
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  )
  return toHex(await crypto.subtle.sign("HMAC", key, encoder.encode(payload)))
}

async function hasLegacyAdminSession(request: NextRequest, allowedRoles: ReadonlySet<string>) {
  const cookie = request.cookies.get("admin_session")?.value
  if (!cookie) return false

  const dotIdx = cookie.lastIndexOf(".")
  if (dotIdx === -1) return false

  const payload = cookie.slice(0, dotIdx)
  const signature = cookie.slice(dotIdx + 1)
  const expected = await signPayload(payload)
  if (!expected || !safeEqual(expected, signature)) return false

  try {
    const session = JSON.parse(decodeBase64Url(payload)) as {
      role?: string
      exp?: number
    }
    return hasAllowedAdminPageRole(session.role, allowedRoles) && !!session.exp && session.exp > Math.floor(Date.now() / 1000)
  } catch {
    return false
  }
}

// 페이지 이동마다 Supabase auth + admin_profiles 왕복을 줄이기 위해
// 통과한 세션 체크 결과를 짧게 캐시한다. (권한 회수 반영 지연 최대 60초)
const SUPABASE_ADMIN_SESSION_TTL_MS = 60_000
const SUPABASE_ADMIN_SESSION_CACHE_MAX = 200
const supabaseAdminSessionCache = new Map<string, number>()

function getSupabaseSessionCacheKey(request: NextRequest, allowedRoles: ReadonlySet<string>) {
  const authCookies = request.cookies
    .getAll()
    .filter(({ name }) => name.startsWith("sb-"))
  if (authCookies.length === 0) return null

  const cookieKey = authCookies
    .map(({ name, value }) => `${name}=${value}`)
    .sort()
    .join(";")
  return `${[...allowedRoles].sort().join(",")}|${cookieKey}`
}

async function hasSupabaseAdminSession(request: NextRequest, allowedRoles: ReadonlySet<string>) {
  if (!hasSupabaseBrowserEnv()) return false

  const cacheKey = getSupabaseSessionCacheKey(request, allowedRoles)
  if (!cacheKey) return false

  const cachedUntil = supabaseAdminSessionCache.get(cacheKey)
  if (cachedUntil && cachedUntil > Date.now()) return true

  const allowed = await checkSupabaseAdminSession(request, allowedRoles)
  if (allowed) {
    if (supabaseAdminSessionCache.size >= SUPABASE_ADMIN_SESSION_CACHE_MAX) {
      supabaseAdminSessionCache.clear()
    }
    supabaseAdminSessionCache.set(cacheKey, Date.now() + SUPABASE_ADMIN_SESSION_TTL_MS)
  } else {
    supabaseAdminSessionCache.delete(cacheKey)
  }

  return allowed
}

async function checkSupabaseAdminSession(request: NextRequest, allowedRoles: ReadonlySet<string>) {
  const { url, publishableKey } = getSupabaseBrowserEnv()
  const supabase = createServerClient(url, publishableKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll()
      },
      setAll() {},
    },
  })

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser()
  if (userError || !user) return false

  const { data: profile, error: profileError } = await supabase
    .from("admin_profiles")
    .select("role, status")
    .eq("user_id", user.id)
    .single()

  if (profileError || !profile || profile.status !== "ACTIVE") return false
  return hasAllowedAdminPageRole(profile.role, allowedRoles)
}

function redirectToAdminLogin(request: NextRequest) {
  const url = request.nextUrl.clone()
  url.pathname = ADMIN_LOGIN_PATH
  url.search = ""
  const response = NextResponse.redirect(url)
  response.cookies.set("admin_session", "", {
    httpOnly: true,
    maxAge: 0,
    path: "/",
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production",
  })
  return response
}

export async function proxy(request: NextRequest) {
  if (PROXY_BYPASS_PATHS.has(request.nextUrl.pathname)) {
    return NextResponse.next({ request })
  }

  const response = await updateSupabaseSession(request)

  if (!isProtectedAdminPath(request.nextUrl.pathname)) {
    return response
  }

  if (isAdminAuthBypassEnabled()) return response

  const allowedRoles = getAllowedAdminPageRoles(request.nextUrl.pathname)
  if (await hasLegacyAdminSession(request, allowedRoles)) return response
  if (await hasSupabaseAdminSession(request, allowedRoles)) return response

  return redirectToAdminLogin(request)
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|css|js|map)$).*)",
  ],
}
