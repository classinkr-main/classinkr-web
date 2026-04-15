import type { Metadata } from "next"

import { SoftwareCheckoutClient } from "@/components/billing/SoftwareCheckoutClient"
import type { BillingMode } from "@/components/billing/BillingModeTabs"

export const metadata: Metadata = {
  title: "Checkout",
  description: "ClassIn 소프트웨어 플랜을 카드와 네이버페이로 결제하는 체크아웃 페이지입니다.",
  robots: { index: false, follow: false },
}

function pickString(value: string | string[] | undefined) {
  const v = Array.isArray(value) ? value[0] : value
  return typeof v === "string" ? v.trim() : ""
}

function resolveInitialMode(
  modeParam: string | string[] | undefined,
  hasQuote: boolean
): BillingMode {
  // 견적 코드가 URL 에 실려 온 경우 항상 충전형 탭을 우선.
  // 구독형은 현재 코드 기반 결제를 지원하지 않는다.
  if (hasQuote) return "business"

  const raw = pickString(modeParam).toLowerCase()
  if (raw === "business") return "business"
  if (raw === "subscription") return "subscription"
  return "subscription"
}

export default async function CheckoutPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const params = await searchParams
  const initialQuote = pickString(params?.quote)
  const initialMode = resolveInitialMode(params?.mode, Boolean(initialQuote))
  return (
    <SoftwareCheckoutClient
      initialMode={initialMode}
      initialQuoteCode={initialQuote || undefined}
    />
  )
}
