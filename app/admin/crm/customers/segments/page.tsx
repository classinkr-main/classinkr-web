import { Suspense } from "react"

import SegmentHubClient from "@/components/admin/crm/segments/SegmentHubClient"

export const metadata = {
  title: "세그먼트 | Admin CRM",
}

// 고객DB › 세그먼트 허브(C안 ②, 2026-09-25). 화면은 클라이언트가 그리고(목록·상세·빌더·추이·행동·자동 태그),
// 선택 상태는 ?id= 로 URL 에 싣는다(useSearchParams → Suspense 경계 필요).
// Suspense 폴백은 null 대신 골격(제목·범위 칩·표 그림자)을 그려 하이드레이션 전에도 레이아웃이
// 흔들리지 않게 한다(tags/page.tsx·leads/page.tsx 와 같은 관례).
function SegmentsFallback() {
  return (
    <div aria-hidden>
      <div className="mb-6 space-y-2">
        <div className="h-7 w-28 animate-pulse rounded bg-[#f0f0ec]" />
        <div className="h-3 w-80 max-w-full animate-pulse rounded bg-[#f5f5f2]" />
      </div>
      <div className="mb-3 flex gap-2">
        {Array.from({ length: 3 }).map((_, index) => (
          <div key={index} className="h-8 w-20 animate-pulse rounded-full bg-[#f0f0ec]" />
        ))}
      </div>
      <div className="h-64 animate-pulse rounded-2xl bg-[#f0f0ec]" />
    </div>
  )
}

export default function AdminCrmCustomersSegmentsPage() {
  return (
    <Suspense fallback={<SegmentsFallback />}>
      <SegmentHubClient />
    </Suspense>
  )
}
