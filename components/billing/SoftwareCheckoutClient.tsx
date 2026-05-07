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
    <div className="min-h-screen bg-[#FAFAF8] font-sans text-[#111110]">
      <header className="border-b border-black/5 bg-white">
        <div className="container mx-auto flex items-center justify-between px-4 py-4 md:px-8">
          <Link
            href="/"
            className="text-[15px] font-semibold tracking-tight text-[#084734]"
          >
            ClassIn
          </Link>
          <Link
            href="/contact#contact-form"
            className="text-[13px] font-medium text-[#615D59] transition-colors hover:text-[#084734]"
          >
            도입 상담
          </Link>
        </div>
      </header>

      <main className="container mx-auto px-4 py-10 md:px-8 md:py-14">
        <div className="mb-10 max-w-2xl">
          <p className="text-[12px] font-semibold uppercase tracking-[0.16em] text-[#7C8A83]">
            Software Checkout
          </p>
          <h1 className="mt-2 text-[32px] font-semibold leading-[1.15] tracking-tight text-[#111110] md:text-[40px]">
            결제하기
          </h1>
          <p className="mt-3 text-[15px] leading-relaxed text-[#615D59]">
            구독형 Learning Space는 USD 월/연 단위로, 충전형 Business는 CNY 선충전 방식으로 결제합니다.
          </p>
        </div>

        <div className="mb-8 max-w-md">
          <BillingModeTabs mode={mode} onChange={handleModeChange} />
        </div>

        {mode === "subscription" ? (
          <SubscriptionCheckoutPanel />
        ) : (
          <BusinessRechargePanel initialQuoteCode={initialQuoteCode} />
        )}
      </main>
    </div>
  )
}
