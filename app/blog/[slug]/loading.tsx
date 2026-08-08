// 블로그 상세 로딩 골격 — 상세 페이지는 generateStaticParams가 비어 있어
// 첫 방문이 온디맨드 생성이다. 그 대기 동안 실제 레이아웃(뒤로가기 → 칩 → 제목 →
// 발췌 → 메타 → 히어로 이미지 → 본문)과 같은 자리를 먼저 그린다.
export default function BlogPostLoading() {
  return (
    <div className="min-h-screen bg-[#FAFAF8]" aria-hidden>
      <section className="px-4 pb-10 pt-28 sm:px-6 md:pt-40">
        <div className="mx-auto max-w-[1200px]">
          <div className="mb-8 h-4 w-32 animate-pulse rounded bg-[#f2f0eb]" />

          <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_420px] lg:items-end">
            <div>
              <div className="mb-4 flex gap-2">
                <div className="h-7 w-20 animate-pulse rounded-full bg-[#eceae5]" />
                <div className="h-7 w-16 animate-pulse rounded-full bg-[#f2f0eb]" />
              </div>
              <div className="space-y-3">
                <div className="h-9 w-full animate-pulse rounded-lg bg-[#eceae5] md:h-16" />
                <div className="h-9 w-3/4 animate-pulse rounded-lg bg-[#eceae5] md:h-16" />
              </div>
              <div className="mt-6 space-y-2">
                <div className="h-4 w-full animate-pulse rounded bg-[#f2f0eb]" />
                <div className="h-4 w-5/6 animate-pulse rounded bg-[#f2f0eb]" />
              </div>
              <div className="mt-8 h-4 w-72 animate-pulse rounded bg-[#f2f0eb]" />
            </div>
            <div className="aspect-[16/10] w-full animate-pulse rounded-2xl bg-[#eceae5]" />
          </div>
        </div>
      </section>

      <section className="px-4 pb-24 sm:px-6">
        <div className="mx-auto max-w-[760px] space-y-4">
          {Array.from({ length: 8 }).map((_, index) => (
            <div
              key={index}
              className="h-4 animate-pulse rounded bg-[#f2f0eb]"
              style={{ width: index % 3 === 2 ? "72%" : "100%" }}
            />
          ))}
        </div>
      </section>
    </div>
  )
}
