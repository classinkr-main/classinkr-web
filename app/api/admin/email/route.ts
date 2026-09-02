import { NextRequest } from "next/server"
import { verifyAdmin } from "@/lib/admin-auth"
import { adminCachedJson } from "@/lib/admin-api-response"
import { getCachedAllCampaigns, type CampaignScope } from "@/lib/repositories/marketing"

export async function GET(req: NextRequest) {
  const authError = await verifyAdmin(req)
  if (authError) return authError

  // ?scope=summary — overview처럼 본문(body)을 안 읽는 소비처용(T5-B). 미전달·기타 값이면 기존 전체 응답.
  // 두 스코프 모두 60초 unstable_cache 경로(getCachedAllCampaigns) — 인자별로 캐시 엔트리가 갈린다.
  const scope: CampaignScope = req.nextUrl.searchParams.get("scope") === "summary" ? "summary" : "full"
  const campaigns = await getCachedAllCampaigns(scope)

  return adminCachedJson({ campaigns })
}
