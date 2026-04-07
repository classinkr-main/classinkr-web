import { NextRequest, NextResponse } from "next/server"
import { authenticateUser, decodeSession, encodeSession } from "@/lib/admin-auth"
import { ADMIN_AUTH_ERROR_CODE } from "@/lib/admin-auth-errors"
import { createSupabaseServerClient } from "@/lib/supabase/server"
import { hasSupabaseBrowserEnv } from "@/lib/supabase/public-env"

export async function GET(req: NextRequest) {
  const cookie = req.cookies.get("admin_session")?.value
  const session = cookie ? decodeSession(cookie) : null

  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  return NextResponse.json({ ok: true, ...session })
}

// POST — 레거시 관리자 비밀번호 로그인
export async function POST(req: NextRequest) {
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

  const res = NextResponse.json({ ok: true, ...session })
  res.cookies.set("admin_session", encodeSession(session), {
    httpOnly: true,
    maxAge: 60 * 60 * 24 * 7,
    path: "/",
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  })
  return res
}

// DELETE — 로그아웃
export async function DELETE() {
  if (hasSupabaseBrowserEnv()) {
    try {
      const supabase = await createSupabaseServerClient()
      await supabase.auth.signOut()
    } catch (error) {
      console.error("[DELETE /api/admin/auth] Supabase signOut error:", error)
    }
  }

  const res = NextResponse.json({ ok: true })
  // 레거시 쿠키도 함께 제거
  res.cookies.set("admin_session", "", { maxAge: 0, path: "/" })
  return res
}
