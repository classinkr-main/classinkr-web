import CrmHomeClient from "@/components/admin/crm/home/CrmHomeClient"
import { prefetchCrmHomeInitialData } from "@/lib/admin/crm/home-prefetch"

export const dynamic = "force-dynamic"

/**
 * CRM 홈(현황) 라우트 — 서버 컴포넌트 껍데기.
 *
 * 화면 본체는 CrmHomeClient가 소유하고, 이 파일은 첫 화면 데이터를 서버에서 미리 만들어
 * 내려주는 일만 한다(Overview·KR Team·하드웨어·장부와 같은 패턴).
 *
 * 홈은 마운트에서 클라이언트 fetch를 여럿 띄우는데, 그중 첫 화면 위쪽을 그리는 셋
 * (리드 KPI·통합 상태·Compass 밴드)을 HTML과 함께 보낸다. 프리페치가 비면
 * (미인증·역할 부족·예산 초과·실패) 화면은 지금까지처럼 클라이언트 페치로 떨어진다.
 */
export default async function AdminCrmHomePage() {
  const initialData = await prefetchCrmHomeInitialData()

  return <CrmHomeClient initialData={initialData} />
}
