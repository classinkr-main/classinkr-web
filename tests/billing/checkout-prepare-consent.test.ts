import { NextRequest } from "next/server"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({ insert: vi.fn() }))
vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: () => ({ from: () => ({ insert: mocks.insert }) }),
}))
vi.mock("@/lib/billing/fx", () => ({
  getFxRates: vi.fn().mockResolvedValue({ usdKrw: 1400, fetchedAt: "2026-01-01", source: "test" }),
  convertUsdToKrw: (usd: number, rate: number) => usd * rate,
}))
vi.mock("@/lib/server/security-tokens", () => ({ createCheckoutToken: () => "token" }))
vi.mock("@/lib/marketing/server-conversions", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/marketing/server-conversions")>()),
  sendServerConversion: vi.fn().mockResolvedValue(undefined),
}))

import { CONSENT_POLICY_VERSION } from "@/lib/consent/consent"
import { POST } from "@/app/api/billing/checkout/prepare/route"

const attribution = { utmSource: "ad", gclid: "secret-click", landingPage: "https://classin.co.kr/?gclid=secret-click", naverAd: { n_ad: "secret-ad" } }
function request(mode: string, cookie?: string, observe = true) {
  return new NextRequest("https://classin.co.kr/api/billing/checkout/prepare", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-forwarded-for": "203.0.113.123",
      ...(observe ? { "X-Classin-Consent-Observation": "cookie-store-v1" } : {}),
      ...(cookie ? { cookie } : {}),
    },
    body: JSON.stringify({ mode, organizationName: "School", buyerName: "Kim", buyerEmail: "kim@example.com", planId: "standard", billingCycle: "monthly", accountCount: 1, amountKrw: 2000000, attribution }),
  })
}
function cookie(analytics: boolean, marketing: boolean, marker = "m") {
  const value = { v: CONSENT_POLICY_VERSION, analytics, marketing, ts: 1, s: 1, ackAnalytics: "a", ackMarketing: "m" }
  return `cln_consent=${encodeURIComponent(JSON.stringify(value))}; cln_revoke_a=a; cln_revoke_m=${marker}`
}

describe("주문 준비 귀속 동의", () => {
  beforeEach(() => {
    vi.stubEnv("NEXT_PUBLIC_SW_CHECKOUT_ENABLED", "true")
    mocks.insert.mockReset().mockImplementation((row) => ({ select: () => ({ single: async () => ({ data: { ...row, id: "id" }, error: null }) }) }))
  })
  afterEach(() => { vi.unstubAllEnvs() })
  it.each(["subscription", "business"])("%s: 무동의·구버전·철회 뒤에도 결제는 처리하고 귀속을 저장하지 않는다", async (mode) => {
    for (const [value, observed] of [[undefined, true], [`cln_consent=${encodeURIComponent(JSON.stringify({ v: CONSENT_POLICY_VERSION, s: 1, analytics: true, marketing: true }))}`, true], [cookie(true, false), true], [cookie(true, true), false], [cookie(true, true, "revoked"), true]] as const) {
      const response = await POST(request(mode, value, observed))
      expect(response.status).toBe(201)
      expect(mocks.insert.mock.lastCall?.[0].raw_prepare.attribution).toBeNull()
      expect(mocks.insert.mock.lastCall?.[0].buyer_email).toBe("kim@example.com")
    }
  })
  it.each(["subscription", "business"])("%s: 마케팅 동의만으로 광고 귀속을 저장할 수 있다", async (mode) => {
    const response = await POST(request(mode, cookie(false, true)))
    expect(response.status).toBe(201)
    expect(mocks.insert.mock.lastCall?.[0].raw_prepare.attribution).toEqual(attribution)
  })
})
