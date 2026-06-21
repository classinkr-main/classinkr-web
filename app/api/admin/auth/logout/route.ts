import type { NextRequest } from "next/server"

import { verifySameOriginRequest } from "@/lib/admin-auth"
import { signOutAdminSession } from "@/lib/admin-auth-logout"

export async function POST(req: NextRequest) {
  const originError = verifySameOriginRequest(req)
  if (originError) return originError

  return signOutAdminSession("POST /api/admin/auth/logout")
}
