const summaryItems = [
  {
    term: "대상",
    description: "학원, 교습소, 어학원, 입시 학원처럼 반복 수업과 과제 관리를 표준화해야 하는 교육기관",
  },
  {
    term: "핵심 기능",
    description: "실시간 수업, 과제·테스트, AI 자동채점, 복습 리포트, 학부모 소통, 관리자 대시보드",
  },
  {
    term: "하드웨어 연동",
    description: "Classin Board 전자칠판과 연결해 판서, 수업 영상, AI 카메라 녹화, 복습 자료 공유를 한 흐름으로 관리",
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
              Classin은 학원 수업 운영 플랫폼입니다
            </h2>
          </div>
          <div>
            <p className="text-base leading-8 text-[#484540] md:text-lg">
              Classin은 수업 준비, 실시간 수업, 과제 제출, AI 자동채점, 복습 리포트, 학부모 소통을 하나로 연결해
              강사 개인 역량에만 의존하던 수업 운영을 시스템으로 바꾸는 플랫폼입니다.
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
