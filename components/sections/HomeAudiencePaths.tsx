import { ArrowRight } from "lucide-react"

import { TrackedLink } from "@/components/TrackedLink"

const paths = [
  {
    title: "처음 알아보기",
    description: "학원 수업 운영을 살펴볼 자료부터 확인하세요.",
    href: "/resources",
    ctaId: "home_audience_discover",
  },
  {
    title: "도입 검토하기",
    description: "도입 기간과 요금, 연동에 관한 질문을 살펴보세요.",
    href: "/faq",
    ctaId: "home_audience_consider",
  },
  {
    title: "이미 사용 중이신가요?",
    description: "설치부터 수업 준비와 문제 해결까지 안내합니다.",
    href: "/docs",
    ctaId: "home_audience_customer",
  },
]

export function HomeAudiencePaths() {
  return (
    <section aria-labelledby="home-audience-title" className="relative z-20 bg-white py-12 md:py-16">
      <div className="container mx-auto px-4">
        <div className="mx-auto max-w-6xl">
          <h2 id="home-audience-title" className="text-2xl font-bold tracking-tight text-[#111110] md:text-3xl">
            지금 어떤 도움이 필요하신가요?
          </h2>
          <nav aria-label="상황별 안내" className="mt-6 grid gap-3 md:grid-cols-3">
            {paths.map((path) => (
              <TrackedLink
                key={path.href}
                href={path.href}
                ctaId={path.ctaId}
                tracking={{ source: "home_audience_paths" }}
                className="group flex min-h-32 flex-col justify-between gap-4 rounded-2xl border border-[rgba(0,0,0,0.08)] bg-[#F6F5F4] p-5 transition-colors hover:bg-[#ECFDF5] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#084734]"
              >
                <span className="flex items-center justify-between gap-3 text-lg font-bold text-[#111110]">
                  {path.title}
                  <ArrowRight aria-hidden="true" className="h-5 w-5 shrink-0 text-[#084734] transition-transform group-hover:translate-x-1" />
                </span>
                <span className="text-sm leading-relaxed text-[#615D59]">{path.description}</span>
              </TrackedLink>
            ))}
          </nav>
          <p className="mt-5 text-sm text-[#615D59]">
            처음 사용하시나요?{" "}
            <TrackedLink href="/docs/first-week" ctaId="home_audience_first_week" tracking={{ source: "home_audience_paths" }} className="font-semibold text-[#084734] underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#084734]">
              첫 7일 사용 안내 보기
            </TrackedLink>
          </p>
        </div>
      </div>
    </section>
  )
}
