"use client"

import { useState } from "react"
import Link from "next/link"
import { Wallet } from "lucide-react"

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
    <div className="min-h-screen bg-[#F5F8F4] font-sans text-slate-900">
      <div className="relative isolate overflow-hidden">
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute left-[-12%] top-[-8%] h-[28rem] w-[28rem] rounded-full bg-[#CFF8E2] opacity-70 blur-3xl" />
          <div className="absolute bottom-[-12%] right-[-8%] h-[24rem] w-[24rem] rounded-full bg-[#ECFDF5] opacity-90 blur-3xl" />
          <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[#084734]/25 to-transparent" />
        </div>

        <section className="container relative mx-auto px-4 py-4 md:px-8 md:py-6">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <Link
                href="/"
                className="inline-flex items-center rounded-full border border-[#084734]/10 bg-white/85 px-3 py-1.5 text-sm font-semibold text-[#084734] shadow-sm backdrop-blur"
              >
                ClassIn
              </Link>
              <span className="inline-flex items-center gap-2 rounded-full border border-[#084734]/10 bg-[#ECFDF5] px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.16em] text-[#084734]">
                <Wallet className="h-3.5 w-3.5" />
                Software Checkout
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-2 text-xs text-[#4C665B]">
              {["카드 + 네이버페이", "토스 결제위젯", "서버 confirm 검증"].map((item) => (
                <span
                  key={item}
                  className="rounded-full border border-[#084734]/10 bg-white/80 px-3 py-1.5 shadow-sm backdrop-blur"
                >
                  {item}
                </span>
              ))}
            </div>
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
    </div>
  )
}
