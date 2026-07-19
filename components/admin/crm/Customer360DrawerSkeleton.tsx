// 360 드로어 next/dynamic 로딩 폴백 — 딥링크(?account=) 첫 페인트에서 청크 도착 전까지
// 실제 드로어와 같은 골격(우측 고정 패널 + 딤 배경 + 헤더/본문 스켈레톤)을 보여준다.
// 실제 드로어(fixed inset-0 z-50 flex justify-end · max-w-xl 패널 · bg-[#f5f5f2] 본문)와
// 레이아웃을 일치시켜 청크 도착 시 화면 점프가 없게 한다. 닫기 상호작용은 청크 도착 후 활성화.
export default function Customer360DrawerSkeleton() {
  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/20" aria-hidden />
      <div className="relative z-10 flex h-full w-full max-w-xl flex-col overflow-hidden bg-white shadow-2xl">
        <div className="border-b border-[#e8e8e4] bg-white px-5 py-4">
          <div className="h-5 w-16 animate-pulse rounded-full bg-[#f0f0ec]" />
          <div className="mt-2 h-6 w-44 animate-pulse rounded bg-[#f0f0ec]" />
          <div className="mt-2 h-4 w-64 animate-pulse rounded bg-[#f5f5f2]" />
        </div>
        <div
          aria-label="간단 로그 불러오는 중"
          data-testid="customer-quick-log-skeleton"
          className="shrink-0 border-b border-[#f0f0ec] bg-white px-4 py-2.5"
        >
          <div className="mb-1.5 h-4 w-16 animate-pulse rounded bg-[#f0f0ec]" />
          <div className="rounded-2xl border border-[#e8e8e4] bg-white p-2.5">
            <div className="flex gap-1.5">
              {Array.from({ length: 4 }).map((_, index) => (
                <div key={index} className="h-8 w-14 animate-pulse rounded-lg bg-[#f5f5f2]" />
              ))}
            </div>
            <div className="mt-2 flex gap-2">
              <div className="h-12 flex-1 animate-pulse rounded-lg bg-[#f5f5f2]" />
              <div className="h-10 w-16 animate-pulse rounded-lg bg-[#e4eee9]" />
            </div>
          </div>
        </div>
        <div className="flex-1 space-y-3 overflow-hidden bg-[#f5f5f2] p-4">
          <div className="h-28 animate-pulse rounded-2xl bg-[#ecece8]" />
          <div className="h-44 animate-pulse rounded-2xl bg-[#ecece8]" />
          <div className="h-44 animate-pulse rounded-2xl bg-[#ecece8]" />
        </div>
      </div>
    </div>
  )
}
