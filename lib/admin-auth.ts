import { createServerClient } from "@supabase/ssr"
import { createHmac, timingSafeEqual } from "crypto"
import { cookies } from "next/headers"
import { NextRequest, NextResponse } from "next/server"

import {
  ADMIN_AUTH_ERROR_CODE,
  type AdminAuthErrorCode,
} from "@/lib/admin-auth-errors"
import type { AdminCapability } from "@/lib/admin-capabilities"
import { isAdminAuthBypassEnabled } from "@/lib/admin-env"
import type { AdminProfile, Database } from "@/lib/supabase/database.types"
// 토큰 검증 규칙(getClaims 우선 + getUser 폴백)은 프록시와 API 가드가 공유한다.
// 정본은 lib/supabase/middleware.ts에 있고, 이 모듈은 그 규칙을 그대로 쓴다.
import { verifySupabaseAuthUser } from "@/lib/supabase/middleware"
import {
  getSupabaseBrowserEnv,
  hasSupabaseBrowserEnv,
} from "@/lib/supabase/public-env"

function getSessionSecret(): string | null {
  const sessionSecret = process.env.SESSION_SECRET?.trim()
  if (sessionSecret) return sessionSecret

  if (process.env.NODE_ENV !== "production") {
    return process.env.ADMIN_PASSWORD?.trim() ?? null
  }

  return null
}

function signPayload(payload: string): string | null {
  const secret = getSessionSecret()
  if (!secret) return null
  return createHmac("sha256", secret).update(payload).digest("hex")
}

export type AdminRole = "admin" | "branch"

export interface AdminSession {
  name: string
  role: AdminRole
  branch?: string
  iat?: number
  exp?: number
}

export interface VerifiedAdminContext {
  source: "bypass" | "legacy" | "supabase"
  role: string
  name?: string
  branch?: string
  userId?: string
  capabilities: readonly string[]
}

export interface AdminActorSnapshot {
  actor_user_id: string | null
  actor_display_name: string
  actor_role: string
}

export type AdminApiRole =
  | "SUPER_ADMIN"
  | "ADMIN"
  | "EDITOR"
  | "VIEWER"
  | "PARTNER"
  | "BRANCH"

export const STAFF_ADMIN_API_ROLES: readonly AdminApiRole[] = ["SUPER_ADMIN", "ADMIN"]
export const BRANCH_READ_ADMIN_API_ROLES: readonly AdminApiRole[] = [
  "SUPER_ADMIN",
  "ADMIN",
  "BRANCH",
  "EDITOR",
  "VIEWER",
]
export const CRM_STAFF_ADMIN_API_ROLES: readonly AdminApiRole[] = [
  "SUPER_ADMIN",
  "ADMIN",
  "BRANCH",
  // 운영 DB의 기존 팀원 8명이 EDITOR인 전환기 호환. RBAC 마이그레이션 후 ADMIN으로 수렴한다.
  "EDITOR",
]

// 하드웨어 일반 편집은 모든 내부 운영 계정에 허용한다. 출고 확정·원장 취소처럼
// 되돌리기 비용이 큰 동작만 hardware.finalize capability로 한 단계 더 제한한다.
export const HARDWARE_EDITOR_ADMIN_API_ROLES: readonly AdminApiRole[] = [
  "SUPER_ADMIN",
  "ADMIN",
  "BRANCH",
  "EDITOR",
]

export const HARDWARE_FINALIZE_CAPABILITY: AdminCapability = "hardware.finalize"

export function isLegacyAdminAuthEnabled() {
  return process.env.NODE_ENV !== "production"
}

interface UserRecord {
  name: string
  password: string
  role: AdminRole
  branch?: string
}

interface AdminUsersResult {
  users: UserRecord[]
  code?: AdminAuthErrorCode
}

interface AuthResult {
  session: AdminSession | null
  code?: AdminAuthErrorCode
}

function isAdminRole(value: unknown): value is AdminRole {
  return value === "admin" || value === "branch"
}

