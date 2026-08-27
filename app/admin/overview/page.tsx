import OverviewClient from "./OverviewClient"
import { prefetchOverviewInitialData } from "@/lib/admin/overview/prefetch"

// 프리페치가 요청 쿠키로 어드민을 검증하므로 정적 프리렌더 대상이 아니다.
export const dynamic = "force-dynamic"

export default async function AdminOverviewPage() {
  // 첫 화면을 그리는 무거운 세 소스만 서버에서 미리 집계한다. 검증 실패·역할 부족·상한
  // 초과는 전부 null로 내려가고, 클라이언트가 기존대로 스켈레톤 → 페치 경로를 탄다.
  const initialData = await prefetchOverviewInitialData()

  return <OverviewClient initialData={initialData} />
}
