import { NextRequest, NextResponse } from "next/server"
import { authenticateUser, encodeSession } from "@/lib/admin-auth"

export async function POST(req: NextRequest) {
  try {
    const { password } = await req.json()
    const session = authenticateUser(password)

    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const res = NextResponse.json({ ok: true, role: session.role, name: session.name, branch: session.branch })
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
