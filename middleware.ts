import { NextRequest, NextResponse } from "next/server"
import { updateSupabaseSession } from "@/lib/supabase/middleware"

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl
  const response = await updateSupabaseSession(req)

  if (!pathname.startsWith("/admin")) return response
  if (pathname === "/admin/login") return response
  if (pathname.startsWith("/api/admin/auth")) return response

  const session = req.cookies.get("admin_session")
  if (!session?.value) {
    return NextResponse.redirect(new URL("/admin/login", req.url))
  }

  return response
}

export const config = {
  matcher: ["/admin/:path*"],
}
