import { ArrowRight, CheckCircle2 } from "lucide-react"
import { TrackedLink } from "@/components/TrackedLink"
import { getDocBySlug, getDocPath } from "@/lib/docs"

// 요금 문서가 비공개로 바뀌거나 slug 가 바뀌면 깨진 링크 대신 항목을 뺀다.
const PRICING_FAQ_DOC = getDocBySlug("software-pricing-quote-bundle-faq", "software")

const MORE_LINKS = [
  {
    href: "/faq",
    ctaId: "pricing_more_faq",
    title: "자주 묻는 질문",
    description: "도입, 요금제, 설치, 운영 지원에 대한 질문과 답변",
  },
  ...(PRICING_FAQ_DOC
    ? [
        {
          href: getDocPath(PRICING_FAQ_DOC),
          ctaId: "pricing_more_pricing_faq_doc",
          title: "요금제·결합 견적 FAQ",
          description: "요금제 표의 용어와 전자칠판 결합 견적, 결제 뒤 절차",
        },
      ]
    : []),
  {
    href: "/pricing/simulator",
    ctaId: "pricing_more_simulator",
    title: "요금 시뮬레이터",
    description: "수업 운영 패턴을 입력해 예상 요금을 비교",
  },
  {
    href: "/showroom",
    ctaId: "pricing_more_showroom",
    title: "목동 쇼룸 방문 예약",
    description: "수업 운영 흐름을 직접 확인하고 상담 예약",
  },
]

export default function PricingPage() {
  return (
    <main className="min-h-screen bg-[#FAFAF8] px-4 py-24 text-[#111110] sm:px-6 lg:py-28">
      <div className="mx-auto max-w-5xl">
        <div className="max-w-3xl">
          <p className="text-[12px] font-semibold uppercase tracking-[0.18em] text-[#084734]/70">
            Pricing
          </p>
          <h1 className="mt-3 text-[2.35rem] font-semibold leading-[1.08] tracking-tight sm:text-5xl">
            학원 규모와 운영 방식에 맞춰 상담과 결제를 이어갈 수 있습니다.
          </h1>
          <p className="mt-5 max-w-2xl text-[15px] leading-7 text-[#615D59] sm:text-base">
            소프트웨어는 온라인 체크아웃에서 바로 확인하고, 하드웨어와 대형 기관 도입은
            전담 매니저가 견적과 구축 범위를 안내합니다.
          </p>
        </div>

        <div className="mt-10 grid gap-4 md:grid-cols-3">
          {[
            {
              title: "소프트웨어 플랜",
              description: "Learning Space 구독형 플랜과 충전형 Business 결제를 확인합니다.",
              href: "/checkout",
              cta: "체크아웃 보기",
              points: ["온라인 결제", "구독형/충전형", "계정 수 조정"],
            },
            {
              title: "제품 구성 살펴보기",
              description: "수업 운영에 필요한 소프트웨어 기능과 도입 흐름을 먼저 비교합니다.",
              href: "/product/sw",
              cta: "소프트웨어 보기",
              points: ["라이브 수업", "운영 리포트", "온보딩 가이드"],
            },
            {
              title: "맞춤 견적 상담",
              description: "하드웨어, 설치, 대형 기관 계약은 상담을 통해 가장 알맞게 설계합니다.",
              href: "/contact#contact-form",
              cta: "도입 상담하기",
              points: ["하드웨어 연계", "기관별 견적", "전담 매니저"],
            },
          ].map((item) => (
            <section
              key={item.title}
              className="flex h-full flex-col rounded-[20px] border border-black/[0.06] bg-white p-6 shadow-sm"
            >
              <h2 className="text-xl font-semibold tracking-tight">{item.title}</h2>
              <p className="mt-3 text-sm leading-6 text-[#615D59]">{item.description}</p>
              <ul className="mt-5 space-y-2 text-sm text-[#44514A]">
                {item.points.map((point) => (
                  <li key={point} className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-[#084734]" aria-hidden="true" />
                    {point}
                  </li>
                ))}
              </ul>
              <TrackedLink
                href={item.href}
                ctaId={`pricing_${item.title}`}
                tracking={{ destination: item.href }}
                className="mt-7 inline-flex items-center gap-2 text-sm font-semibold text-[#084734] transition-colors hover:text-[#111110]"
              >
                {item.cta}
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </TrackedLink>
            </section>
          ))}
        </div>

        <div className="mt-8 rounded-[20px] border border-[#DCE9E1] bg-[#F5FBF7] px-5 py-4 text-sm leading-6 text-[#44514A]">
          표시되는 가격과 결제 가능 항목은 체크아웃 및 상담 단계에서 최종 확인됩니다.
        </div>

        <nav aria-labelledby="pricing-more-heading" className="mt-12 border-t border-black/[0.08] pt-8">
          <h2 id="pricing-more-heading" className="text-sm font-semibold text-[#111110]">
            더 확인하기
          </h2>
          <ul className="mt-4 grid gap-3 sm:grid-cols-2">
            {MORE_LINKS.map((link) => (
              <li key={link.ctaId}>
                <TrackedLink
                  href={link.href}
                  ctaId={link.ctaId}
                  className="group flex h-full items-start justify-between gap-4 rounded-[12px] border border-black/[0.08] bg-white px-5 py-4 transition-colors hover:border-[#084734]/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#084734] focus-visible:ring-offset-2 focus-visible:ring-offset-[#FAFAF8]"
                >
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold text-[#111110] group-hover:text-[#084734]">
                      {link.title}
                    </span>
                    <span className="mt-1 block break-keep text-[13px] leading-5 text-[#615D59]">
                      {link.description}
                    </span>
                  </span>
                  <ArrowRight className="mt-0.5 h-4 w-4 shrink-0 text-[#084734]" aria-hidden="true" />
                </TrackedLink>
              </li>
            ))}
          </ul>
        </nav>
      </div>
    </main>
  )
}
