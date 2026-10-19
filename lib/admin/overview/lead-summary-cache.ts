import "server-only"

import { unstable_cache } from "next/cache"
import { buildOverviewLeadSummary } from "@/lib/admin/overview/lead-summary"
import {
  ADMIN_LEADS_OVERVIEW_CACHE_TAG,
  getDashboardLeads,
} from "@/lib/repositories/leads"

// 담당자 키를 캐시 인자로 포함해 계정별 집계가 섞이지 않게 한다. 변경 시 태그를 만료한다.
export const getCachedOverviewLeadSummary = unstable_cache(
  async (ownerKeys?: readonly string[]) => buildOverviewLeadSummary(await getDashboardLeads(ownerKeys)),
  ["admin-leads-overview-v2"],
  {
    revalidate: 30,
    tags: [ADMIN_LEADS_OVERVIEW_CACHE_TAG],
  }
)
