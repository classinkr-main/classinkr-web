"use client"

import { Suspense, useState } from "react"
import Link from "next/link"

import { SoftwareCheckoutClient } from "@/components/billing/SoftwareCheckoutClient"
import { HardwareCheckoutPanel } from "@/components/checkout/HardwareCheckoutPanel"
import type { BillingMode } from "@/components/billing/BillingModeTabs"
import { trackEvent } from "@/lib/analytics"

export type ProductFamily = "sw" | "hw"

const FAMILY_TABS: Array<{ id: ProductFamily; label: string }> = [
  { id: "sw", label: "소프트웨어" },
  { id: "hw", label: "하드웨어" },
]

const FAMILY_COPY: Record<ProductFamily, { eyebrow: string; title: string; description: string }> = {
  sw: {
    eyebrow: "Software Checkout",
    title: "결제하기",
    description:
      "구독형 Learning Space는 USD 월/연 단위로, 충전형 Business는 원화 선충전 방식으로 결제합니다.",
  },
  hw: {
    eyebrow: "Hardware",
    title: "하드웨어 도입",
    description:
      "전자칠판 · AI 카메라 · 올인원 녹화 스튜디오 구성을 담아보세요. 온라인 결제는 준비 중이라, 도입 신청을 남기시면 담당자가 결제와 설치 일정을 함께 진행합니다.",
  },
}

interface Props {
  initialFamily?: ProductFamily
  initialMode?: BillingMode
  initialQuoteCode?: string
}

/**
 * /checkout 의 상품군 셸. 소프트웨어(기존 결제 흐름)와 하드웨어(도입 신청) 두 갈래를
 * 같은 페이지 크롬 아래에 둔다. URL 은 ?type=sw|hw 로 딥링크된다.
 */
export function CheckoutClient({
  initialFamily = "sw",
  initialMode,
  initialQuoteCode,
}: Props) {
  const [family, setFamily] = useState<ProductFamily>(initialFamily)
  const copy = FAMILY_COPY[family]

  function handleFamilyChange(next: ProductFamily) {
    if (next === family) return
    setFamily(next)
    trackEvent("click_cta", {
      button: "checkout_product_family",
      page: "/checkout",
      product_family: next === "hw" ? "hardware" : "software",
    })

    if (typeof window === "undefined") return
    const url = new URL(window.location.href)
    url.searchParams.set("type", next)
    window.history.replaceState(null, "", url.toString())
  }

  return (
    <div className="min-h-screen bg-[#FAFAF8] font-sans text-[#111110]">
      <header className="border-b border-black/5 bg-white">
        <div className="container mx-auto flex items-center justify-between px-4 py-4 md:px-8">
          <Link href="/" className="text-[15px] font-semibold tracking-tight text-[#084734]">
            Classin
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
        <div
          role="tablist"
          aria-label="상품군"
          className="mb-8 inline-flex rounded-lg border border-black/[0.08] bg-[#F6F5F4] p-1"
        >
          {FAMILY_TABS.map((tab) => {
            const active = tab.id === family
            return (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => handleFamilyChange(tab.id)}
                className={`rounded-md px-5 py-1.5 text-[13px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#084734] ${
                  active
                    ? "bg-white text-[#111110] shadow-[0_1px_2px_rgba(0,0,0,0.06)]"
                    : "text-[#7C8A83] hover:text-[#44514A]"
                }`}
              >
                {tab.label}
              </button>
            )
          })}
        </div>

        <div className="mb-10 max-w-2xl">
          <p className="text-[12px] font-semibold uppercase tracking-[0.16em] text-[#7C8A83]">
            {copy.eyebrow}
          </p>
          <h1 className="mt-2 text-[32px] font-semibold leading-[1.15] tracking-tight text-[#111110] md:text-[40px]">
            {copy.title}
          </h1>
          <p className="mt-3 text-[15px] leading-relaxed text-[#615D59]">{copy.description}</p>
        </div>

        {family === "sw" ? (
          <SoftwareCheckoutClient initialMode={initialMode} initialQuoteCode={initialQuoteCode} />
        ) : (
          // HardwareCheckoutPanel 은 ?sku= 딥링크를 useSearchParams 로 읽는다 —
          // 프리렌더 경로에서 Suspense 경계를 요구하므로 여기서 감싼다.
          <Suspense fallback={null}>
            <HardwareCheckoutPanel />
          </Suspense>
        )}
      </main>
    </div>
  )
}
