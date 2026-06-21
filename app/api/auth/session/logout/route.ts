import { signOutPublicSession } from "@/lib/auth/session-logout"

export async function POST() {
  return signOutPublicSession()
}
