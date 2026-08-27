// CRM 라우트 공통 로딩 골격 — 라우트 전환 중 완전한 빈 화면 대신 페이지 뼈대를 먼저 그린다.
export default function AdminCrmLoading() {
  return (
    <div role="status" aria-live="polite" aria-busy="true">
      <span className="sr-only">CRM 화면을 불러오는 중입니다.</span>
      <div aria-hidden="true">
        <div className="mb-6 space-y-2">
          <div className="h-3 w-28 animate-pulse rounded bg-[#f0f0ec]" />
          <div className="h-7 w-40 animate-pulse rounded bg-[#f0f0ec]" />
          <div className="h-3 w-56 animate-pulse rounded bg-[#f5f5f2]" />
        </div>
        <div className="mb-4 h-24 animate-pulse rounded-2xl bg-[#f0f0ec]" />
        <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className="h-20 animate-pulse rounded-xl bg-[#f0f0ec]" />
          ))}
        </div>
        <div className="h-64 animate-pulse rounded-2xl bg-[#f0f0ec]" />
      </div>
    </div>
  )
}
