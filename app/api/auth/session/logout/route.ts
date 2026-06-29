import { type NextRequest } from "next/server"

import { signOutPublicSession } from "@/lib/auth/session-logout"

export async function POST(req: NextRequest) {
  return signOutPublicSession(req)
}
