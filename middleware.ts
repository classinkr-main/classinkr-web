import { NextRequest, NextResponse } from "next/server"
import { updateSupabaseSession } from "@/lib/supabase/middleware"

export async function middleware(request: NextRequest) {
  return updateSupabaseSession(request)
}

export const config = {
  matcher: [
    // 정적 파일 및 Next.js internals 제외
    "/((?!_next/static|_next/image|favicon.ico|images/|icons/|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
}
