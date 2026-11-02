import { PricingViewTracker } from "@/components/PricingViewTracker"
import { createPublicMetadata } from "@/lib/seo"

export const metadata = createPublicMetadata({
  title: "요금제",
  description:
    "학원 규모와 필요에 맞는 Classin 요금제를 확인하세요. 합리적인 가격으로 학원 운영의 모든 것을 해결할 수 있습니다.",
  path: "/pricing",
})

export default function PricingLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {/* /pricing·/pricing/simulator·/pricing/simulator/krw 공통 — 화면별 pricing_view 1회 */}
      <PricingViewTracker />
      {children}
    </>
  )
}
