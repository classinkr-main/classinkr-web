import { NextRequest, NextResponse } from "next/server"

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

function getAllUsers(): UserRecord[] {
  try {
    const raw = process.env.ADMIN_USERS
    if (raw) return JSON.parse(raw) as UserRecord[]
  } catch {
    // 파싱 실패 시 무시
  }
  const legacy = process.env.ADMIN_PASSWORD
  if (legacy) return [{ name: "Admin", password: legacy, role: "admin" }]
  return []
}

export function authenticateUser(password: string): AdminSession | null {
  const users = getAllUsers()
  const user = users.find((u) => u.password === password)
  if (!user) return null
  return { name: user.name, role: user.role, branch: user.branch }
}

export function encodeSession(session: AdminSession): string {
  return Buffer.from(JSON.stringify(session)).toString("base64")
}

export function decodeSession(cookie: string): AdminSession | null {
  try {
    return JSON.parse(Buffer.from(cookie, "base64").toString("utf8")) as AdminSession
  } catch {
    return null
  }
}

export function verifyAdmin(req: NextRequest): NextResponse | null {
  const cookie = req.cookies.get("admin_session")?.value
  if (cookie) {
    const session = decodeSession(cookie)
    if (session?.role === "admin") return null
  }

  const token = req.headers.get("authorization")?.replace("Bearer ", "")
  if (token && token === process.env.ADMIN_PASSWORD) return null

  return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
}
