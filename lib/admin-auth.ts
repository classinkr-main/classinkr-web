import { createServerClient } from "@supabase/ssr"
import { createHmac, timingSafeEqual } from "crypto"
import { NextRequest, NextResponse } from "next/server"

import {
  ADMIN_AUTH_ERROR_CODE,
  type AdminAuthErrorCode,
} from "@/lib/admin-auth-errors"
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
}

export type AdminApiRole =
  | "SUPER_ADMIN"
  | "ADMIN"
  | "EDITOR"
  | "VIEWER"
  | "PARTNER"
  | "BRANCH"

const DEFAULT_ADMIN_API_ROLES: readonly AdminApiRole[] = ["SUPER_ADMIN", "ADMIN"]

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
  allowedRoles: readonly AdminApiRole[] = DEFAULT_ADMIN_API_ROLES
) {
  const normalized = normalizeAdminApiRole(role)
  return normalized != null && allowedRoles.includes(normalized)
}

function isUnsafeMethod(method: string) {
  return !["GET", "HEAD", "OPTIONS"].includes(method.toUpperCase())
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
  const cookie = req.cookies.get("admin_session")?.value
  if (!cookie) return null

  const session = decodeSession(cookie)
  if (session?.role !== "admin") return null

  return {
    source: "legacy",
    role: session.role,
    name: session.name,
    branch: session.branch,
  }
}

async function getSupabaseAdminContext(
  req: NextRequest
): Promise<VerifiedAdminContext | null> {
  if (!hasSupabaseBrowserEnv()) return null

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
    .select("user_id, display_name, role, status")
    .eq("user_id", user.id)
    .single()

  if (profileError || !profile) return null

  const adminProfile = profile as Pick<
    AdminProfile,
    "user_id" | "display_name" | "role" | "status"
  >
  if (adminProfile.status !== "ACTIVE") return null

  return {
    source: "supabase",
    role: adminProfile.role,
    name: adminProfile.display_name,
    userId: adminProfile.user_id,
  }
}

export async function getVerifiedAdminContext(
  req: NextRequest
): Promise<VerifiedAdminContext | null> {
  if (isAdminAuthBypassEnabled()) {
    return { source: "bypass", role: "SUPER_ADMIN", name: "Dev" }
  }

  const legacy = getLegacyAdminContext(req)
  if (legacy) return legacy

  return getSupabaseAdminContext(req)
}

export async function verifyAdmin(
  req: NextRequest,
  allowedRoles: readonly AdminApiRole[] = DEFAULT_ADMIN_API_ROLES
): Promise<NextResponse | undefined> {
  const originError = verifySameOriginRequest(req)
  if (originError) return originError

  const admin = await getVerifiedAdminContext(req)
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  if (!hasAdminApiRole(admin.role, allowedRoles)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  return undefined
}

export async function requireVerifiedAdminContext(
  req: NextRequest,
  allowedRoles: readonly AdminApiRole[] = DEFAULT_ADMIN_API_ROLES
): Promise<VerifiedAdminContext | NextResponse> {
  const originError = verifySameOriginRequest(req)
  if (originError) return originError

  const admin = await getVerifiedAdminContext(req)
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  if (!hasAdminApiRole(admin.role, allowedRoles)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  return admin
}
