// 블로그 목록 로딩 골격 — 실제 레이아웃(헤더 → 밑줄 탭 → 대표 글 → 3열 카드)과
// 같은 자리·같은 비율로 그려서 데이터가 도착할 때 시프트가 없게 한다.
export default function BlogLoading() {
  return (
    <div className="min-h-screen bg-[#FAFAF8]" aria-hidden>
      <section className="mx-auto max-w-[1100px] px-4 pt-28 sm:px-6 md:pt-40">
        <div className="mb-4 h-3 w-12 animate-pulse rounded bg-[#eceae5]" />
        <div className="h-10 w-[min(100%,30rem)] animate-pulse rounded-lg bg-[#eceae5] md:h-12" />
        <div className="mt-4 h-4 w-[min(100%,28rem)] animate-pulse rounded bg-[#f2f0eb]" />
      </section>

      <section className="mx-auto mt-10 max-w-[1100px] px-4 sm:px-6 md:mt-14">
        <div className="flex flex-col gap-3 border-b border-[#e8e8e4] pb-3 md:flex-row md:items-end md:justify-between">
          <div className="flex gap-5">
            {Array.from({ length: 4 }).map((_, index) => (
              <div key={index} className="h-5 w-14 animate-pulse rounded bg-[#eceae5]" />
            ))}
          </div>
          <div className="h-11 w-full animate-pulse rounded-lg bg-[#f2f0eb] md:w-64" />
        </div>
      </section>

      <section className="mx-auto max-w-[1100px] px-4 pb-20 pt-10 sm:px-6 md:pt-12">
        <div className="mb-12 grid gap-6 border-b border-[#e8e8e4] pb-12 md:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)] md:items-center md:gap-12">
          <div className="aspect-[4/3] animate-pulse rounded-2xl bg-[#eceae5]" />
          <div className="space-y-3">
            <div className="h-3 w-32 animate-pulse rounded bg-[#f2f0eb]" />
            <div className="h-8 w-full animate-pulse rounded-lg bg-[#eceae5]" />
            <div className="h-8 w-3/4 animate-pulse rounded-lg bg-[#eceae5]" />
            <div className="h-4 w-full animate-pulse rounded bg-[#f2f0eb]" />
          </div>
        </div>
        <div className="grid gap-x-6 gap-y-12 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, index) => (
            <div key={index}>
              <div className="aspect-[4/3] animate-pulse rounded-xl bg-[#eceae5]" />
              <div className="mt-4 h-3 w-28 animate-pulse rounded bg-[#f2f0eb]" />
              <div className="mt-3 h-5 w-4/5 animate-pulse rounded bg-[#eceae5]" />
              <div className="mt-2 h-3 w-full animate-pulse rounded bg-[#f2f0eb]" />
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}
