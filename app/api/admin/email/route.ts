import { NextRequest } from "next/server"
import { verifyAdmin } from "@/lib/admin-auth"
import { adminCachedJson } from "@/lib/admin-api-response"
import { getCachedAllCampaigns } from "@/lib/repositories/marketing"

export async function GET(req: NextRequest) {
  const authError = await verifyAdmin(req)
  if (authError) return authError

  const campaigns = await getCachedAllCampaigns()

  return adminCachedJson({ campaigns })
}
