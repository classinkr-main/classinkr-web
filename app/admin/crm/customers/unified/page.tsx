import { Suspense } from "react"

import CrmUnifiedCustomersClient from "@/components/admin/crm/CrmUnifiedCustomersClient"
import { prefetchCrmUnifiedInitialData } from "@/lib/admin/crm/unified-prefetch"

export const metadata = {
  title: "통합 고객 | Admin CRM",
}

export const dynamic = "force-dynamic"

function UnifiedCustomersLoading() {
  return (
    <div
      className="mx-auto max-w-7xl space-y-4"
      role="status"
      aria-live="polite"
      aria-label="통합 고객 화면 로딩 중"
    >
      <div className="h-7 w-40 animate-pulse rounded bg-[#E8E8E4]" />
      <div className="h-4 w-72 max-w-full animate-pulse rounded bg-[#F0F0EC]" />
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <div key={index} className="h-11 animate-pulse rounded-full bg-[#F0F0EC]" />
        ))}
      </div>
      <div className="rounded-2xl border border-black/[0.08] bg-white p-4">
        <div className="h-11 animate-pulse rounded-lg bg-[#F6F5F4]" />
        <div className="mt-4 h-24 animate-pulse rounded-xl bg-[#F6F5F4]" />
      </div>
      <span className="sr-only">통합 고객 검색 화면을 불러오는 중입니다.</span>
    </div>
  )
}

// useSearchParams를 쓰는 클라이언트 컴포넌트는 Suspense 경계가 필요하다(정적 프리렌더 실패 방지).
// 형제 라우트(leads·accounts)는 이미 같은 형태로 감싸는데 이 화면만 빠져 있었다.
//
// P1b(2026-09-21) — 서버 프리페치 레인. admin 인증 확인만 여기서 await하고(ms 단위), 실제
// 통합 고객 조회(getCrmUnifiedCustomers)는 openPrefetchLane으로 시작만 해 둔다(TTFB 영향 없음).
// CrmUnifiedCustomersClient가 그 promise를 React use()로 풀어 요청 캐시에 심은 뒤 기존
// loadPage(0)이 그 캐시를 그대로 적중한다 — 자세한 시드 정합 규약은
// lib/admin/crm/unified-prefetch.ts 상단 주석 참고.
export default async function AdminCrmUnifiedCustomersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const params = await searchParams
  const pick = (key: string) => {
    const value = params[key]
    return Array.isArray(value) ? value[0] : value
  }
  const initialData = await prefetchCrmUnifiedInitialData({
    q: pick("q"),
    view: pick("view"),
    tag: pick("tag"),
    account: pick("account"),
  })

  return (
    <Suspense fallback={<UnifiedCustomersLoading />}>
      <CrmUnifiedCustomersClient initialData={initialData} />
    </Suspense>
  )
}
