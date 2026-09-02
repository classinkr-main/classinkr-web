import { NextRequest } from "next/server"
import { verifyAdmin } from "@/lib/admin-auth"
import { adminCachedJson } from "@/lib/admin-api-response"
import { getAllCampaigns } from "@/lib/repositories/marketing"

export async function GET(req: NextRequest) {
  const authError = await verifyAdmin(req)
  if (authError) return authError

  // ?scope=summary — overview처럼 본문(body)을 안 읽는 소비처용. 미전달이면 기존 전체 응답.
  const scope = req.nextUrl.searchParams.get("scope") === "summary" ? "summary" : "full"
  const campaigns = await getAllCampaigns(200, 0, scope)

  return adminCachedJson({ campaigns })
}
