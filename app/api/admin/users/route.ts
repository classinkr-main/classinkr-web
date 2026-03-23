import { NextRequest, NextResponse } from "next/server"
import { verifyAdmin } from "@/lib/admin-auth"

export async function GET(req: NextRequest) {
  const err = verifyAdmin(req)
  if (err) return err

  try {
    const raw = process.env.ADMIN_USERS
    if (raw) {
      const users = (JSON.parse(raw) as Array<{ name: string; password: string; role: string; branch?: string }>).map(
        ({ name, role, branch }) => ({ name, role, branch })
      )
      return NextResponse.json({ users })
    }
  } catch {
    // 파싱 실패
  }

  return NextResponse.json({
    users: [{ name: "Admin", role: "admin", branch: undefined }],
  })
}
