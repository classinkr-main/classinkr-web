import "server-only"

import { unstable_cache } from "next/cache"
import { buildOverviewLeadSummary } from "@/lib/admin/overview/lead-summary"
import {
  ADMIN_LEADS_OVERVIEW_CACHE_TAG,
  getDashboardLeads,
} from "@/lib/repositories/leads"

// 이 집계는 요청자별 필드를 포함하지 않고 서비스 롤 데이터만 읽는다. 사용자마다 전체 리드를
// 다시 내려받는 대신 짧게 공유하고, 저장·수정·삭제 성공 시 repository가 태그를 즉시 만료한다.
export const getCachedOverviewLeadSummary = unstable_cache(
  async () => buildOverviewLeadSummary(await getDashboardLeads()),
  ["admin-leads-overview-v1"],
  {
    revalidate: 30,
    tags: [ADMIN_LEADS_OVERVIEW_CACHE_TAG],
  }
)
