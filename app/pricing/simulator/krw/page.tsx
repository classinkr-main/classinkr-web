import Link from "next/link"
import { ArrowLeft } from "lucide-react"

import { PricingCalculator } from "@/components/sections/PricingCalculator"
import { createPublicMetadata } from "@/lib/seo"

const KRW_EXCHANGE_RATES = {
  cnyToKrw: 200,
  usdToKrw: 1500,
} as const

export const metadata = createPublicMetadata({
  title: "원화 요금 시뮬레이터",
  description: "1 CNY=200원, 1 USD=1,500원 기준으로 Classin 소프트웨어 예상 요금을 비교합니다.",
  path: "/pricing/simulator/krw",
  noIndex: true,
})

export default function PricingSimulatorKrwPage() {
  return (
    <main className="min-h-screen bg-[#F6F5F4] px-4 pb-20 pt-32 text-[#111110] sm:px-6 lg:pb-24 lg:pt-36">
      <div className="mx-auto max-w-6xl">
        <Link
          href="/pricing/simulator"
          className="inline-flex items-center gap-2 text-[13px] font-semibold text-[#084734] transition-colors hover:text-[#065c41]"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          기본 시뮬레이터로 돌아가기
        </Link>

        <div className="mt-8 max-w-3xl">
          <p className="text-[12px] font-semibold uppercase tracking-[0.18em] text-[#084734]/70">
            Pricing Simulator KRW
          </p>
          <h1 className="mt-3 text-[2.35rem] font-semibold leading-[1.08] tracking-tight sm:text-5xl">
            원화 기준으로 월 예상 요금을 비교합니다.
          </h1>
          <p className="mt-5 max-w-2xl text-[15px] leading-7 text-[#615D59] sm:text-base">
            1 CNY는 200원, 1 USD는 1,500원으로 환산해 Business 충전형과 Learning Space
            구독형을 같은 원화 기준에서 확인하세요.
          </p>
        </div>

        <section className="mt-10" aria-label="Classin 원화 요금 시뮬레이터">
          <PricingCalculator displayMode="krw" exchangeRates={KRW_EXCHANGE_RATES} />
        </section>
      </div>
    </main>
  )
}
