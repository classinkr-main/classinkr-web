import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

import { resolveContactLinkLocation } from "@/components/ContactLinkTracker"
import { getPricingSurface } from "@/components/PricingViewTracker"

/**
 * GA4 이벤트 설계(generate_lead·보조 이벤트·URL 정화)의 화면 배선을 고정한다.
 * 저장소에 DOM 테스트 환경이 없어 순수 함수는 직접, 배선은 소스 계약으로 본다
 * (tests/admin/admin-gtag-scope.test.ts 와 같은 방식).
 */

const projectRoot = join(__dirname, "..", "..")
const read = (relativePath: string) => readFileSync(join(projectRoot, relativePath), "utf8")

describe("getPricingSurface", () => {
  it.each([
    ["/pricing", "pricing"],
    ["/pricing/simulator", "pricing_simulator"],
    ["/pricing/simulator/krw", "pricing_simulator_krw"],
    ["/pricing/simulator/krw/", "pricing_simulator_krw"],
    ["", "pricing"],
  ])("%s → %s", (pathname, surface) => {
    expect(getPricingSurface(pathname)).toBe(surface)
  })
})

describe("resolveContactLinkLocation", () => {
  const anchor = (trackLocation: string | undefined, landmark: string | null) =>
    ({
      dataset: { trackLocation },
      closest: (selector: string) => (selector === landmark ? {} : null),
    }) as unknown as HTMLAnchorElement

  it("prefers the explicit data-track-location label", () => {
    expect(resolveContactLinkLocation(anchor("contact_page", "footer"))).toBe("contact_page")
  })

  it("falls back to the surrounding landmark, then unknown", () => {
    expect(resolveContactLinkLocation(anchor(undefined, "footer"))).toBe("footer")
    expect(resolveContactLinkLocation(anchor(undefined, "header"))).toBe("header")
    expect(resolveContactLinkLocation(anchor(undefined, null))).toBe("unknown")
  })
})

describe("lead submission wiring", () => {
  const leadForms = [
    ["app/contact/page.tsx", 'formType: "contact"'],
    ["components/sections/DemoModal.tsx", 'formType: "demo"'],
    ["components/events/EventSignupModal.tsx", 'formType: "event"'],
    ["components/showroom/ShowroomBookingForm.tsx", 'formType: "showroom"'],
    ["components/checkout/CheckoutRequestForm.tsx", 'formType: "checkout_request"'],
  ] as const

  it.each(leadForms)("%s reports the lead through trackLeadSubmitted", (file, formType) => {
    const source = read(file)
    expect(source).toContain("trackLeadSubmitted({")
    expect(source).toContain(formType)
    expect(source).toContain("dedupeKey:")
    // 직접 발화하면 stored=false·중복 방지를 건너뛴다.
    expect(source).not.toContain('trackEvent("submit_demo_request"')
    expect(source).not.toContain("trackDemoRequestAdsConversion(")
  })

  it("forms whose server response carries stored pass it through", () => {
    for (const file of [
      "app/contact/page.tsx",
      "components/sections/DemoModal.tsx",
      "components/events/EventSignupModal.tsx",
    ]) {
      expect(read(file)).toContain("stored: data.stored,")
    }
  })
})

describe("URL hygiene wiring", () => {
  it("the chatbot no longer puts the conversation draft in the contact URL", () => {
    const source = read("components/ui/FloatingChatbot.tsx")
    expect(source).not.toMatch(/prefill:\s*draft/)
    expect(source).toContain("stashContactPrefill(draft)")
  })

  it("the contact page reads the stored draft first and strips ?prefill= from the address", () => {
    const source = read("app/contact/page.tsx")
    expect(source).toContain("takeContactPrefill() ?? prefillParam")
    expect(source).toContain('params.delete("prefill")')
    expect(source).toContain("window.history.replaceState(")
  })

  it("the contact page phone number is a tracked tel: link", () => {
    // 직접 연락 블록은 components/contact/ContactDirectChannels.tsx 로 떼어냈다(Phase D5).
    expect(read("app/contact/page.tsx")).toContain("<ContactDirectChannels />")
    const source = read("components/contact/ContactDirectChannels.tsx")
    expect(source).toMatch(/href="tel:02-6958-8566"\s+data-track-location="contact_page"/)
    expect(source).toMatch(/href="mailto:classinkr@classin\.com"\s+data-track-location="contact_page"/)
  })

  it("PageViewTracker dedupes on the sanitized path only (no consent flag)", () => {
    const source = read("components/PageViewTracker.tsx")
    expect(source).not.toContain("::analytics=")
    expect(source).toContain("sanitizeTrackingPath(")
    expect(source).toContain("setGooglePageContext(")
  })

  it("AppChrome mounts the contact link tracker with the other public analytics", () => {
    const source = read("components/AppChrome.tsx")
    expect(source).toContain("<ContactLinkTracker />")
    expect(source).toContain("const showAnalytics = showPublicChrome && !trackingExcluded")
  })

  it("the pricing layout mounts PricingViewTracker for every pricing surface", () => {
    expect(read("app/pricing/layout.tsx")).toContain("<PricingViewTracker />")
  })
})
