import type { Metadata } from "next"
import { Suspense } from "react"

import { CheckoutSuccessClient } from "@/components/billing/CheckoutSuccessClient"

export const metadata: Metadata = {
  title: "Payment Success",
  robots: { index: false, follow: false },
}

export default function CheckoutSuccessPage() {
  return (
    <Suspense fallback={null}>
      <CheckoutSuccessClient />
    </Suspense>
  )
}
