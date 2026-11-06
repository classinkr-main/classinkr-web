import { PricingViewTracker } from "@/components/PricingViewTracker"
import { createPublicMetadata } from "@/lib/seo"

import { PRICING_DESCRIPTION } from "./pricing-copy"

export const metadata = createPublicMetadata({
  title: "클래스인 요금제·도입 견적",
  description: PRICING_DESCRIPTION,
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
