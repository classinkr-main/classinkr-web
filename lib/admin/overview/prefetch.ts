import "server-only"

import {
  BRANCH_READ_ADMIN_API_ROLES,
  CRM_STAFF_ADMIN_API_ROLES,
  hasAdminApiRole,
} from "@/lib/admin-auth"
import { getVerifiedAdminContextForPage } from "@/lib/admin/page-auth"
import { openPrefetchLane, type DeferredPrefetch } from "@/lib/admin/prefetch-budget"
import { getAdminVisitorStats, type VisitorStatsPayload } from "@/lib/admin-visitor-stats"
import type { OverviewLeadSummary } from "@/lib/admin/overview/lead-summary"
import { getCachedOverviewLeadSummary } from "@/lib/admin/overview/lead-summary-cache"
import { getCachedOsSummary, type OsSummary } from "@/lib/admin/overview/os-summary"
import { getLeadActionStats } from "@/lib/repositories/leads"
// 아래 두 임포트는 장부·챗봇 팀 소유 lib를 라우트와 동일하게 "그대로 호출"만 한다(그 파일들은
// 수정하지 않는다 — 이 파일이 CRM repo를 호출하는 것과 같은 관례).
import { buildBranchSummaryPayload } from "@/lib/branch/summary-payload"
import { resolvePeriodDate } from "@/lib/branch/fiscal"
import { getChatbotStats } from "@/lib/chatbot/service"

/**
 * Overview 첫 화면(스크롤 없이 보이는 인바운드·운영 OS·흐름 지표)을 그리는 데 필요한
 * 무거운 소스를 서버에서 미리 집계한다. 각 항목은 대응 API 라우트가 부르는 것과 **같은**
 * lib 함수를 직접 호출한다(HTTP 자기호출 없음):
 *  - leadOverview   ← /api/admin/leads?scope=overview                    (getCachedOverviewLeadSummary)
 *  - visitorStats   ← /api/admin/visitor-stats?range=7                   (getAdminVisitorStats)
 *  - leadActionKpis ← /api/admin/crm/action-kpis                         (getLeadActionStats)
 *  - osSummary      ← /api/admin/os-summary                              (getCachedOsSummary)
 *  - branchSummary  ← /api/admin/branch/summary?team=ALL&period=Y        (buildBranchSummaryPayload)
 *  - chatbotStats   ← /api/admin/chatbot/stats?from=<오늘-6일>            (getChatbotStats)
 *
 * 보안: 이 저장소에는 middleware가 없고 app/admin/layout.tsx의 가드는 보안 경계가 아니다.
 * 실제 차단은 각 라우트의 verifyAdmin/requireVerifiedAdminContext이므로, 프리페치도
 * 같은 검증(getVerifiedAdminContextForPage)과 **같은 역할 목록**을 통과해야만 값을 만든다.
 * 컨텍스트가 없거나 역할이 모자라면 즉시 null로 resolve되는 레인을 내려보내고, 클라이언트가
 * 기존 경로대로 페치해 API가 401/403으로 차단한다 — 미검증 요청에는 어떤 데이터도 실리지 않는다.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * 스트리밍 전환(2026-09-10 어드민 횡단 인프라 2라운드 — tmp/admin-overhaul-2026-09-10/
 * platform.md §2.2(e) 위임안 반영, 6소스 스냅샷 기준).
 *
 * 이전: settleWithinBudget(1.2초 공용 예산)로 6개 소스를 Promise.all 안에서 "기다렸다가"
 * null-or-value를 반환했다 — 콜드 미스는 1.2초를 그대로 TTFB에 얹은 뒤에야 null이 확정되고,
 * 그 null을 받은 클라이언트가 같은 데이터를 다시 요청했다(이중 비용, platform.md §2.0).
 *
 * 이후: 각 소스를 openPrefetchLane으로 "열기만" 하고 기다리지 않는다. admin 검증(쿠키 확인,
 * 보통 ms 단위)만 여전히 await한다 — "미검증 요청에는 데이터가 실리지 않는다"는 위 보안
 * 불변식을 지키려면 검증까지는 동기적으로 끝내야 하기 때문이다(platform.md §2.2(e) 절충안).
 * 검증이 끝나면 무거운 6개 소스는 전부 레인만 열고 즉시 함수가 반환된다 — page.tsx가 이
 * 결과를 await해도 실제로 기다리는 건 "검증 + 레인 6개를 여는 동기 비용"뿐이다(수 ms).
 *
 * 반환 타입이 `T | null`에서 `DeferredPrefetch<T>`로 바뀌었다 — OverviewClient가 각
 * `.promise`를 React use()로, 소스별 독립 <Suspense> 경계 안에서 소비한다(화면 전체를 한
 * Suspense로 감싸면 가장 느린 소스가 전체를 막아 스트리밍 이점이 사라지므로 반드시 소스별).
 * `.generatedAt`(레인을 연 시각)은 기존 T3/T4 규약 그대로 seedAdminRequestCache·
 * isPrefetchFresh에 전달된다(lib/admin/prefetch-freshness.ts 참고, 이 규약은 안 바뀌었다).
 *
 * 이 함수 자체는 (admin이 아예 없거나 검증이 던지는 경우에도) `null`을 반환하지 않는다 —
 * 대신 모든 필드를 "즉시 null로 resolve되는 레인"(deniedLane)으로 채운 객체를 돌려준다.
 * OverviewClient가 이미 `initialData: OverviewInitialData`(항상 정의됨)를 기대하는 계약을
 * 그대로 유지하기 위해서다(CRM 홈처럼 `| null`을 프롭에 새로 허용하도록 클라이언트를 넓히는
 * 것보다, 오늘의 "필드는 있고 값만 없다" 모양을 유지하는 쪽이 변경 범위가 작다).
 */
