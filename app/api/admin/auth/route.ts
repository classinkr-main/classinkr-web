import { NextRequest, NextResponse } from "next/server"
import { authenticateUser, encodeSession } from "@/lib/admin-auth"
import { ADMIN_AUTH_ERROR_CODE } from "@/lib/admin-auth-errors"

export async function POST(req: NextRequest) {
  try {
    const { password } = await req.json()
    if (typeof password !== "string") {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 })
    }

    const { session, code } = authenticateUser(password)

    if (!session) {
      if (code === ADMIN_AUTH_ERROR_CODE.NOT_CONFIGURED) {
        console.error("[admin-auth] Missing ADMIN_PASSWORD or ADMIN_USERS environment variables.")
        return NextResponse.json({ error: "Admin auth is not configured", code }, { status: 503 })
      }

      if (code === ADMIN_AUTH_ERROR_CODE.INVALID_CONFIG) {
        console.error("[admin-auth] Invalid ADMIN_USERS or ADMIN_PASSWORD configuration.")
        return NextResponse.json({ error: "Admin auth config is invalid", code }, { status: 500 })
      }

      return NextResponse.json({ error: "Unauthorized", code }, { status: 401 })
    }

    const res = NextResponse.json({
      ok: true,
      role: session.role,
      name: session.name,
      branch: session.branch,
    })

    res.cookies.set("admin_session", encodeSession(session), {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 7,
    })

    return res
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 })
  }
}

export async function DELETE() {
  const res = NextResponse.json({ ok: true })
  res.cookies.set("admin_session", "", { maxAge: 0, path: "/" })
  return res
}
