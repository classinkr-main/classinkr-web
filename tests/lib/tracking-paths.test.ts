import { afterEach, describe, expect, it, vi } from "vitest"

import {
  isPassthroughTrackingParam,
  isTrackingExcludedPath,
  sanitizeTrackingPath,
  sanitizeTrackingTarget,
  sanitizeTrackingUrl,
  stashContactPrefill,
  takeContactPrefill,
} from "@/lib/tracking-paths"

function createStorage() {
  const map = new Map<string, string>()
  return {
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => {
      map.set(key, String(value))
    },
    removeItem: (key: string) => {
      map.delete(key)
    },
  }
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

describe("isTrackingExcludedPath", () => {
  it.each([
    "/admin",
    "/admin/crm/customers/leads",
    "/share/quote/abc123token",
    "/share/contract/xyz",
    "/unsubscribe",
    "/account",
    "/auth/callback",
    "/login",
    "/signup",
    "/forgot-password",
    "/receipt/order_123",
  ])("excludes %s", (pathname) => {
    expect(isTrackingExcludedPath(pathname)).toBe(true)
  })

  it.each(["/", "/contact", "/pricing", "/pricing/simulator/krw", "/blog/post", "/showroom", "/authors", "/shareholders"])(
    "keeps %s tracked",
    (pathname) => {
      expect(isTrackingExcludedPath(pathname)).toBe(false)
    }
  )

  it("keeps /checkout tracked so the purchase conversion still reaches Google", () => {
    expect(isTrackingExcludedPath("/checkout")).toBe(false)
    expect(isTrackingExcludedPath("/checkout/success")).toBe(false)
  })

  it("matches the legacy loose /admin guard (startsWith without a boundary)", () => {
    expect(isTrackingExcludedPath("/admin-preview")).toBe(true)
  })

  it("treats empty input as not excluded", () => {
    expect(isTrackingExcludedPath("")).toBe(false)
    expect(isTrackingExcludedPath(null)).toBe(false)
  })
})

describe("sanitizeTrackingUrl", () => {
  it("drops prefill, email and token query params", () => {
    expect(
      sanitizeTrackingUrl("https://classin.kr/contact?source=chatbot&prefill=%EB%AC%B8%EC%9D%98+010-1234-5678")
    ).toBe("https://classin.kr/contact")
    expect(sanitizeTrackingUrl("https://classin.kr/unsubscribe?email=a%40b.com")).toBe(
      "https://classin.kr/unsubscribe"
    )
    expect(
      sanitizeTrackingUrl(
        "https://classin.kr/checkout/success?checkoutToken=tok_1&paymentKey=pay_1&orderId=o1"
      )
    ).toBe("https://classin.kr/checkout/success")
  })

  it("keeps ad attribution params in their original order", () => {
    expect(
      sanitizeTrackingUrl(
        "https://classin.kr/l/x?prefill=hi&utm_source=naver&utm_medium=cpc&gclid=G1&gbraid=GB&wbraid=WB&fbclid=F1&msclkid=M1&n_media=27758&n_query=%ED%81%B4%EB%9E%98%EC%8A%A4%EC%9D%B8&topic=a"
      )
    ).toBe(
      "https://classin.kr/l/x?utm_source=naver&utm_medium=cpc&gclid=G1&gbraid=GB&wbraid=WB&fbclid=F1&msclkid=M1&n_media=27758&n_query=%ED%81%B4%EB%9E%98%EC%8A%A4%EC%9D%B8"
    )
  })

  it("drops an allowed param whose value carries an email address", () => {
    expect(sanitizeTrackingUrl("https://classin.kr/?utm_term=kim%40example.com&utm_source=mail")).toBe(
      "https://classin.kr/?utm_source=mail"
    )
  })

  it("drops hash and credentials", () => {
    expect(sanitizeTrackingUrl("https://user:pw@classin.kr/auth#access_token=secret")).toBe(
      "https://classin.kr/auth"
    )
  })

  it("resolves relative input against the given base", () => {
    expect(sanitizeTrackingUrl("/pricing?utm_campaign=fall&q=x", "https://classin.kr")).toBe(
      "https://classin.kr/pricing?utm_campaign=fall"
    )
  })

  it("returns an empty string for non-http(s) or unparsable input", () => {
    expect(sanitizeTrackingUrl("")).toBe("")
    expect(sanitizeTrackingUrl(null)).toBe("")
    expect(sanitizeTrackingUrl("mailto:classinkr@classin.com")).toBe("")
    expect(sanitizeTrackingUrl("/relative-without-base")).toBe("")
  })

  it("uses window.location.origin as the default base in the browser", () => {
    vi.stubGlobal("window", { location: { origin: "https://classin.kr" } })
    expect(sanitizeTrackingUrl("/contact?prefill=x")).toBe("https://classin.kr/contact")
  })
})

describe("sanitizeTrackingPath", () => {
  it("keeps the pathname verbatim and filters the query", () => {
    expect(sanitizeTrackingPath("/contact?prefill=abc&utm_source=meta#form")).toBe(
      "/contact?utm_source=meta"
    )
    expect(sanitizeTrackingPath("/blog/한글-글?category=x")).toBe("/blog/한글-글")
    expect(sanitizeTrackingPath("/")).toBe("/")
    expect(sanitizeTrackingPath("")).toBe("/")
  })
})

describe("sanitizeTrackingTarget", () => {
  it("reduces mailto/tel targets to their scheme", () => {
    expect(sanitizeTrackingTarget("mailto:classinkr@classin.com")).toBe("mailto:")
    expect(sanitizeTrackingTarget("tel:02-6958-8566")).toBe("tel:")
  })

  it("sanitizes internal and absolute link targets", () => {
    expect(sanitizeTrackingTarget("/contact?topic=a&prefill=b")).toBe("/contact")
    expect(sanitizeTrackingTarget("https://classin.kr/x?utm_source=a&token=b")).toBe(
      "https://classin.kr/x?utm_source=a"
    )
  })

  it("leaves non-URL labels alone", () => {
    expect(sanitizeTrackingTarget("contact_form")).toBe("contact_form")
    expect(sanitizeTrackingTarget("#contact-form")).toBe("#contact-form")
  })
})

describe("isPassthroughTrackingParam", () => {
  it("recognises the attribution keys case-insensitively", () => {
    expect(isPassthroughTrackingParam("UTM_Source")).toBe(true)
    expect(isPassthroughTrackingParam("n_keyword")).toBe(true)
    expect(isPassthroughTrackingParam("gclid")).toBe(true)
    expect(isPassthroughTrackingParam("prefill")).toBe(false)
    expect(isPassthroughTrackingParam("email")).toBe(false)
    expect(isPassthroughTrackingParam("")).toBe(false)
  })
})

describe("contact prefill handoff", () => {
  it("passes the draft once through sessionStorage", () => {
    vi.stubGlobal("window", { sessionStorage: createStorage() })
    stashContactPrefill("  학원 운영 상담 요약  ")
    expect(takeContactPrefill()).toBe("학원 운영 상담 요약")
    expect(takeContactPrefill()).toBeNull()
  })

  it("discards a stale draft", () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-10-28T00:00:00Z"))
    vi.stubGlobal("window", { sessionStorage: createStorage() })
    stashContactPrefill("오래된 요약")
    vi.setSystemTime(new Date("2026-10-28T01:00:00Z"))
    expect(takeContactPrefill()).toBeNull()
  })

  it("survives a blocked storage", () => {
    vi.stubGlobal("window", {
      sessionStorage: {
        getItem: () => {
          throw new Error("blocked")
        },
        setItem: () => {
          throw new Error("blocked")
        },
        removeItem: () => {},
      },
    })
    expect(() => stashContactPrefill("x")).not.toThrow()
    expect(takeContactPrefill()).toBeNull()
  })
})
