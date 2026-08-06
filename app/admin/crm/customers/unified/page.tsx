import { Suspense } from "react"

import CrmUnifiedCustomersClient from "@/components/admin/crm/CrmUnifiedCustomersClient"

export const metadata = {
  title: "통합 고객 | Admin CRM",
}

// useSearchParams를 쓰는 클라이언트 컴포넌트는 Suspense 경계가 필요하다(정적 프리렌더 실패 방지).
// 형제 라우트(leads·accounts)는 이미 같은 형태로 감싸는데 이 화면만 빠져 있었다.
export default function AdminCrmUnifiedCustomersPage() {
  return (
    <Suspense fallback={null}>
      <CrmUnifiedCustomersClient />
    </Suspense>
  )
}
