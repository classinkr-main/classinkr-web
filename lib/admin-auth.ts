import { NextRequest, NextResponse } from "next/server"
import { createHmac } from "crypto"
import { ADMIN_AUTH_ERROR_CODE, type AdminAuthErrorCode } from "@/lib/admin-auth-errors"

function getSessionSecret(): string {
  return process.env.SESSION_SECRET ?? process.env.ADMIN_PASSWORD ?? "fallback-dev-secret"
}

function signPayload(payload: string): string {
  return createHmac("sha256", getSessionSecret()).update(payload).digest("hex")
}

export type AdminRole = "admin" | "branch"

export interface AdminSession {
  name: string
  role: AdminRole
  branch?: string
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

  return { session: { name: user.name, role: user.role, branch: user.branch } }
}

export function encodeSession(session: AdminSession): string {
  const payload = Buffer.from(JSON.stringify(session)).toString("base64url")
  const sig = signPayload(payload)
  return `${payload}.${sig}`
}

export function decodeSession(cookie: string): AdminSession | null {
  try {
    const dotIdx = cookie.lastIndexOf(".")
    if (dotIdx === -1) {
      // 레거시 서명 없는 쿠키 — 거부
      return null
    }
    const payload = cookie.slice(0, dotIdx)
    const sig = cookie.slice(dotIdx + 1)
    // 서명 검증
    if (sig !== signPayload(payload)) return null
    return JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as AdminSession
  } catch {
    return null
  }
}

export function verifyAdmin(req: NextRequest): NextResponse | null {
  // dev 환경 자동 스킵 (NEXT_PUBLIC_SKIP_ADMIN_AUTH=true in .env.local)
  if (process.env.NEXT_PUBLIC_SKIP_ADMIN_AUTH === "true") return null

  const cookie = req.cookies.get("admin_session")?.value
  if (cookie) {
    const session = decodeSession(cookie)
    if (session?.role === "admin") return null
  }

  const token = req.headers.get("authorization")?.replace("Bearer ", "")
  if (token && token === process.env.ADMIN_PASSWORD) return null

  return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
}
