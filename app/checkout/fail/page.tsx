import type { Metadata } from "next"
import { Suspense } from "react"

import { CheckoutFailClient } from "@/components/billing/CheckoutFailClient"

export const metadata: Metadata = {
  title: "Payment Failed",
  robots: { index: false, follow: false },
}

export default function CheckoutFailPage() {
  return (
    <Suspense fallback={null}>
      <CheckoutFailClient />
    </Suspense>
  )
}
