// 블로그 목록 로딩 골격 — 실제 레이아웃(히어로 1+2 갤러리 → 필터바 → 리스트)과
// 같은 자리·같은 비율로 그려서 데이터가 도착할 때 시프트가 없게 한다.
export default function BlogLoading() {
  return (
    <div className="min-h-screen bg-[#FAFAF8]" aria-hidden>
      <section className="px-4 pb-6 pt-28 sm:px-6 md:pt-40">
        <div className="mx-auto max-w-[1100px]">
          <div className="mb-5 h-3 w-12 animate-pulse rounded bg-[#eceae5]" />
          <div className="mb-3 h-10 w-[min(100%,26rem)] animate-pulse rounded-lg bg-[#eceae5] md:h-14" />
          <div className="mb-10 h-10 w-[min(100%,20rem)] animate-pulse rounded-lg bg-[#f2f0eb] md:mb-12 md:h-14" />

          {/* 실제 갤러리와 같은 사다리(1열 → sm 2열 → lg 3열) */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:aspect-[1100/460] lg:grid-cols-3 lg:grid-rows-2">
            <div className="animate-pulse rounded-2xl bg-[#eceae5] aspect-[16/10] sm:col-span-2 lg:aspect-auto lg:h-full lg:row-span-2" />
            <div className="animate-pulse rounded-2xl bg-[#eceae5] aspect-[16/10] lg:aspect-auto lg:h-full" />
            <div className="animate-pulse rounded-2xl bg-[#eceae5] aspect-[16/10] lg:aspect-auto lg:h-full" />
          </div>
        </div>
      </section>

      <section className="mx-auto mt-8 max-w-[1100px] px-4 sm:px-6">
        <div className="flex flex-col gap-4 border-b border-[#e8e8e4] pb-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex gap-1.5">
            {Array.from({ length: 5 }).map((_, index) => (
              <div key={index} className="h-9 w-20 animate-pulse rounded-full bg-[#eceae5]" />
            ))}
          </div>
          <div className="h-11 w-full animate-pulse rounded-lg bg-[#f2f0eb] sm:w-64" />
        </div>
      </section>

      <section className="mx-auto max-w-[1100px] px-4 pb-16 sm:px-6 md:pb-20">
        {Array.from({ length: 5 }).map((_, index) => (
          <div
            key={index}
            className="grid grid-cols-[1fr_128px] items-center gap-3 border-b border-[#ebebea] py-5 sm:grid-cols-[1fr_160px] sm:gap-5 md:grid-cols-[1fr_200px] md:items-start md:gap-8 md:py-6"
          >
            <div className="space-y-2">
              <div className="h-3 w-20 animate-pulse rounded bg-[#f2f0eb]" />
              <div className="h-5 w-4/5 animate-pulse rounded bg-[#eceae5]" />
              <div className="hidden h-3 w-full animate-pulse rounded bg-[#f2f0eb] sm:block" />
              <div className="h-3 w-2/5 animate-pulse rounded bg-[#f2f0eb]" />
            </div>
            <div className="aspect-[3/2] w-full animate-pulse rounded-xl bg-[#eceae5]" />
          </div>
        ))}
      </section>
    </div>
  )
}