export interface OverviewInitialData {
  leadOverview: DeferredPrefetch<OverviewLeadSummary>
  visitorStats: DeferredPrefetch<VisitorStatsPayload>
  /** 화면이 실제로 소비하는 두 수치만 — 나머지 LeadActionStats 필드는 RSC 페이로드에 싣지 않는다. */
  leadActionKpis: DeferredPrefetch<{ unrespondedCount: number; unresponded24hCount: number }>
  /** 라우트 응답과 같은 객체 — 소스별 health를 포함해야 실패를 0으로 오인하지 않는다. */
  osSummary: DeferredPrefetch<OsSummary>
  /**
   * OverviewClient의 BranchSummaryPayload와 같은 트림 — buildBranchSummaryPayload가 돌려주는
   * campaigns_recent·deal_mix·data_sources 등은 이 화면이 전혀 읽지 않으므로(leadActionKpis와
   * 같은 원칙) RSC 페이로드에 싣지 않는다. 트림은 이제 레인의 run() 콜백 **안에서** 일어난다
   * (예전엔 Promise.all 바깥, try/catch 밖에서 일어나 트림 코드가 던지면 이 함수 전체가
   * 크래시했다 — openPrefetchLane의 에러 캐치 안으로 들어오면서 부수적으로 더 안전해졌다).
   */
  branchSummary: DeferredPrefetch<{
    revenue: { confirmed: number; goal: number; pacing_pct: number }
    monthly_series: { goal_cum: number[]; revenue_cum: number[]; revenue_trend_cum: number[] }
  }>
  /** OverviewClient의 ChatbotStatsPayload와 같은 트림 — totals만. */
  chatbotStats: DeferredPrefetch<{
    totals: {
      questionCount: number
      unresolvedCount: number
      handoffCount: number
      directAnswerCount: number
    }
  }>
}

// Overview 인바운드 스트립의 챗봇 7일 창 — components/admin/AdminSidebar.tsx의
// overviewChatbotStatsUrl()·OverviewClient.tsx의 localDateOnly(오늘-6)와 반드시 같은
// 산식이어야 unstable_cache 키(from 문자열)가 겹친다. 세 곳 중 하나만 날짜 계산을 바꾸면
// 이 프리페치가 데운 캐시를 클라이언트가 다른 슬롯으로 조회해 헛돈다 — 바꿀 때 세 파일을
// 함께 확인한다(AdminSidebar.tsx는 이 작업 소유 밖이라 직접 고치지 않았다).
function overviewChatbotStatsFromParam(now: Date): string {
  const from = new Date(now)
  from.setDate(from.getDate() - 6)
  const month = String(from.getMonth() + 1).padStart(2, "0")
  const day = String(from.getDate()).padStart(2, "0")
  return `${from.getFullYear()}-${month}-${day}`
}

// 역할이 없어 애초에 부르면 안 되는 소스 — openPrefetchLane과 같은 {promise, generatedAt}
// 모양으로 맞춰, 클라이언트가 "역할 없음"과 "레인이 null로 끝남"을 구분할 필요 없이 항상
// 같은 use() 경로로 소비하게 한다.
function deniedLane<T>(): DeferredPrefetch<T> {
  return { promise: Promise.resolve(null), generatedAt: Date.now() }
}

