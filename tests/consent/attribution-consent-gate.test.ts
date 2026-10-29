import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { CONSENT_POLICY_VERSION, type ConsentRecord } from "@/lib/consent/consent"
import { collectLeadAttribution } from "@/lib/marketing-attribution"

const ATTRIBUTION_STORAGE_KEY = "classinkr.leadAttribution.v1"

function installBrowser(consent: ConsentRecord | null, url: string) {
  const store = new Map<string, string>()
  const cookie = consent
    ? `cln_consent=${encodeURIComponent(JSON.stringify(consent))}`
    : ""

  vi.stubGlobal("document", { cookie, referrer: "https://search.example/q" })
  vi.stubGlobal("window", {
    location: { href: url },
    localStorage: {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => void store.set(key, value),
      removeItem: (key: string) => void store.delete(key),
    },
  })
  return store
}

const granted: ConsentRecord = {
  v: CONSENT_POLICY_VERSION,
  analytics: true,
  marketing: true,
  ts: 1,
  s: 1,
}
const marketingDenied: ConsentRecord = { ...granted, marketing: false }

const AD_URL = "https://classin.co.kr/?utm_source=google&gclid=ABC123"

afterEach(() => {
  vi.unstubAllGlobals()
})

describe("리드 어트리뷰션 — 마케팅 동의 게이트", () => {
  it("마케팅 동의가 있으면 광고 식별자를 보관한다", () => {
    const store = installBrowser(granted, AD_URL)

    const result = collectLeadAttribution()

    expect(result.gclid).toBe("ABC123")
    expect(result.utmSource).toBe("google")
    expect(JSON.parse(store.get(ATTRIBUTION_STORAGE_KEY)!)).toMatchObject({ gclid: "ABC123" })
  })

  it("동의 전에는 gclid/utm 을 단말에 저장하지 않는다", () => {
    // 회귀 방지: 예전에는 동의 여부와 무관하게 localStorage 에 영구 저장했다.
    const store = installBrowser(null, AD_URL)

    const result = collectLeadAttribution()

    expect(store.has(ATTRIBUTION_STORAGE_KEY)).toBe(false)
    // 사용자가 직접 시작한 문의를 처리하기 위한 현재 페이지 정보는 그대로 전달된다.
    expect(result.gclid).toBe("ABC123")
    expect(result.currentPage).toBe(AD_URL)
  })

  it("마케팅만 거부해도 저장하지 않는다", () => {
    const store = installBrowser(marketingDenied, AD_URL)

    collectLeadAttribution()
    expect(store.has(ATTRIBUTION_STORAGE_KEY)).toBe(false)
  })

  it("동의를 철회하면 이미 저장된 광고 식별자를 지운다", () => {
    const store = installBrowser(granted, AD_URL)
    collectLeadAttribution()
    expect(store.has(ATTRIBUTION_STORAGE_KEY)).toBe(true)

    // 같은 저장소를 유지한 채 동의만 철회한 상태로 다시 호출한다.
    vi.unstubAllGlobals()
    vi.stubGlobal("document", {
      cookie: `cln_consent=${encodeURIComponent(JSON.stringify(marketingDenied))}`,
      referrer: "",
    })
    vi.stubGlobal("window", {
      location: { href: "https://classin.co.kr/pricing" },
      localStorage: {
        getItem: (key: string) => store.get(key) ?? null,
        setItem: (key: string, value: string) => void store.set(key, value),
        removeItem: (key: string) => void store.delete(key),
      },
    })

    collectLeadAttribution()
    expect(store.has(ATTRIBUTION_STORAGE_KEY)).toBe(false)
  })

  it("동의가 있어도 이전 세션의 landingPage 를 유지한다", () => {
    const store = installBrowser(granted, AD_URL)
    collectLeadAttribution()

    vi.unstubAllGlobals()
    vi.stubGlobal("document", { cookie: `cln_consent=${encodeURIComponent(JSON.stringify(granted))}`, referrer: "" })
    vi.stubGlobal("window", {
      location: { href: "https://classin.co.kr/pricing" },
      localStorage: {
        getItem: (key: string) => store.get(key) ?? null,
        setItem: (key: string, value: string) => void store.set(key, value),
        removeItem: (key: string) => void store.delete(key),
      },
    })

    const result = collectLeadAttribution()
    expect(result.landingPage).toBe(AD_URL)
    expect(result.currentPage).toBe("https://classin.co.kr/pricing")
    expect(result.gclid).toBe("ABC123")
  })
})

describe("서버 환경에서는 아무것도 하지 않는다", () => {
  beforeEach(() => {
    vi.stubGlobal("window", undefined)
  })

  it("window 가 없으면 빈 객체", () => {
    expect(collectLeadAttribution()).toEqual({})
  })
})
