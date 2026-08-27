import { createServerClient } from "@supabase/ssr"
import { createHmac, timingSafeEqual } from "crypto"
import { NextRequest, NextResponse } from "next/server"

import {
  ADMIN_AUTH_ERROR_CODE,
  type AdminAuthErrorCode,
} from "@/lib/admin-auth-errors"
import type { AdminCapability } from "@/lib/admin-capabilities"
import { isAdminAuthBypassEnabled } from "@/lib/admin-env"
import type { AdminProfile, Database } from "@/lib/supabase/database.types"
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

// Supabase 관리자 컨텍스트는 요청마다 auth + admin_profiles 왕복이 필요하므로
// 동일 세션 쿠키에 대해 짧게 캐시한다. (권한 회수 반영 지연 최대 60초)
const SUPABASE_ADMIN_CONTEXT_TTL_MS = 60_000
const SUPABASE_ADMIN_CONTEXT_CACHE_MAX = 200
// 콜드 스타트에서 한 화면이 여러 어드민 API를 동시에 때리므로 완료된 결과뿐 아니라
// 진행 중 요청도 같은 키로 공유한다.
type SupabaseAdminContextEntry = {
  promise: Promise<VerifiedAdminContext | null>
  expiresAt: number
}
const supabaseAdminContextCache = new Map<string, SupabaseAdminContextEntry>()

function getSupabaseAuthCookieKey(req: NextRequest): string | null {
  const authCookies = req.cookies
    .getAll()
    .filter(({ name }) => name.startsWith("sb-"))
  if (authCookies.length === 0) return null

  return authCookies
    .map(({ name, value }) => `${name}=${value}`)
    .sort()
    .join(";")
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

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser()
  if (userError || !user) return null

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
