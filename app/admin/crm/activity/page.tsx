import CrmActivityClient from "@/components/admin/crm/CrmActivityClient"
import { prefetchCrmActivityInitialData } from "@/lib/admin/crm/activity-prefetch"

export const dynamic = "force-dynamic"

export const metadata = {
  title: "기록 | Admin CRM",
}

/**
 * CRM 기록 라우트 — 서버 컴포넌트 껍데기(P1a, CRM 홈과 같은 패턴).
 * 화면 본체는 CrmActivityClient가 소유하고, 이 파일은 첫 페이지 데이터를 서버에서 미리 만들어
 * initialData로 내려주는 일만 한다. admin 인증 확인만 await하고, 실제 조회는
 * openPrefetchLane으로 레인만 열려 TTFB를 붙잡지 않는다(prefetchCrmActivityInitialData 참고).
 */
export default async function AdminCrmActivityPage() {
  const initialData = await prefetchCrmActivityInitialData()
  return <CrmActivityClient initialData={initialData} />
}
