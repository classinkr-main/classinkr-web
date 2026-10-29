import { readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { afterEach, describe, expect, it, vi } from "vitest"

import {
  hidesPublicChrome,
  isAnalyticsTagExcludedPath,
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

/**
 * 공개 크롬과 태그는 범위가 다르다(옛 lib/analytics-paths.ts 테스트를 옮겨 왔다).
 *
 * `/checkout` 은 크롬(헤더·푸터·챗봇)을 걷은 터널이다. round2 D11(2026-09-22)은 여기서
 * GTM·page_view·Pixel·동의 배너를 되살렸지만, 10-28 추적 경계 정리가 gtag 만 남기는 쪽으로
 * 정했고 통합 병합은 그 결정을 따른다 — 결제 전환은 gtag 와 서버 전환으로 나간다.
 */
describe("경로별 크롬·태그 범위", () => {
  it("/checkout 은 크롬을 걷고 gtag 만 남긴다 — GTM·페이지뷰·픽셀은 끈다", () => {
    for (const path of ["/checkout", "/checkout/success", "/checkout/fail"]) {
      expect(hidesPublicChrome(path), path).toBe(true)
      expect(isTrackingExcludedPath(path), path).toBe(false)
      expect(isAnalyticsTagExcludedPath(path), path).toBe(true)
    }
  })

  it("영수증과 어드민은 크롬도 계측도 끈다", () => {
    for (const path of ["/receipt/abc", "/admin", "/admin/crm/customers/intake"]) {
      expect(hidesPublicChrome(path), path).toBe(true)
      expect(isTrackingExcludedPath(path), path).toBe(true)
      expect(isAnalyticsTagExcludedPath(path), path).toBe(true)
    }
  })

  it("공유·수신거부·계정 화면은 크롬을 두되 태그는 끈다", () => {
    for (const path of ["/share/quote/abc", "/unsubscribe", "/account", "/login"]) {
      expect(hidesPublicChrome(path), path).toBe(false)
      expect(isTrackingExcludedPath(path), path).toBe(true)
      expect(isAnalyticsTagExcludedPath(path), path).toBe(true)
    }
  })

  it("공개 화면은 크롬도 계측도 켠다", () => {
    for (const path of ["/", "/contact", "/showroom", "/l/omo1", "/pricing"]) {
      expect(hidesPublicChrome(path), path).toBe(false)
      expect(isTrackingExcludedPath(path), path).toBe(false)
      expect(isAnalyticsTagExcludedPath(path), path).toBe(false)
    }
  })

  it("태그 제외 판정은 AppChrome 의 showAnalytics 식(크롬 있음 && 추적 제외 아님)과 같은 집합이다", () => {
    for (const path of [
      "/",
      "/contact",
      "/checkout",
      "/checkout/success",
      "/receipt/x",
      "/receiptx",
      "/admin-preview",
      "/share/quote/t",
      "/authors",
      "/auth/callback",
    ]) {
      const showAnalytics = !hidesPublicChrome(path) && !isTrackingExcludedPath(path)
      expect(isAnalyticsTagExcludedPath(path), path).toBe(!showAnalytics)
    }
  })

  it("빈 입력은 어느 쪽으로도 막지 않는다", () => {
    expect(hidesPublicChrome("")).toBe(false)
    expect(hidesPublicChrome(null)).toBe(false)
    expect(isAnalyticsTagExcludedPath(undefined)).toBe(false)
  })
})

describe("계측 스크립트의 경로 판정 출처", () => {
  /**
   * 소스 텍스트 고정(tests/admin/admin-gtag-scope.test.ts 와 같은 패턴). 경로 목록을 복사해
   * 들고 있는 스크립트가 두 번 나왔다 — Meta Pixel, 그리고 나중에 병합된 네이버 로그분석.
   * 복사본은 AppChrome 의 판정이 바뀌어도 따라오지 않아 그 스크립트만 조용히 꺼진다.
   */
  const componentsDir = join(__dirname, "..", "..", "components")
  const scripts = readdirSync(componentsDir).filter((name) => name.endsWith("Script.tsx"))
  // 카카오 픽셀은 이름 규칙 밖(AnalyticsProviders)이라 따로 넣는다.
  const guardedTags = [...scripts.filter((name) => name !== "GoogleAdsScript.tsx"), "AnalyticsProviders.tsx"]

  it("최상위 계측 스크립트가 있다 — 이름 규칙이 바뀌면 이 검사가 빈손이 된다", () => {
    expect(scripts).toEqual(
      expect.arrayContaining([
        "GTMScript.tsx",
        "GoogleAdsScript.tsx",
        "MetaPixelScript.tsx",
        "NaverAnalyticsScript.tsx",
      ])
    )
  })

  it("/checkout·/receipt 판정을 직접 들지 않는다 — lib/tracking-paths.ts 를 쓴다", () => {
    for (const name of [...scripts, "AnalyticsProviders.tsx"]) {
      const source = readFileSync(join(componentsDir, name), "utf8")
      expect(source, name).not.toMatch(/startsWith\(\s*["'`]\/(checkout|receipt)/)
    }
  })

  it("GTM·Meta·네이버·카카오 가드는 isAnalyticsTagExcludedPath 하나를 쓴다", () => {
    for (const name of guardedTags) {
      const source = readFileSync(join(componentsDir, name), "utf8")
      expect(source, name).toContain("isAnalyticsTagExcludedPath(pathname)")
    }
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
