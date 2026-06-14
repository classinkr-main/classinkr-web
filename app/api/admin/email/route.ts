import { NextRequest } from "next/server"
import { verifyAdmin } from "@/lib/admin-auth"
import { adminCachedJson } from "@/lib/admin-api-response"
import { getAllCampaigns } from "@/lib/repositories/marketing"

export async function GET(req: NextRequest) {
  const authError = await verifyAdmin(req)
  if (authError) return authError

  const campaigns = await getAllCampaigns()

  return adminCachedJson({ campaigns })
}
