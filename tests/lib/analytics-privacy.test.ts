import { afterEach, describe, expect, it, vi } from "vitest"

import { isSensitiveTrackingPath } from "@/lib/analytics-path"
import { applyConsentMode } from "@/lib/consent/consent"
import { trackEvent } from "@/lib/analytics"

afterEach(() => vi.unstubAllGlobals())

describe("tracking privacy boundaries", () => {
  it.each(["/share/quote/token", "/share/contract/token", "/receipt/order", "/checkout/success", "/unsubscribe", "/admin", "/account", "/auth/callback", "/login"])("excludes %s", (path) => {
    expect(isSensitiveTrackingPath(path)).toBe(true)
  })

  it("does not mistake unrelated path prefixes for sensitive routes", () => {
    expect(isSensitiveTrackingPath("/shared-resources")).toBe(false)
    expect(isSensitiveTrackingPath("/resources")).toBe(false)
  })

  it("does not send application events while a sensitive page is open", () => {
    const gtag = vi.fn()
    const dataLayer: unknown[] = []
    vi.stubGlobal("window", { location: { pathname: "/share/quote/example" }, gtag, dataLayer })
    vi.stubGlobal("document", { cookie: "" })
    trackEvent("click_cta", { button: "example" })
    expect(gtag).not.toHaveBeenCalled()
    expect(dataLayer).toHaveLength(0)
  })

  it("revokes Meta consent even when Google gtag is absent", () => {
    const fbq = vi.fn()
    vi.stubGlobal("window", { fbq })
    vi.stubGlobal("document", {})
    applyConsentMode({ analytics: false, marketing: false })
    expect(fbq).toHaveBeenCalledWith("consent", "revoke")
    applyConsentMode({ analytics: false, marketing: true })
    expect(fbq).toHaveBeenLastCalledWith("consent", "grant")
  })
})
