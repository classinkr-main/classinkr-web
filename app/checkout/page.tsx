import type { Metadata } from "next"

import { CheckoutClient, type ProductFamily } from "@/components/checkout/CheckoutClient"
import type { BillingMode } from "@/components/billing/BillingModeTabs"

export const metadata: Metadata = {
  title: "Checkout",
  description:
    "Classin 소프트웨어 플랜 결제와 하드웨어 주문 신청을 한 곳에서 진행하는 체크아웃 페이지입니다.",
  robots: { index: false, follow: false },
}

function pickString(value: string | string[] | undefined) {
  const v = Array.isArray(value) ? value[0] : value
  return typeof v === "string" ? v.trim() : ""
}

function resolveProductFamily(typeParam: string | string[] | undefined): ProductFamily {
  const raw = pickString(typeParam).toLowerCase()
  // ?type=hw 딥링크(하드웨어 랜딩·제품 페이지 CTA)만 하드웨어로 열고, 기본은 소프트웨어.
  if (raw === "hw" || raw === "hardware") return "hw"
  return "sw"
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
  const initialFamily = resolveProductFamily(params?.type)

  return (
    <CheckoutClient
      initialFamily={initialFamily}
      initialMode={initialMode}
      initialQuoteCode={initialQuote || undefined}
    />
  )
}
