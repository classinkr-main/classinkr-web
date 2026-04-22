"use client"

import { useState } from "react"
import Link from "next/link"
import { BillingModeTabs, type BillingMode } from "@/components/billing/BillingModeTabs"
import { BusinessRechargePanel } from "@/components/billing/BusinessRechargePanel"
import { SubscriptionCheckoutPanel } from "@/components/billing/SubscriptionCheckoutPanel"

interface Props {
  initialMode?: BillingMode
  initialQuoteCode?: string
}

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
    <div className="min-h-screen bg-white font-sans text-[#111110]">
      <section className="mx-auto max-w-[1320px] px-4 py-4 md:px-8 md:py-6">
        <div className="mb-4 flex items-center gap-2">
          <Link href="/" className="text-sm font-semibold text-[#084734] hover:underline">
            ClassIn
          </Link>
          <span className="text-[#084734]/25">/</span>
          <span className="text-sm font-medium text-[#44514A]">Software Checkout</span>
        </div>

        <div className="mb-4 max-w-md">
          <BillingModeTabs mode={mode} onChange={handleModeChange} />
        </div>

        {mode === "subscription" ? (
          <SubscriptionCheckoutPanel />
        ) : (
          <BusinessRechargePanel initialQuoteCode={initialQuoteCode} />
        )}
      </section>
    </div>
  )
}
