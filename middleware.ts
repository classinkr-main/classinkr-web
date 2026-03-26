import { NextRequest, NextResponse } from "next/server"
import { updateSupabaseSession } from "@/lib/supabase/middleware"
import { createServerClient } from "@supabase/ssr"
import { getSupabaseBrowserEnv, hasSupabaseBrowserEnv } from "@/lib/supabase/public-env"

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl

  // Supabase 세션 쿠키 갱신 (항상 먼저)
  const response = await updateSupabaseSession(req)

  // /admin 경로가 아니면 통과
  if (!pathname.startsWith("/admin")) return response
  // 로그인 페이지는 통과
  if (pathname === "/admin/login") return response

  // Supabase 세션 확인
  if (!hasSupabaseBrowserEnv()) {
    // Supabase 미설정 시 레거시 쿠키로 fallback
    const session = req.cookies.get("admin_session")
    if (!session?.value) {
      return NextResponse.redirect(new URL("/admin/login", req.url))
    }
    return response
  }

  const { url, publishableKey } = getSupabaseBrowserEnv()
  const supabase = createServerClient(url, publishableKey, {
    cookies: {
      getAll() { return req.cookies.getAll() },
      setAll() {},
    },
  })

  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.redirect(new URL("/admin/login", req.url))
  }

  return response
}

export const config = {
  matcher: ["/admin/:path*"],
}
