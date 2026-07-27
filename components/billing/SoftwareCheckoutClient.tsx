"use client"

import { useState } from "react"

import { BillingModeTabs, type BillingMode } from "@/components/billing/BillingModeTabs"
import { BusinessRechargePanel } from "@/components/billing/BusinessRechargePanel"
import { SubscriptionCheckoutPanel } from "@/components/billing/SubscriptionCheckoutPanel"

interface Props {
  initialMode?: BillingMode
  initialQuoteCode?: string
}

/**
 * 소프트웨어 결제 본문. 페이지 크롬(헤더·타이틀·상품군 전환)은
 * components/checkout/CheckoutClient.tsx 가 감싼다.
 */
export function SoftwareCheckoutClient({
  initialMode = "subscription",
  initialQuoteCode,
}: Props) {
  const [mode, setMode] = useState<BillingMode>(initialMode)

  function handleModeChange(next: BillingMode) {
    setMode(next)

    if (typeof window === "undefined") return
    const url = new URL(window.location.href)
    url.searchParams.set("mode", next)
    window.history.replaceState(null, "", url.toString())
  }

  return (
    <div>
      <div className="mb-8 max-w-md">
        <BillingModeTabs mode={mode} onChange={handleModeChange} />
      </div>

      {mode === "subscription" ? (
        <SubscriptionCheckoutPanel />
      ) : (
        <BusinessRechargePanel initialQuoteCode={initialQuoteCode} />
      )}
    </div>
  )
}
