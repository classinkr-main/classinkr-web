import { NextRequest, NextResponse } from "next/server"
import { updateSupabaseSession } from "@/lib/supabase/middleware"
import { createServerClient } from "@supabase/ssr"
import { getSupabaseBrowserEnv, hasSupabaseBrowserEnv } from "@/lib/supabase/public-env"

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl

  // Supabase 세션 쿠키 갱신 (항상 먼저)
  const response = await updateSupabaseSession(req)

  // ── /admin 보호 ───────────────────────────────────────
  if (pathname.startsWith("/admin") && pathname !== "/admin/login") {
    if (!hasSupabaseBrowserEnv()) {
      // Supabase 미설정 → 레거시 쿠키 fallback
      const session = req.cookies.get("admin_session")
      if (!session?.value) {
        return NextResponse.redirect(new URL("/admin/login", req.url))
      }
      return response
    }

    const user = await getSupabaseUser(req)
    if (!user) {
      return NextResponse.redirect(new URL("/admin/login", req.url))
    }
    return response
  }

  // ── /partner 보호 ─────────────────────────────────────
  if (pathname.startsWith("/partner")) {
    const publicPartnerPaths = ["/partner/login", "/partner/sign"]
    const isPublic = publicPartnerPaths.some((p) => pathname.startsWith(p))
    if (isPublic) return response

    if (!hasSupabaseBrowserEnv()) {
      return NextResponse.redirect(new URL("/partner/login", req.url))
    }

    const user = await getSupabaseUser(req)
    if (!user) {
      return NextResponse.redirect(new URL("/partner/login", req.url))
    }
    return response
  }

  return response
}

async function getSupabaseUser(req: NextRequest) {
  const { url, publishableKey } = getSupabaseBrowserEnv()
  const supabase = createServerClient(url, publishableKey, {
    cookies: {
      getAll() { return req.cookies.getAll() },
      setAll() {},
    },
  })
  const { data: { user } } = await supabase.auth.getUser()
  return user
}

export const config = {
  matcher: ["/admin/:path*", "/partner/:path*"],
}
