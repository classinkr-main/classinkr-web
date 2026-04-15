import type { Metadata } from "next"

import { SoftwareCheckoutClient } from "@/components/billing/SoftwareCheckoutClient"

export const metadata: Metadata = {
  title: "Checkout",
  description: "ClassIn 소프트웨어 플랜을 카드와 네이버페이로 결제하는 체크아웃 페이지입니다.",
  robots: { index: false, follow: false },
}

export default function CheckoutPage() {
  return <SoftwareCheckoutClient />
}
