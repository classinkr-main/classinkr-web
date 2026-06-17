import { NextResponse } from "next/server"

import { getPublicUserContext } from "@/lib/auth/public-user"
import { createSupabaseServerClient } from "@/lib/supabase/server"

export async function GET() {
  const context = await getPublicUserContext()
  if (!context) {
    return NextResponse.json({ user: null })
  }

  return NextResponse.json({
    user: {
      id: context.user.id,
      email: context.user.email ?? null,
      name: context.profile.name,
      provider: context.profile.provider,
      leadId: context.profile.lead_id,
    },
  })
}

export async function DELETE() {
  const supabase = await createSupabaseServerClient()
  await supabase.auth.signOut()
  return NextResponse.json({ ok: true })
}