function deniedInitialData(): OverviewInitialData {
  return {
    leadOverview: deniedLane(),
    visitorStats: deniedLane(),
    leadActionKpis: deniedLane(),
    osSummary: deniedLane(),
    branchSummary: deniedLane(),
    chatbotStats: deniedLane(),
  }
}

export async function prefetchOverviewInitialData(): Promise<OverviewInitialData> {
  // 검증 경로 자체가 던지면(예: Supabase env 부재) 페이지를 500으로 만들지 않고
  // 프리페치 없음으로 떨어뜨린다 — 지금까지의 동작(항상 렌더 후 클라이언트 페치)과 같다.
  let admin: Awaited<ReturnType<typeof getVerifiedAdminContextForPage>> = null
  try {
    admin = await getVerifiedAdminContextForPage()
  } catch (error) {
    console.error("[overview prefetch] admin verification failed", error)
    return deniedInitialData()
  }
  if (!admin) return deniedInitialData()

  // 라우트별 허용 역할과 문자 그대로 같은 목록을 쓴다.
  // - leads?scope=overview·crm/action-kpis: requireVerifiedAdminContext(req, CRM_STAFF_ADMIN_API_ROLES)
  // - visitor-stats·os-summary: verifyAdmin(req) → GET 기본값 = BRANCH_READ_ADMIN_API_ROLES
  const crmAllowed = hasAdminApiRole(admin.role, CRM_STAFF_ADMIN_API_ROLES)
  const readAllowed = hasAdminApiRole(admin.role, BRANCH_READ_ADMIN_API_ROLES)
  const now = new Date()

  return {
    leadOverview: crmAllowed ? openPrefetchLane(() => getCachedOverviewLeadSummary()) : deniedLane(),
    // 클라이언트가 부르는 URL은 ?range=7 — parseVisitorStatsRange("7")과 같은 값을 넘긴다.
    visitorStats: readAllowed ? openPrefetchLane(() => getAdminVisitorStats(7)) : deniedLane(),
    leadActionKpis: crmAllowed
      ? openPrefetchLane(async () => {
          const stats = await getLeadActionStats()
          return { unrespondedCount: stats.unrespondedCount, unresponded24hCount: stats.unresponded24hCount }
        })
      : deniedLane(),
    // 라우트가 부르는 것과 같은 캐시 엔트리 — 실패/타임아웃이면 null로 떨어져 클라이언트가
    // 기존대로 /api/admin/os-summary를 탄다(그때는 이 계산이 이미 웜일 가능성이 높다).
    osSummary: readAllowed ? openPrefetchLane(() => getCachedOsSummary()) : deniedLane(),
    // 클라이언트 실호출과 문자 그대로 같은 조합(team=ALL·period=Y) — 라우트의 team/period
    // enum 검증은 고정값이라 재현할 필요가 없다. skipSheetFreshness:true는
    // app/admin/branch/page.tsx의 서버 프리페치와 같은 이유(Drive 왕복 2회를 TTFB에 얹지
    // 않음) — Overview는 sheetModifiedAt·data_sources를 애초에 읽지 않으니 더더욱 안전하다.
    // resolvePeriodDate("Y", ...)는 항상 fallback(now)을 반환하지만 시그니처가 Date|null이라
    // ?? now로 좁힌다(non-null 단언 금지 규칙).
    branchSummary: readAllowed
      ? openPrefetchLane(async () => {
          const summary = await buildBranchSummaryPayload({
            team: "ALL",
            period: "Y",
            periodDate: resolvePeriodDate("Y", null, now) ?? now,
            includeBreakdown: false,
            overviewView: false,
            now,
            skipSheetFreshness: true,
          })
          // 화면이 실제로 읽는 필드만 RSC 페이로드에 싣는다(leadActionKpis와 같은 원칙).
          return {
            revenue: summary.revenue,
            monthly_series: {
              goal_cum: summary.monthly_series.goal_cum,
              revenue_cum: summary.monthly_series.revenue_cum,
              revenue_trend_cum: summary.monthly_series.revenue_trend_cum,
            },
          }
        })
      : deniedLane(),
    // from만 지정 — OverviewClient·AdminSidebar와 같은 7일 창(오늘 포함 -6일). getChatbotStats
    // 내부 unstable_cache가 (from,to) 인자로 키를 잡으므로, 이 호출이 클라이언트의 나중
    // 요청과 같은 캐시 슬롯을 데운다.
    chatbotStats: readAllowed
      ? openPrefetchLane(async () => {
          const stats = await getChatbotStats(new URLSearchParams({ from: overviewChatbotStatsFromParam(now) }))
          return { totals: stats.totals }
        })
      : deniedLane(),
  }
}
