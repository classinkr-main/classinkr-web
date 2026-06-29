import { NextResponse, type NextRequest } from "next/server"

import { getPublicUserContext } from "@/lib/auth/public-user"
import { signOutPublicSession } from "@/lib/auth/session-logout"

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

export async function DELETE(req: NextRequest) {
  return signOutPublicSession(req)
}
