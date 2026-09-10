import { Suspense } from "react"

import CrmUnifiedCustomersClient from "@/components/admin/crm/CrmUnifiedCustomersClient"

export const metadata = {
  title: "통합 고객 | Admin CRM",
}

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
export default function AdminCrmUnifiedCustomersPage() {
  return (
    <Suspense fallback={<UnifiedCustomersLoading />}>
      <CrmUnifiedCustomersClient />
    </Suspense>
  )
}
