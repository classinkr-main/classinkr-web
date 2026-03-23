import { NextRequest, NextResponse } from "next/server"

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl

  if (!pathname.startsWith("/admin")) return NextResponse.next()
  if (pathname === "/admin/login") return NextResponse.next()
  if (pathname.startsWith("/api/admin/auth")) return NextResponse.next()

  const session = req.cookies.get("admin_session")
  if (!session?.value) {
    return NextResponse.redirect(new URL("/admin/login", req.url))
  }

  return NextResponse.next()
}

export const config = {
  matcher: ["/admin/:path*"],
}
