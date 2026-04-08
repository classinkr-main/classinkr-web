import { createServerClient } from "@supabase/ssr"
import { createHmac } from "crypto"
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
  return (
    process.env.SESSION_SECRET?.trim() ??
    process.env.ADMIN_PASSWORD?.trim() ??
    null
  )
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
}

export interface VerifiedAdminContext {
  source: "bypass" | "legacy" | "supabase"
  role: string
  name?: string
  branch?: string
  userId?: string
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
  const { users, code } = getAllUsers()
  if (code) return { session: null, code }

  const user = users.find((candidate) => candidate.password === password)
  if (!user) {
    return { session: null, code: ADMIN_AUTH_ERROR_CODE.INVALID_CREDENTIALS }
  }

  return {
    session: { name: user.name, role: user.role, branch: user.branch },
  }
}

export function encodeSession(session: AdminSession): string {
  const payload = Buffer.from(JSON.stringify(session)).toString("base64url")
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
    if (!expectedSig || sig !== expectedSig) return null

    return JSON.parse(
      Buffer.from(payload, "base64url").toString("utf8")
    ) as AdminSession
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
  req: NextRequest
): Promise<NextResponse | undefined> {
  const admin = await getVerifiedAdminContext(req)
  if (admin) return undefined

  return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
}
