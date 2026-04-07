import { NextRequest, NextResponse } from "next/server"

import { getVerifiedAdminContext } from "@/lib/admin-auth"
import { isAdminAuthBypassEnabled } from "@/lib/admin-env"
import { updateSupabaseSession } from "@/lib/supabase/middleware"

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl

  const response = await updateSupabaseSession(req)

  if (!pathname.startsWith("/admin")) return response
  if (pathname === "/admin/login") return response
  if (isAdminAuthBypassEnabled()) return response

  const admin = await getVerifiedAdminContext(req)
  if (!admin) {
    return NextResponse.redirect(new URL("/admin/login", req.url))
  }

  return response
}

export const config = {
  matcher: ["/admin/:path*"],
}
