import { NextRequest, NextResponse } from "next/server"
import {
  authenticateUser,
  decodeSession,
  encodeSession,
  verifySameOriginRequest,
} from "@/lib/admin-auth"
import { signOutAdminSession } from "@/lib/admin-auth-logout"
import { ADMIN_AUTH_ERROR_CODE } from "@/lib/admin-auth-errors"
import { checkRateLimit, getClientIp } from "@/lib/server/rate-limit"

export async function GET(req: NextRequest) {
  const cookie = req.cookies.get("admin_session")?.value
  const session = cookie ? decodeSession(cookie) : null

  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  return NextResponse.json({
    ok: true,
    name: session.name,
    role: session.role,
    branch: session.branch,
  })
}

// POST — 레거시 관리자 비밀번호 로그인
export async function POST(req: NextRequest) {
  const ip = getClientIp(req)
  const { allowed } = checkRateLimit(ip, "admin-auth", {
    windowMs: 5 * 60_000,
    max: 10,
  })

  if (!allowed) {
    return NextResponse.json({ error: "Too many requests." }, { status: 429 })
  }

  const body = await req.json().catch(() => null)
  const password = typeof body?.password === "string" ? body.password : ""
  const { session, code } = authenticateUser(password)

  if (!session) {
    const status =
      code === ADMIN_AUTH_ERROR_CODE.INVALID_CREDENTIALS ? 401 : 500

    return NextResponse.json(
      { error: "Unauthorized", code },
      { status }
    )
  }

  const res = NextResponse.json({
    ok: true,
    name: session.name,
    role: session.role,
    branch: session.branch,
  })
  res.cookies.set("admin_session", encodeSession(session), {
    httpOnly: true,
    maxAge: 60 * 60 * 24 * 7,
    path: "/",
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production",
  })
  return res
}

// DELETE — 레거시 로그아웃 호환용. 신규 호출은 POST /api/admin/auth/logout 사용.
export async function DELETE(req: NextRequest) {
  const originError = verifySameOriginRequest(req)
  if (originError) return originError

  return signOutAdminSession("DELETE /api/admin/auth")
}
