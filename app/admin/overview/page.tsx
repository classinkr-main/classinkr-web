import OverviewClient from "./OverviewClient"
import { prefetchOverviewInitialData } from "@/lib/admin/overview/prefetch"

// 프리페치가 요청 쿠키로 어드민을 검증하므로 정적 프리렌더 대상이 아니다.
export const dynamic = "force-dynamic"

export default async function AdminOverviewPage() {
  // 2026-09-10 스트리밍 전환(2라운드, tmp/admin-overhaul-2026-09-10/platform.md §2.2(e)).
  // 이 await는 admin 인증 확인 하나만 기다린다(쿠키 검증 — ms 단위). 첫 화면을 그리는 무거운
  // 소스 여섯 개(리드·방문자·CRM 후속·os-summary·매출 요약·챗봇 통계)는
  // prefetchOverviewInitialData 내부에서 openPrefetchLane으로 "열기만" 하고 settle을
  // 기다리지 않는다 — 반환되는 각 필드는 {promise, generatedAt}이고, OverviewClient가 그
  // promise를 React use()로 소스별 독립 Suspense 경계 안에서 소비한다(lib/admin/overview/
  // prefetch.ts 참고). 콜드 소스가 아무리 느려도(리드 전량 스캔이든 매출 요약 집계든) 이
  // 페이지의 TTFB에는 더 이상 영향을 주지 않는다 — 검증 실패·역할 부족은 여전히 즉시
  // null로 끝나는 레인으로 내려가 클라이언트가 기존대로 스켈레톤 → 페치 경로를 탄다.
  const initialData = await prefetchOverviewInitialData()

  return <OverviewClient initialData={initialData} />
}
