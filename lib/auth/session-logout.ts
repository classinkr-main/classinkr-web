import { NextResponse, type NextRequest } from "next/server"

import { verifySameOriginRequest } from "@/lib/admin-auth"
import { createSupabaseServerClient } from "@/lib/supabase/server"

export async function signOutPublicSession(req: NextRequest) {
  // 로그아웃 CSRF(강제 로그아웃 DoS) 차단: signOut 전에 same-origin 검증.
  const originError = verifySameOriginRequest(req)
  if (originError) return originError

  const supabase = await createSupabaseServerClient()
  await supabase.auth.signOut()
  return NextResponse.json({ ok: true })
}