function getAllUsers(): AdminUsersResult {
  const raw = process.env.ADMIN_USERS?.trim()

  if (raw) {
    try {
      const parsed = JSON.parse(raw)
      if (!Array.isArray(parsed) || parsed.length === 0) {
        return { users: [], code: ADMIN_AUTH_ERROR_CODE.INVALID_CONFIG }
      }

      const users = parsed.map((entry) => {
        if (!entry || typeof entry !== "object") return null

        const { name, password, role, branch } = entry as Partial<UserRecord>
        if (typeof name !== "string" || !name.trim()) return null
        if (typeof password !== "string" || !password.trim()) return null
        if (!isAdminRole(role)) return null
        if (branch != null && typeof branch !== "string") return null

        return {
          name: name.trim(),
          password,
          role,
          branch: branch?.trim() || undefined,
        }
      })

      if (users.some((user) => user == null)) {
        return { users: [], code: ADMIN_AUTH_ERROR_CODE.INVALID_CONFIG }
      }

      return { users: users as UserRecord[] }
    } catch {
      return { users: [], code: ADMIN_AUTH_ERROR_CODE.INVALID_CONFIG }
    }
  }

  const legacy = process.env.ADMIN_PASSWORD?.trim()
  if (legacy) {
    return { users: [{ name: "Admin", password: legacy, role: "admin" }] }
  }

  return { users: [], code: ADMIN_AUTH_ERROR_CODE.NOT_CONFIGURED }
}

export function authenticateUser(password: string): AuthResult {
  if (!isLegacyAdminAuthEnabled()) {
    return { session: null, code: ADMIN_AUTH_ERROR_CODE.LEGACY_DISABLED }
  }

  const { users, code } = getAllUsers()
  if (code) return { session: null, code }

  const user = users.find((candidate) => safeCompare(candidate.password, password))
  if (!user) {
    return { session: null, code: ADMIN_AUTH_ERROR_CODE.INVALID_CREDENTIALS }
  }

  return {
    session: { name: user.name, role: user.role, branch: user.branch },
  }
}

function safeCompare(expected: string, actual: string) {
  const expectedBuffer = Buffer.from(expected)
  const actualBuffer = Buffer.from(actual)

  if (expectedBuffer.length !== actualBuffer.length) {
    return false
  }

  return timingSafeEqual(expectedBuffer, actualBuffer)
}

export function normalizeAdminApiRole(role: string): AdminApiRole | null {
  const normalized = role.trim().toUpperCase()
  if (normalized === "ADMIN") return "ADMIN"
  if (normalized === "SUPER_ADMIN") return "SUPER_ADMIN"
  if (normalized === "EDITOR") return "EDITOR"
  if (normalized === "VIEWER") return "VIEWER"
  if (normalized === "PARTNER") return "PARTNER"
  if (normalized === "BRANCH") return "BRANCH"
  return null
}

export function hasAdminApiRole(
  role: string,
  allowedRoles: readonly AdminApiRole[] = STAFF_ADMIN_API_ROLES
) {
  const normalized = normalizeAdminApiRole(role)
  return normalized != null && allowedRoles.includes(normalized)
}

function isUnsafeMethod(method: string) {
  return !["GET", "HEAD", "OPTIONS"].includes(method.toUpperCase())
}

export function defaultAdminApiRolesForMethod(method: string) {
  return isUnsafeMethod(method) ? STAFF_ADMIN_API_ROLES : BRANCH_READ_ADMIN_API_ROLES
}

function sameOrigin(value: string | null, expectedOrigin: string) {
  if (!value) return true

  try {
    return new URL(value).origin === expectedOrigin
  } catch {
    return false
  }
}

