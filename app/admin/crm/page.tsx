import CrmHomeClient from "@/components/admin/crm/home/CrmHomeClient"
import { prefetchCrmHomeInitialData } from "@/lib/admin/crm/home-prefetch"
import { prefetchCrmTodayContactsForHome } from "@/lib/admin/crm/today-contacts-prefetch"

export const dynamic = "force-dynamic"

/**
 * CRM 홈(현황) 라우트 — 서버 컴포넌트 껍데기.
 *
 * 화면 본체는 CrmHomeClient가 소유하고, 이 파일은 첫 화면 데이터를 서버에서 미리 만들어
 * 내려주는 일만 한다(Overview·KR Team·하드웨어·장부와 같은 패턴).
 *
 * 홈은 마운트에서 클라이언트 fetch를 여럿 띄우는데, 그중 첫 화면 위쪽을 그리는 넷
 * (리드 KPI·통합 상태·Compass 밴드·"오늘 연락")을 HTML과 함께 보낸다. "오늘 연락"만 별도
 * 함수(prefetchCrmTodayContactsForHome)로 분리했다 — home-prefetch.ts의 CrmHomeInitialData는
 * 계약 테스트(tests/admin/crm-home-prefetch.test.ts)가 필드 집합을 고정하고 있어 손대지
 * 않았다(2026-09-07 감사 #7). 두 프리페치를 Promise.all로 나란히 불러 TTFB에는 차이가 없다.
 * 프리페치가 비면(미인증·역할 부족·실패·15초 ceiling 초과) 화면은 지금까지처럼 클라이언트
 * 페치로 떨어진다.
 *
 * 2026-09-10 스트리밍 전환(2라운드): 두 await 모두 admin 인증 확인만 기다린다(ms 단위).
 * 실제 무거운 소스(overview의 DB 왕복 30회 등)는 각 prefetch 함수 내부에서
 * openPrefetchLane으로 열리기만 하고 여기서 기다리지 않는다 — CrmHomeClient·
 * CrmTodayContactsPanel이 그 promise를 React use()로 소스별 독립 Suspense 경계 안에서
 * 소비한다.
 *
 * 2026-09-25(C안 ①): 옛 "오늘 전화할 N건" 우선순위 큐 프리페치(priority-queue-prefetch)를
 * "오늘 연락" 프리페치로 교체했다.
 */
export default async function AdminCrmHomePage() {
  const [initialData, initialTodayContacts] = await Promise.all([
    prefetchCrmHomeInitialData(),
    prefetchCrmTodayContactsForHome(),
  ])

  return <CrmHomeClient initialData={initialData} initialTodayContacts={initialTodayContacts} />
}
