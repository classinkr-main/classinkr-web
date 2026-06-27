import { NextRequest, NextResponse } from "next/server"

import { verifyAdmin } from "@/lib/admin-auth"
import { listAdminUserDirectory } from "@/lib/repositories/admin-users"

export async function GET(req: NextRequest) {
  const err = await verifyAdmin(req)
  if (err) return err

  try {
    const directory = await listAdminUserDirectory()
    return NextResponse.json(directory)
  } catch (error) {
    console.error("[GET /api/admin/users]", error)
    return NextResponse.json({ error: "Failed to load admin users" }, { status: 500 })
  }
}
