import { CLASSIN_POSITIONING } from "@/lib/classin-positioning"

const summaryItems = [
  {
    term: "대상",
    description: CLASSIN_POSITIONING.primaryAudience,
  },
  {
    term: "핵심 흐름",
    description: "전자칠판, EDB 교안, 녹화, LMS, 학생 관리, 관리자 대시보드를 한 수업 흐름으로 연결",
  },
  {
    term: "정직한 범위",
    description: "수업 운영은 Classin 안에서 표준화하고 결제·오프라인 출석·고급 리포트는 필요 시 연동으로 설계",
  },
]

export function HomeEntitySummary() {
  return (
    <section aria-labelledby="classin-summary-title" className="bg-white py-14 md:py-16">
      <div className="container mx-auto px-4">
        <div className="mx-auto grid max-w-6xl gap-8 border-y border-black/[0.08] py-10 md:grid-cols-[0.95fr_1.35fr] md:py-12">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#084734]">Classin Overview</p>
            <h2 id="classin-summary-title" className="mt-3 text-2xl font-black leading-tight text-[#111110] md:text-4xl">
              Classin은 학원 시스템 OS입니다
            </h2>
          </div>
          <div>
            <p className="text-base leading-8 text-[#484540] md:text-lg">
              {CLASSIN_POSITIONING.oneLine} 강사 개인기, 엑셀, 메신저, 별도 녹화 도구에 흩어진 운영을
              기관의 기준과 데이터로 바꾸는 것이 핵심입니다.
            </p>
            <dl className="mt-8 grid gap-4 sm:grid-cols-3">
              {summaryItems.map((item) => (
                <div key={item.term} className="border-l border-[#084734]/20 pl-4">
                  <dt className="text-sm font-bold text-[#084734]">{item.term}</dt>
                  <dd className="mt-2 text-sm leading-6 text-[#615D59]">{item.description}</dd>
                </div>
              ))}
            </dl>
          </div>
        </div>
      </div>
    </section>
  )
}
