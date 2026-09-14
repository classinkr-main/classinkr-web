import "server-only"

import { CRM_STAFF_ADMIN_API_ROLES, hasAdminApiRole } from "@/lib/admin-auth"
import { getVerifiedAdminContextForPage } from "@/lib/admin/page-auth"
import { openPrefetchLane, type DeferredPrefetch } from "@/lib/admin/prefetch-budget"
import { getCrmPriorityQueue, type CrmPriorityQueue } from "@/lib/repositories/crm-priority-queue"
import { QUEUE_POOL_LIMIT } from "@/lib/crm/priority-queue-request"

/**
 * CRM 홈 "오늘 전화할 N건" 카드(CrmPriorityQueuePanel, 담당자 전체 기준)의 서버 프리페치.
 *
 * home-prefetch.ts(CrmHomeInitialData)와 일부러 분리했다 — tests/admin/crm-home-prefetch.test.ts
 * (admin-core 소유였던 계약)가 CrmHomeInitialData의 필드 집합을 고정하고 있어(leadActionKpis·
 * overview·compassPipeline 셋뿐), 그 인터페이스에 필드를 하나라도 얹으면 그 테스트가 깨진다
 * (모듈 import 시점의 부수효과 크래시까지 겹친다 — crm-priority-queue.ts는 로드되자마자
 * onLeadsMutated 등을 구독한다). 완전히 별도 함수·별도 admin 검증으로 두면 home-prefetch.ts는
 * 원래 계약 그대로 남는다.
 *
 * app/admin/crm/page.tsx가 이 함수와 prefetchCrmHomeInitialData()를 Promise.all로 나란히
 * 부른다 — admin 검증이 두 번(가벼운 인증 확인이라 비용은 작다) 도는 대신, 우선순위 큐
 * 수집 자체는 overview 등과 완전히 병렬로 돌아 TTFB에 추가 지연을 주지 않는다
 * (2026-09-07 감사 #7 — 홈 마운트 시 클라이언트가 쏘던 8개 fetch 중 하나를 이 서버 렌더로 접는다).
 *
 * 보안: home-prefetch.ts와 같은 원칙 — 미검증·역할 부족이면 null(클라이언트가 기존 경로대로
 * /api/admin/crm/home/priority-queue를 직접 불러 401/403으로 차단됨).
 *
 * 스트리밍 전환(2026-09-10 2라운드): settleWithinBudget(1.2초 공용 예산) → openPrefetchLane.
 * 반환 타입이 `CrmPriorityQueue | null`(값)에서 `DeferredPrefetch<CrmPriorityQueue> | null`
 * (역할 부족이면 null, 그 외엔 항상 레인)로 바뀐다 — CrmPriorityQueuePanel이 이 promise를
 * React use()로 직접 풀어 소비한다(components/admin/crm/CrmPriorityQueuePanel.tsx 참고,
 * 이 패널은 CRM 홈에 단 한 곳에서만 쓰여 다른 자리와 값을 공유할 필요가 없으므로, Overview·
 * CRM 홈 나머지 세 소스처럼 "부모 state로 옮기는 다리 컴포넌트"를 두지 않고 패널 자신이
 * use()를 호출하는 더 단순한 형태를 택했다).
 */
export async function prefetchCrmPriorityQueueForHome(): Promise<DeferredPrefetch<CrmPriorityQueue> | null> {
  let admin: Awaited<ReturnType<typeof getVerifiedAdminContextForPage>> = null
  try {
    admin = await getVerifiedAdminContextForPage()
  } catch (error) {
    console.error("[crm home prefetch] priority queue admin verification failed", error)
    return null
  }
  if (!admin || !hasAdminApiRole(admin.role, CRM_STAFF_ADMIN_API_ROLES)) return null

  // CrmPriorityQueuePanel의 기본(담당자 전체) 호출과 정확히 같은 조건.
  return openPrefetchLane(() => getCrmPriorityQueue({ limit: QUEUE_POOL_LIMIT, source: "customer" }))
}
