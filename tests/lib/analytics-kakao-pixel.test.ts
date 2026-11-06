import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const consent = vi.hoisted(() => ({ analytics: true, marketing: true }))

vi.mock("@/lib/consent/consent", () => ({
  currentChoice: vi.fn(() => ({ ...consent })),
  getAnonymousId: vi.fn(() => null),
}))

vi.mock("@/lib/analytics-config", () => ({
  GOOGLE_ADS_DEMO_CONVERSION_LABEL: null,
  GOOGLE_ADS_SHOWROOM_CONVERSION_LABEL: null,
  GOOGLE_ADS_ID: "AW-TEST",
  KAKAO_PIXEL_ID: "kakao-test",
  NAVER_LEAD_CONVERSION_TYPE: null,
  NAVER_WCS_ID: null,
}))

import { trackEvent } from "@/lib/analytics"

// kp.js 가 실제로 내주는 메서드만 둔다 — 없는 이름을 부르면 여기서도 TypeError 가 난다.
function createKakaoClient() {
  return {
    pageView: vi.fn(),
    completeRegistration: vi.fn(),
    participation: vi.fn(),
  }
}

function stubBrowser(kakaoPixel: unknown) {
  vi.stubGlobal("window", {
    location: { href: "https://classin.co.kr/", origin: "https://classin.co.kr", pathname: "/" },
    gtag: vi.fn(),
    dataLayer: [],
    kakaoPixel,
  })
  vi.stubGlobal("document", { cookie: "", referrer: "", title: "" })
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("{}")))
  vi.stubGlobal("navigator", { sendBeacon: vi.fn(() => true) })
}

beforeEach(() => {
  consent.analytics = true
  consent.marketing = true
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe("Kakao Pixel", () => {
  it("sends CTA clicks as the SDK's participation event", () => {
    const client = createKakaoClient()
    stubBrowser(vi.fn(() => client))

    expect(() => trackEvent("click_cta", { button: "hero_demo" })).not.toThrow()
    expect(client.participation).toHaveBeenCalledWith({ tag: "click_cta" })
  })

  it("never lets a broken pixel SDK break the click that tracked it", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
    stubBrowser(vi.fn(() => ({})))

    expect(() => trackEvent("click_cta", { button: "hero_demo" })).not.toThrow()
    expect(() => trackEvent("view_resource", { lead_magnet: "academy-system-checklist" })).not.toThrow()
    expect(warn).toHaveBeenCalled()
  })

  it("stays silent without marketing consent", () => {
    consent.marketing = false
    const factory = vi.fn(() => createKakaoClient())
    stubBrowser(factory)

    trackEvent("click_cta", { button: "hero_demo" })
    expect(factory).not.toHaveBeenCalled()
  })
})