export function verifySameOriginRequest(req: NextRequest): NextResponse | undefined {
  if (!isUnsafeMethod(req.method)) return undefined

  const secFetchSite = req.headers.get("sec-fetch-site")?.toLowerCase()
  if (secFetchSite === "cross-site") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const expectedOrigin = req.nextUrl.origin
  if (!sameOrigin(req.headers.get("origin"), expectedOrigin)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }
  if (!sameOrigin(req.headers.get("referer"), expectedOrigin)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  return undefined
}

export function encodeSession(session: AdminSession): string {
  const now = Math.floor(Date.now() / 1000)
  const payload = Buffer.from(
    JSON.stringify({
      ...session,
      iat: now,
      exp: now + 60 * 60 * 24 * 7,
    })
  ).toString("base64url")
  const sig = signPayload(payload)

  if (!sig) {
    throw new Error(
      "Missing session secret. Set SESSION_SECRET or ADMIN_PASSWORD."
    )
  }

  return `${payload}.${sig}`
}

export function decodeSession(cookie: string): AdminSession | null {
  try {
    const dotIdx = cookie.lastIndexOf(".")
    if (dotIdx === -1) return null

    const payload = cookie.slice(0, dotIdx)
    const sig = cookie.slice(dotIdx + 1)
    const expectedSig = signPayload(payload)
    if (!expectedSig || !safeCompare(expectedSig, sig)) return null

    const session = JSON.parse(
      Buffer.from(payload, "base64url").toString("utf8")
    ) as AdminSession
    if (!session.exp || !Number.isFinite(session.exp)) return null
    if (session.exp <= Math.floor(Date.now() / 1000)) return null

    return session
  } catch {
    return null
  }
}

function getLegacyAdminContext(req: NextRequest): VerifiedAdminContext | null {
  if (!isLegacyAdminAuthEnabled()) return null

  const cookie = req.cookies.get("admin_session")?.value
  if (!cookie) return null

  const session = decodeSession(cookie)
  if (!session) return null

  return {
    source: "legacy",
    role: session.role,
    name: session.name,
    branch: session.branch,
    capabilities: [],
  }
}

// Supabase 관리자 컨텍스트는 요청마다 admin_profiles 왕복이 필요하므로 동일 세션 쿠키에
// 대해 짧게 캐시한다. (관리자 권한 회수 반영 지연 최대 60초)
// 토큰 검증은 verifySupabaseAuthUser()가 담당한다. 비대칭 서명 키 프로젝트에서는 JWKS
// 로컬 검증이라 캐시 미스에도 GoTrue 왕복이 없고, 사용자 삭제·차단은 토큰 만료(최대 1시간)
// 까지 반영이 늦어질 수 있다. 자세한 신뢰 모델은 verifySupabaseAuthUser() 주석 참고.
const SUPABASE_ADMIN_CONTEXT_TTL_MS = 60_000
const SUPABASE_ADMIN_CONTEXT_CACHE_MAX = 200
// 콜드 스타트에서 한 화면이 여러 어드민 API를 동시에 때리므로 완료된 결과뿐 아니라
// 진행 중 요청도 같은 키로 공유한다.
type SupabaseAdminContextEntry = {
  promise: Promise<VerifiedAdminContext | null>
  expiresAt: number
}
const supabaseAdminContextCache = new Map<string, SupabaseAdminContextEntry>()

function toSupabaseAuthCookieKey(
  allCookies: readonly { name: string; value: string }[]
): string | null {
  const authCookies = allCookies.filter(({ name }) => name.startsWith("sb-"))
  if (authCookies.length === 0) return null

  return authCookies
    .map(({ name, value }) => `${name}=${value}`)
    .sort()
    .join(";")
}

function getSupabaseAuthCookieKey(req: NextRequest): string | null {
  return toSupabaseAuthCookieKey(req.cookies.getAll())
}

async function getSupabaseAdminContext(
  req: NextRequest
): Promise<VerifiedAdminContext | null> {
  if (!hasSupabaseBrowserEnv()) return null

  const cacheKey = getSupabaseAuthCookieKey(req)
  if (!cacheKey) return null

  const cached = supabaseAdminContextCache.get(cacheKey)
  if (cached && cached.expiresAt > Date.now()) {
    return cached.promise
  }

  if (supabaseAdminContextCache.size >= SUPABASE_ADMIN_CONTEXT_CACHE_MAX) {
    supabaseAdminContextCache.clear()
  }

  const request = fetchSupabaseAdminContext(req).then(
    (context) => {
      const entry = supabaseAdminContextCache.get(cacheKey)
      if (entry?.promise === request) {
        if (context) {
          entry.expiresAt = Date.now() + SUPABASE_ADMIN_CONTEXT_TTL_MS
        } else {
          supabaseAdminContextCache.delete(cacheKey)
        }
      }
      return context
    },
    (error) => {
      const entry = supabaseAdminContextCache.get(cacheKey)
      if (entry?.promise === request) {
        supabaseAdminContextCache.delete(cacheKey)
      }
      throw error
    }
  )

  // 진행 중 엔트리도 같은 TTL을 달아 둔다. 응답이 끝내 안 오면 60초 뒤 새 요청이 뜨도록.
  supabaseAdminContextCache.set(cacheKey, {
    promise: request,
    expiresAt: Date.now() + SUPABASE_ADMIN_CONTEXT_TTL_MS,
  })

  return request
}

async function fetchSupabaseAdminContext(
  req: NextRequest
): Promise<VerifiedAdminContext | null> {
  const { url, publishableKey } = getSupabaseBrowserEnv()
  const supabase = createServerClient<Database>(url, publishableKey, {
    cookies: {
      getAll() {
        return req.cookies.getAll()
      },
      setAll() {},
    },
  })

  const user = await verifySupabaseAuthUser(supabase.auth)
  if (!user) return null

  const { data: profile, error: profileError } = await supabase
    .from("admin_profiles")
    .select("user_id, display_name, role, status, capabilities")
    .eq("user_id", user.id)
    .single()

  if (profileError || !profile) return null

  const adminProfile = profile as Pick<
    AdminProfile,
    "user_id" | "display_name" | "role" | "status" | "capabilities"
  >
  if (adminProfile.status !== "ACTIVE") return null

  return {
    source: "supabase",
    role: adminProfile.role,
    name: adminProfile.display_name,
    userId: adminProfile.user_id,
    capabilities: adminProfile.capabilities,
  }
}

// ---------------------------------------------------------------------------
// 어드민 셸(사이드바 + 커맨드 팔레트) 서버 부트스트랩
// ---------------------------------------------------------------------------

/**
 * 어드민 셸이 첫 렌더에 필요한 최소 세션. 클라이언트 SessionInfo와 같은 모양이며,
 * `source`는 하이드레이션할 sessionStorage 토큰 값을 고르는 데 쓴다.
 *
 * 이 값은 업무 표면 가드(사이드바 구성·차단 안내)용이지 보안 경계가 아니다.
 * 실제 데이터 차단은 각 API의 requireVerifiedAdminContext가 담당한다.
 */
export interface AdminShellSession {
  role: string
  name: string
  email: string
  navPreset: string | null
  navOverrides: Record<string, string>
  /** 레거시 세션에만 있다. Supabase 경로는 항상 undefined. */
  branch?: string
  source: "supabase" | "legacy"
}

/**
 * `cookies()`(RSC)와 테스트 스텁이 모두 만족하는 최소 쿠키 저장소 모양.
 * Next 내부 타입에 의존하지 않으려고 구조적으로만 좁힌다.
 */
type AdminCookieStore = {
  get: (name: string) => { value: string } | undefined
  getAll: () => { name: string; value: string }[]
}

// 셸 세션은 admin_profiles에서 nav_preset/nav_overrides까지 읽어 컬럼 셋이
// getSupabaseAdminContext()와 다르다. 같은 Map을 공유하면 서로의 결과를 덮어쓰므로
// TTL·상한 처리는 같게 두고 Map만 분리한다. (권한 회수 반영 지연 최대 60초)
const ADMIN_SHELL_SESSION_TTL_MS = 60_000
const ADMIN_SHELL_SESSION_CACHE_MAX = 200
type AdminShellSessionEntry = {
  promise: Promise<AdminShellSession | null>
  expiresAt: number
}
const adminShellSessionCache = new Map<string, AdminShellSessionEntry>()

type AdminShellProfileRow = Pick<AdminProfile, "display_name" | "role" | "status"> &
  Partial<Pick<AdminProfile, "nav_preset" | "nav_overrides">>

/**
 * 서버(레이아웃 RSC)에서 어드민 셸 세션을 해석한다.
 *
 * 브라우저가 마운트 후에 하던 `getUser()` + `admin_profiles` 왕복 2회를 서버 렌더로
 * 옮겨, 첫 진입에서 사이드바 스켈레톤 없이 바로 그릴 수 있게 한다.
 *
 * 계약:
 * - 절대 throw하지 않는다. 실패·미인증은 전부 null이고, 그때 클라이언트가 기존 경로를 탄다.
 * - sb-* 쿠키가 없으면 원격 왕복 0회로 즉시 null이다(로그인 페이지 비용 ≈ 0).
 * - dev 바이패스에서는 null을 돌려 클라이언트가 자기 페르소나(NEXT_PUBLIC_DEV_*)를 쓰게 둔다.
 * - JWT를 decode만 하고 신뢰하지 않는다. 토큰 검증은 verifySupabaseAuthUser()
 *   (getClaims 로컬 검증 + getUser 폴백)가, 레거시 쿠키는 decodeSession()의
 *   HMAC 서명·만료 검사가 담당한다. 미들웨어가 넘긴 헤더를 믿는 경로는 없다.
 */
export async function resolveAdminShellSession(): Promise<AdminShellSession | null> {
  if (isAdminAuthBypassEnabled()) return null

  try {
    const store = (await cookies()) as AdminCookieStore

    const supabaseSession = await getSupabaseShellSession(store)
    if (supabaseSession) return supabaseSession

    return getLegacyShellSession(store)
  } catch {
    // 셸 부트스트랩 실패로 어드민 전체가 렌더 에러가 되면 안 된다 — 조용히 기존 경로로 넘긴다.
    return null
  }
}

async function getSupabaseShellSession(
  store: AdminCookieStore
): Promise<AdminShellSession | null> {
  if (!hasSupabaseBrowserEnv()) return null

  const cacheKey = toSupabaseAuthCookieKey(store.getAll())
  if (!cacheKey) return null

  const cached = adminShellSessionCache.get(cacheKey)
  if (cached && cached.expiresAt > Date.now()) {
    return cached.promise
  }

  if (adminShellSessionCache.size >= ADMIN_SHELL_SESSION_CACHE_MAX) {
    adminShellSessionCache.clear()
  }

  const request = fetchAdminShellSession(store).then(
    (session) => {
      const entry = adminShellSessionCache.get(cacheKey)
      if (entry?.promise === request) {
        if (session) {
          entry.expiresAt = Date.now() + ADMIN_SHELL_SESSION_TTL_MS
        } else {
          adminShellSessionCache.delete(cacheKey)
        }
      }
      return session
    },
    (error) => {
      const entry = adminShellSessionCache.get(cacheKey)
      if (entry?.promise === request) {
        adminShellSessionCache.delete(cacheKey)
      }
      throw error
    }
  )

  // 진행 중 엔트리도 같은 TTL을 달아 둔다(동시 렌더가 같은 왕복을 나눠 쓰도록).
  adminShellSessionCache.set(cacheKey, {
    promise: request,
    expiresAt: Date.now() + ADMIN_SHELL_SESSION_TTL_MS,
  })

  return request
}

async function fetchAdminShellSession(
  store: AdminCookieStore
): Promise<AdminShellSession | null> {
  const { url, publishableKey } = getSupabaseBrowserEnv()
  const supabase = createServerClient<Database>(url, publishableKey, {
    cookies: {
      getAll() {
        return store.getAll()
      },
      // RSC는 쿠키를 쓸 수 없다. 토큰 회전은 프록시(updateSupabaseSession)가 담당한다.
      setAll() {},
    },
  })

  const user = await verifySupabaseAuthUser(supabase.auth)
  if (!user) return null

  // nav_preset/nav_overrides는 20260729 마이그레이션 이후에만 존재한다.
  // 미적용 환경에서 select 하나가 실패해 셸이 통째로 비지 않도록 3컬럼으로 폴백한다
  // (= preset 없음 = 마이그레이션 이전과 동일한 동작). 클라이언트 로직과 같은 규칙이다.
  const extended = await supabase
    .from("admin_profiles")
    .select("display_name, role, status, nav_preset, nav_overrides")
    .eq("user_id", user.id)
    .single()

  const fallback = extended.error
    ? await supabase
        .from("admin_profiles")
        .select("display_name, role, status")
        .eq("user_id", user.id)
        .single()
    : null

  const profile = ((fallback ? fallback.data : extended.data) ??
    null) as AdminShellProfileRow | null

  if (!profile || profile.status !== "ACTIVE") return null

  return {
    role: profile.role,
    name: profile.display_name,
    email: user.email ?? "",
    navPreset: profile.nav_preset ?? null,
    navOverrides: profile.nav_overrides ?? {},
    source: "supabase",
  }
}

function getLegacyShellSession(store: AdminCookieStore): AdminShellSession | null {
  // 레거시 로그인은 프로덕션에서 꺼져 있다(/api/admin/auth GET도 410). 셸도 같은 기준을 쓴다.
  if (!isLegacyAdminAuthEnabled()) return null

  const cookie = store.get("admin_session")?.value
  if (!cookie) return null

  // decodeSession()이 HMAC 서명과 exp를 함께 검증한다 — decode만 하고 믿는 경로가 아니다.
  const session = decodeSession(cookie)
  if (!session) return null

  return {
    role: session.role,
    name: session.name,
    email: "",
    // 레거시 세션은 admin_profiles를 거치지 않아 프리셋 데이터가 없다.
    navPreset: null,
    navOverrides: {},
    branch: session.branch,
    source: "legacy",
  }
}

export async function getVerifiedAdminContext(
  req: NextRequest
): Promise<VerifiedAdminContext | null> {
  if (isAdminAuthBypassEnabled()) {
    return { source: "bypass", role: "SUPER_ADMIN", name: "Dev", capabilities: [] }
  }

  const supabase = await getSupabaseAdminContext(req)
  if (supabase) return supabase

  return getLegacyAdminContext(req)
}

export function hasAdminCapability(
  admin: Pick<VerifiedAdminContext, "role" | "capabilities">,
  capability: string
) {
  return normalizeAdminApiRole(admin.role) === "SUPER_ADMIN" || admin.capabilities?.includes(capability) === true
}

export function requireAdminCapability(
  admin: Pick<VerifiedAdminContext, "role" | "capabilities">,
  capability: string
): NextResponse | undefined {
  if (hasAdminCapability(admin, capability)) return undefined
  return NextResponse.json(
    { error: "Forbidden", requiredCapability: capability },
    { status: 403 }
  )
}

export function toAdminActorSnapshot(
  admin: Pick<VerifiedAdminContext, "userId" | "name" | "role">
): AdminActorSnapshot {
  return {
    actor_user_id: admin.userId ?? null,
    actor_display_name: admin.name?.trim() || "Unknown admin",
    actor_role: normalizeAdminApiRole(admin.role) ?? admin.role.trim().toUpperCase(),
  }
}

export async function verifyAdmin(
  req: NextRequest,
  allowedRoles?: readonly AdminApiRole[]
): Promise<NextResponse | undefined> {
  const originError = verifySameOriginRequest(req)
  if (originError) return originError

  const admin = await getVerifiedAdminContext(req)
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const effectiveRoles = allowedRoles ?? defaultAdminApiRolesForMethod(req.method)
  if (!hasAdminApiRole(admin.role, effectiveRoles)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  return undefined
}

export async function requireVerifiedAdminContext(
  req: NextRequest,
  allowedRoles?: readonly AdminApiRole[]
): Promise<VerifiedAdminContext | NextResponse> {
  const originError = verifySameOriginRequest(req)
  if (originError) return originError

  const admin = await getVerifiedAdminContext(req)
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const effectiveRoles = allowedRoles ?? defaultAdminApiRolesForMethod(req.method)
  if (!hasAdminApiRole(admin.role, effectiveRoles)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  return admin
}
