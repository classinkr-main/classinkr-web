// 블로그 상세 로딩 골격 — 상세 페이지는 generateStaticParams가 비어 있어
// 첫 방문이 온디맨드 생성이다. 그 대기 동안 실제 레이아웃(가운데 720px 칼럼:
// 뒤로가기 → 카테고리 → 제목 → 발췌 → 메타 → 대표 이미지 → 본문)과 같은 자리를 먼저 그린다.
export default function BlogPostLoading() {
  return (
    <div className="min-h-screen bg-[#FAFAF8]" aria-hidden>
      <div className="mx-auto max-w-[768px] px-4 pb-24 pt-28 sm:px-6 md:pt-36">
        <div className="mb-8 h-4 w-16 animate-pulse rounded bg-[#f2f0eb]" />
        <div className="h-3 w-28 animate-pulse rounded bg-[#f2f0eb]" />
        <div className="mt-4 space-y-3">
          <div className="h-9 w-full animate-pulse rounded-lg bg-[#eceae5] md:h-12" />
          <div className="h-9 w-2/3 animate-pulse rounded-lg bg-[#eceae5] md:h-12" />
        </div>
        <div className="mt-5 space-y-2">
          <div className="h-4 w-full animate-pulse rounded bg-[#f2f0eb]" />
          <div className="h-4 w-5/6 animate-pulse rounded bg-[#f2f0eb]" />
        </div>
        <div className="mt-8 h-4 w-60 animate-pulse rounded bg-[#f2f0eb]" />
        <div className="mt-8 aspect-[16/10] w-full animate-pulse rounded-2xl bg-[#eceae5]" />

        <div className="mt-12 space-y-4">
          {Array.from({ length: 8 }).map((_, index) => (
            <div
              key={index}
              className="h-4 animate-pulse rounded bg-[#f2f0eb]"
              style={{ width: index % 3 === 2 ? "72%" : "100%" }}
            />
          ))}
        </div>
      </div>
    </div>
  )
}
