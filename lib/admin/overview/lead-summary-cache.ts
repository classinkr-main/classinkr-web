import "server-only"

import { unstable_cache } from "next/cache"
import { buildOverviewLeadSummary } from "@/lib/admin/overview/lead-summary"
import {
  ADMIN_LEADS_OVERVIEW_CACHE_TAG,
  getDashboardLeads,
} from "@/lib/repositories/leads"

// 담당자 키를 캐시 인자로 포함해 계정별 집계가 섞이지 않게 한다. 변경 시 태그를 만료한다.
// 전량을 한 번 읽어 담당 범위와 전사(company)를 같은 스냅샷에서 함께 집계한다 — 응답 모양이
// 바뀌었으므로 캐시 키 버전을 올린다(v2 응답에는 company가 없다).
export const getCachedOverviewLeadSummary = unstable_cache(
  async (ownerKeys?: readonly string[]) => buildOverviewLeadSummary(await getDashboardLeads(), new Date(), ownerKeys),
  ["admin-leads-overview-v3"],
  {
    revalidate: 30,
    tags: [ADMIN_LEADS_OVERVIEW_CACHE_TAG],
  }
)
