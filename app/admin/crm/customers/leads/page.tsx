import { Suspense } from "react"

import LeadsBoardClient from "@/components/admin/crm/leads/LeadsBoardClient"

export const metadata = {
  title: "리드 | Admin CRM",
}

// Suspense 폴백을 null로 두면 초기 진입이 완전한 빈 화면이 된다 — 보드 골격(헤더·카드 밴드·
// 목록 카드)을 그려 하이드레이션 전에도 어디에 무엇이 뜰지 보이게 한다.
function LeadsBoardFallback() {
  return (
    <div aria-hidden>
      <div className="mb-6 space-y-2">
        <div className="h-3 w-28 animate-pulse rounded bg-[#f0f0ec]" />
        <div className="h-7 w-24 animate-pulse rounded bg-[#f0f0ec]" />
        <div className="h-3 w-52 animate-pulse rounded bg-[#f5f5f2]" />
      </div>
      <div className="mb-4 h-16 animate-pulse rounded-2xl bg-[#f0f0ec]" />
      <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-5">
        {Array.from({ length: 5 }).map((_, index) => (
          <div key={index} className="h-[62px] animate-pulse rounded-xl bg-[#f0f0ec]" />
        ))}
      </div>
      <div className="h-72 animate-pulse rounded-2xl bg-[#f0f0ec]" />
    </div>
  )
}

export default function AdminCrmLeadsPage() {
  return (
    <Suspense fallback={<LeadsBoardFallback />}>
      <LeadsBoardClient />
    </Suspense>
  )
}
