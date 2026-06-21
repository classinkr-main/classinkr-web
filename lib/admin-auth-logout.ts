import { NextResponse } from "next/server"

import { createSupabaseServerClient } from "@/lib/supabase/server"
import { hasSupabaseBrowserEnv } from "@/lib/supabase/public-env"

export async function signOutAdminSession(logContext: string) {
  if (hasSupabaseBrowserEnv()) {
    try {
      const supabase = await createSupabaseServerClient()
      await supabase.auth.signOut()
    } catch (error) {
      console.error(`[${logContext}] Supabase signOut error:`, error)
    }
  }

  const res = NextResponse.json({ ok: true })
  res.cookies.set("admin_session", "", { maxAge: 0, path: "/" })
  return res
}
