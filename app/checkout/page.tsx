import type { Metadata } from "next"

import { CheckoutClient, type ProductFamily } from "@/components/checkout/CheckoutClient"
import {
  getKstToday,
  getMaxDesiredDate,
  getMinDesiredDate,
} from "@/components/checkout/request-date"
import type { BillingMode } from "@/components/billing/BillingModeTabs"
import { loadKoreaHolidayDates } from "@/lib/korea-holiday-dates"

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

/**
 * 희망일 달력이 막을 공휴일. 주말은 화면이 직접 계산한다(순수 계산).
 *
 * 원천이 늦거나 자격이 없으면 빈 목록으로 떨어뜨린다 — 공휴일을 못 읽었다고 신청 화면을
 * 닫으면 멀쩡한 신청을 잃는다. 희망일은 담당자와 다시 조율하는 값이라 "덜 막는" 쪽이 맞다.
 */
async function loadDesiredDateHolidays(): Promise<string[]> {
  const todayIso = getKstToday()

  try {
    const holidays = await loadKoreaHolidayDates(
      getMinDesiredDate(todayIso),
      getMaxDesiredDate(todayIso)
    )
    return [...holidays]
  } catch (error) {
    console.error("[checkout] 공휴일 조회 실패 — 주말만 막고 진행:", error)
    return []
  }
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
  const holidayIsoDates = await loadDesiredDateHolidays()

  return (
    <CheckoutClient
      initialFamily={initialFamily}
      initialMode={initialMode}
      initialQuoteCode={initialQuote || undefined}
      holidayIsoDates={holidayIsoDates}
    />
  )
}
