import CampaignsHubClient from "@/components/admin/campaigns/CampaignsHubClient"
import { prefetchMarketingGlanceInitialData } from "@/lib/admin/marketing/glance-prefetch"
import { EMPTY_MARKETING_GLANCE_INITIAL_DATA } from "@/lib/marketing/glance-initial-data"
import { resolveCampaignTab } from "@/lib/marketing/hub-tabs"
import { isPerfPeriodKey, type PerfPeriodKey } from "@/lib/marketing/perf"

// 마케팅 허브(/admin/campaigns) — 서버 컴포넌트 껍데기.
//
// 화면 본체는 CampaignsHubClient 가 소유하고, 이 파일은 기본 탭(한눈에)의 첫 화면 데이터를
// 서버에서 미리 만들어 내려주는 일만 한다(Overview·CRM 홈과 같은 패턴, 2026-09-14).
// 한눈에 층은 마운트 뒤 fetch 3개(perf·insights·intake)를 기다려 스켈레톤을 보였다 — 그 셋을
// HTML 과 함께 보낸다. 프리페치가 비면(미인증·역할 부족·예산 초과·실패) 화면은 지금까지처럼
// 클라이언트 페치로 떨어진다. 다른 탭으로 들어오면 프리페치하지 않는다(안 여는 층을 데우면
// 첫 HTML 만 늦어진다).
//
// 프리페치가 요청 쿠키로 어드민을 검증하므로 정적 프리렌더 대상이 아니다.
export const dynamic = "force-dynamic"

type SearchParams = Record<string, string | string[] | undefined>

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value
}

export default async function AdminCampaignsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams
  const { tab } = resolveCampaignTab(first(params.tab))
  const rawPerf = first(params.perf)
  const period: PerfPeriodKey = isPerfPeriodKey(rawPerf) ? rawPerf : "30d"

  const initialData =
    tab === "summary" ? await prefetchMarketingGlanceInitialData(period) : EMPTY_MARKETING_GLANCE_INITIAL_DATA

  return <CampaignsHubClient initialData={initialData} />
}
