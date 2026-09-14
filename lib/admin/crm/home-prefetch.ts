import "server-only"

import { CRM_STAFF_ADMIN_API_ROLES, hasAdminApiRole } from "@/lib/admin-auth"
import { getAdminCrmOverview } from "@/lib/admin-crm-overview"
import { getVerifiedAdminContextForPage } from "@/lib/admin/page-auth"
import { openPrefetchLane, type DeferredPrefetch } from "@/lib/admin/prefetch-budget"
import { buildCompassPipelineBand } from "@/lib/compass/home-band"
import { getLeadActionStats } from "@/lib/repositories/leads"
import type {
  AdminCrmOverview,
  CompassPipelineKpis,
  LeadActionKpis,
} from "@/components/admin/crm/home/shared"

/**
 * CRM 홈 첫 화면(스크롤 없이 보이는 리드 요약·Compass 밴드·콕핏 지표)을 서버에서 미리 만든다.
 *
 * 각 항목은 대응 라우트가 부르는 것과 **같은 lib 함수**를 직접 호출한다(HTTP 자기호출 없음):
 *  - leadActionKpis   ← /api/admin/crm/action-kpis       (getLeadActionStats)
 *  - overview         ← /api/admin/crm/overview          (getAdminCrmOverview)
 *  - compassPipeline  ← /api/admin/crm/compass-pipeline  (buildCompassPipelineBand)
 *
 * 왜 이 셋인가: 홈은 마운트에서 클라이언트 fetch 8개를 띄우는데, 그중 이 셋이 첫 화면
 * 위쪽을 그린다. 특히 overview는 서버에서 DB 왕복이 30회에 가까워 가장 늦게 도착한다.
 *
 * 우선순위 큐("오늘 전화할 N건") 프리페치는 여기 없다 — 별도 파일
 * lib/admin/crm/priority-queue-prefetch.ts로 뺐다. 이유: tests/admin/crm-home-prefetch.test.ts
 * (admin-core 소유였던 계약 — 이번 스트리밍 전환으로 CrmHomeInitialData 필드 타입 자체가
 * 바뀌어 함께 갱신했다)가 CrmHomeInitialData의 필드 **집합**을 고정하고 있어, 이 인터페이스에
 * 새 필드를 얹으면 그 테스트가 깨진다. app/admin/crm/page.tsx가 두 프리페치 함수를
 * Promise.all로 나란히 불러 TTFB에는 차이가 없다(2026-09-07 감사 #7).
 *
 * ─────────────────────────────────────────────────────────────────────────
 * 스트리밍 전환(2026-09-10 어드민 횡단 인프라 2라운드 — tmp/admin-overhaul-2026-09-10/
 * platform.md §2.2(d) 위임안 반영).
 *
 * 이전: 소스별로 settleWithinBudget을 걸었다. overview만 예외로 공용 예산(1.2초)보다 훨씬
 * 짧은 700ms(OVERVIEW_PREFETCH_BUDGET_MS)를 썼다 — DB 왕복이 30회에 가까워 콜드에서 실측
 * 1.8초가 걸려 공용 예산을 항상 다 쓰고도 결국 null로 떨어졌기 때문이다(2026-09-07 감사:
 * TTFB가 1,260ms=예산 그대로에 고정). "느린 소스가 못 쓸 예산을 더 짧게 깎아 TTFB만 덜 쓰게"
 * 하는 완화책이었다.
 *
 * 이후: openPrefetchLane은 애초에 TTFB 예산을 전혀 쓰지 않는다(레인을 열기만 하고 안
 * 기다린다) — overview가 30회 DB 왕복 끝에 1.8초가 걸리든 그 이상이든, page.tsx는 그 시간을
 * 전혀 기다리지 않는다. 즉 **OVERVIEW_PREFETCH_BUDGET_MS 700ms는 이제 불필요해져 제거했다**
 * (판단 근거: 그 값의 존재 이유가 "예산을 뺏기지 않으려는 최적화"였는데, 뺏길 예산 자체가
 * 없어졌다). 대신 15초 ceiling(openPrefetchLane 기본값)까지는 값이 오면 스트리밍으로 그대로
 * 전달된다 — overview처럼 원래도 정상적으로 느린 집계에는 700ms보다 15초 쪽이 훨씬 관대하다.
 *
 * 반환 타입이 `Promise<CrmHomeInitialData>`(항상 값)에서 `Promise<CrmHomeInitialData | null>`
 * (역할 부족·미검증이면 null)로 바뀌었다 — CrmHomeClient의 prop이 이미
 * `initialData?: CrmHomeInitialData | null`로 optional이었으므로(하드웨어·장부와 달리 애초에
 * "프리페치가 아예 없을 수 있다"를 이미 표현하고 있었다), EMPTY_INITIAL_DATA 상수 없이 그대로
 * null 분기를 재사용할 수 있어 이쪽이 더 단순하다(Overview는 클라이언트가 non-null을
 * 기대하는 기존 계약이라 반대로 "항상 값, 필드만 비어있음" 모양을 유지했다 — 파일별로 기존
 * 소비처 계약에 맞춘 것이지 두 파일이 다른 원칙을 쓰는 게 아니다).
 *
 * CrmHomeClient가 각 `.promise`를 React use()로, 소스별 독립 <Suspense> 경계 안에서
 * 소비한다. `.generatedAt`은 기존 T3/T4 규약 그대로 유지된다.
 */
export interface CrmHomeInitialData {
  leadActionKpis: DeferredPrefetch<LeadActionKpis>
  overview: DeferredPrefetch<AdminCrmOverview>
  compassPipeline: DeferredPrefetch<CompassPipelineKpis>
}

export async function prefetchCrmHomeInitialData(): Promise<CrmHomeInitialData | null> {
  // 검증 경로 자체가 던지면(예: Supabase env 부재) 페이지를 500으로 만들지 않고
  // 프리페치 없음으로 떨어뜨린다 — 지금까지의 동작(항상 렌더 후 클라이언트 페치)과 같다.
  let admin: Awaited<ReturnType<typeof getVerifiedAdminContextForPage>> = null
  try {
    admin = await getVerifiedAdminContextForPage()
  } catch (error) {
    console.error("[crm home prefetch] admin verification failed", error)
    return null
  }
  if (!admin || !hasAdminApiRole(admin.role, CRM_STAFF_ADMIN_API_ROLES)) return null

  // admin 검증까지만 await한다(쿠키 확인 — ms 단위) — 무거운 세 소스는 레인만 열고
  // 기다리지 않는다. "미검증 요청에는 데이터가 실리지 않는다"는 보안 불변식은 위 역할
  // 체크가 이미 지킨다(레인을 여는 시점엔 이미 인증·역할이 확인된 뒤다).
  return {
    leadActionKpis: openPrefetchLane(() => getLeadActionStats()),
    overview: openPrefetchLane(() => getAdminCrmOverview()),
    compassPipeline: openPrefetchLane(() => buildCompassPipelineBand()),
  }
}
