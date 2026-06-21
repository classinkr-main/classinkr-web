import { NextResponse } from "next/server"

import { createSupabaseServerClient } from "@/lib/supabase/server"

export async function signOutPublicSession() {
  const supabase = await createSupabaseServerClient()
  await supabase.auth.signOut()
  return NextResponse.json({ ok: true })
}
