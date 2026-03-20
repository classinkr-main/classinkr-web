import { NextRequest, NextResponse } from "next/server"

export function verifyAdmin(req: NextRequest): NextResponse | null {
  const token = req.headers.get("authorization")?.replace("Bearer ", "")
  if (!token || token !== process.env.ADMIN_PASSWORD) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  return null
}
