import { Suspense } from "react"

import TagManagementPanel from "@/components/admin/crm/TagManagementPanel"

export const metadata = {
  title: "태그 | Admin CRM",
}

// Suspense 폴백은 null 대신 골격(제목·검색창·표 그림자)을 그려 하이드레이션 전에도 레이아웃이
// 흔들리지 않게 한다(leads/page.tsx·map/page.tsx와 같은 관례).
function TagsFallback() {
  return (
    <div aria-hidden>
      <div className="mb-6 space-y-2">
        <div className="h-7 w-28 animate-pulse rounded bg-[#f0f0ec]" />
        <div className="h-3 w-72 animate-pulse rounded bg-[#f5f5f2]" />
      </div>
      <div className="mb-3 h-10 max-w-sm animate-pulse rounded-lg bg-[#f0f0ec]" />
      <div className="h-64 animate-pulse rounded-2xl bg-[#f0f0ec]" />
    </div>
  )
}

export default function AdminCrmCustomersTagsPage() {
  return (
    <Suspense fallback={<TagsFallback />}>
      <TagManagementPanel />
    </Suspense>
  )
}
