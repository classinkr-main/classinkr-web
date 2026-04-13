import { NextRequest, NextResponse } from "next/server"

import { getVerifiedAdminContext } from "@/lib/admin-auth"
import { isAdminAuthBypassEnabled } from "@/lib/admin-env"
import { updateSupabaseSession } from "@/lib/supabase/middleware"

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl

  // Supabase 세션 갱신 (전체 라우트)
  let response: NextResponse
  try {
    response = await updateSupabaseSession(req)
  } catch {
    response = NextResponse.next({ request: req })
  }

  // 어드민 인증 가드
  if (
    pathname.startsWith("/admin") &&
    pathname !== "/admin/login" &&
    !isAdminAuthBypassEnabled()
  ) {
    const admin = await getVerifiedAdminContext(req)
    if (!admin) {
      return NextResponse.redirect(new URL("/admin/login", req.url))
    }
  }

  return response
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|_next/webpack-hmr|favicon.ico|images/|icons/|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|css|js)$).*)",
  ],
}
