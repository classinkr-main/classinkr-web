import Link from "next/link"
import { ArrowLeft } from "lucide-react"

import { PricingCalculator } from "@/components/sections/PricingCalculator"
import { createPublicMetadata } from "@/lib/seo"

export const metadata = createPublicMetadata({
  title: "요금 시뮬레이터",
  description: "수업 운영 패턴을 입력해 Classin 소프트웨어 예상 요금을 비교합니다.",
  path: "/pricing/simulator",
  noIndex: true,
})

export default function PricingSimulatorPage() {
  return (
    <main className="min-h-screen bg-[#F6F5F4] px-4 pb-20 pt-32 text-[#111110] sm:px-6 lg:pb-24 lg:pt-36">
      <div className="mx-auto max-w-6xl">
        <Link
          href="/pricing"
          className="inline-flex items-center gap-2 text-[13px] font-semibold text-[#084734] transition-colors hover:text-[#065c41]"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          요금 안내로 돌아가기
        </Link>

        <div className="mt-8 max-w-3xl">
          <p className="text-[12px] font-semibold uppercase tracking-[0.18em] text-[#084734]/70">
            Pricing Simulator
          </p>
          <h1 className="mt-3 text-[2.35rem] font-semibold leading-[1.08] tracking-tight sm:text-5xl">
            학원 운영 패턴에 맞춰 월 예상 요금을 비교합니다.
          </h1>
          <p className="mt-5 max-w-2xl text-[15px] leading-7 text-[#615D59] sm:text-base">
            수업 인원, 강사 수, 수업 횟수와 옵션을 조정해 구독형과 충전형 예상 금액을 확인하세요.
          </p>
        </div>

        <section className="mt-10" aria-label="Classin 요금 시뮬레이터">
          <PricingCalculator />
        </section>
      </div>
    </main>
  )
}
