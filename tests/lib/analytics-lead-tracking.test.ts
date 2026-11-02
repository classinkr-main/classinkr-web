import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest"

const consent = vi.hoisted(() => ({ analytics: false, marketing: false }))

vi.mock("@/lib/consent/consent", () => ({
  currentChoice: vi.fn(() => ({ ...consent })),
  getAnonymousId: vi.fn(() => null),
}))

vi.mock("@/lib/analytics-config", () => ({
  GOOGLE_ADS_DEMO_CONVERSION_LABEL: "demo-label",
  GOOGLE_ADS_ID: "AW-TEST",
  KAKAO_PIXEL_ID: null,
  NAVER_LEAD_CONVERSION_TYPE: null,
  NAVER_WCS_ID: null,
}))

import {
  setGooglePageContext,
  trackEvent,
  trackFormStart,
  trackInternalEvent,
  trackLeadSubmitted,
} from "@/lib/analytics"

type GtagCall = [string, string | Record<string, unknown>, Record<string, unknown>?]

function createStorage() {
  const map = new Map<string, string>()
  return {
    map,
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => {
      map.set(key, String(value))
    },
    removeItem: (key: string) => {
      map.delete(key)
    },
  }
}

let gtag: Mock
let storage: ReturnType<typeof createStorage>
let fetchMock: Mock

function stubBrowser(href = "https://classin.kr/contact?prefill=%EC%9A%94%EC%95%BD&utm_source=naver") {
  const url = new URL(href)
  gtag = vi.fn()
  storage = createStorage()
  fetchMock = vi.fn()
  fetchMock.mockResolvedValue(new Response("{}"))
  vi.stubGlobal("window", {
    location: { href, origin: url.origin, pathname: url.pathname },
    sessionStorage: storage,
    gtag,
    dataLayer: [],
  })
  vi.stubGlobal("fetch", fetchMock)
}

function gtagEvents(name?: string) {
  return (gtag.mock.calls as unknown as GtagCall[]).filter(
    ([command, eventName]) => command === "event" && (!name || eventName === name)
  )
}

beforeEach(() => {
  consent.analytics = false
  consent.marketing = false
  stubBrowser()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe("trackLeadSubmitted", () => {
  it("sends nothing when the server did not store the submission", () => {
    const sent = trackLeadSubmitted({
      formType: "contact",
      source: "contact_page",
      stored: false,
      dedupeKey: "lead:stored-false",
    })

    expect(sent).toBe(false)
    expect(gtag).not.toHaveBeenCalled()
    expect((window as unknown as { dataLayer: unknown[] }).dataLayer).toHaveLength(0)
    expect(storage.map.size).toBe(0)
  })

  it("maps to generate_lead with form_type/lead_source and keeps internal ids out of GA4", () => {
    const sent = trackLeadSubmitted({
      formType: "contact",
      source: "contact_page",
      stored: true,
      dedupeKey: "lead:abc",
      eventId: "lead:abc",
      transactionId: "abc",
      params: { lead_id: "abc", stored: true, event_slug: "fall-seminar" },
    })

    expect(sent).toBe(true)
    const [lead] = gtagEvents("generate_lead")
    expect(lead?.[2]).toEqual({
      page_location: "https://classin.kr/contact?utm_source=naver",
      source: "contact_page",
      form_type: "contact",
      lead_source: "contact_page",
      method: "contact_page",
      lead_type: "demo_request",
      event_slug: "fall-seminar",
      event_id: "lead:abc",
    })

    // 내부 이름은 그대로(어드민 지표 호환) — dataLayer 에는 내부 파라미터가 남는다.
    const dataLayer = (window as unknown as { dataLayer: Array<Record<string, unknown>> }).dataLayer
    expect(dataLayer[0]).toMatchObject({
      event: "submit_demo_request",
      form_type: "contact",
      lead_id: "abc",
    })

    const [conversion] = gtagEvents("conversion")
    expect(conversion?.[2]).toMatchObject({
      send_to: "AW-TEST/demo-label",
      transaction_id: "abc",
      event_id: "lead:abc",
      event_slug: "fall-seminar",
      page_location: "https://classin.kr/contact?utm_source=naver",
    })
  })

  it("fires the lead and the Ads conversion only once per dedupe key", () => {
    const input = {
      formType: "showroom" as const,
      source: "showroom_booking",
      dedupeKey: "booking-1",
      transactionId: "booking-1",
    }

    expect(trackLeadSubmitted(input)).toBe(true)
    expect(trackLeadSubmitted(input)).toBe(false)

    expect(gtagEvents("generate_lead")).toHaveLength(1)
    expect(gtagEvents("conversion")).toHaveLength(1)
    expect(storage.map.get("classinkr.leadTracked.booking-1")).toBe("1")
  })

  it("respects a key already recorded in sessionStorage (e.g. after a reload)", () => {
    storage.setItem("classinkr.leadTracked.req-9", "1")
    expect(
      trackLeadSubmitted({ formType: "checkout_request", source: "checkout_request", dedupeKey: "req-9" })
    ).toBe(false)
    expect(gtag).not.toHaveBeenCalled()
  })

  it("still dedupes in memory when sessionStorage is blocked", () => {
    vi.stubGlobal("window", {
      ...(window as unknown as Record<string, unknown>),
      sessionStorage: {
        getItem: () => {
          throw new Error("blocked")
        },
        setItem: () => {
          throw new Error("blocked")
        },
      },
    })
    const input = { formType: "demo" as const, source: "demo_modal", dedupeKey: "lead:blocked" }
    expect(trackLeadSubmitted(input)).toBe(true)
    expect(trackLeadSubmitted(input)).toBe(false)
  })
})

describe("trackEvent GA4 params", () => {
  it("infers form_type for newsletter call sites that do not pass it", () => {
    trackEvent("submit_newsletter", { source: "event_alert:fall-seminar" })
    trackEvent("submit_newsletter", { source: "footer" })
    trackEvent("submit_newsletter", { source: "blog_lead_magnet", form_type: "lead_magnet" })

    const leads = gtagEvents("generate_lead").map(([, , params]) => params)
    expect(leads.map((params) => params?.form_type)).toEqual(["event_alert", "newsletter", "lead_magnet"])
    expect(leads[0]).toMatchObject({ lead_type: "newsletter", lead_source: "event_alert:fall-seminar" })
  })

  it("maps download_materials to file_download without leaking the signed URL", () => {
    trackEvent("download_materials", {
      asset_id: "academy-system-checklist",
      lead_magnet: "academy-system-checklist",
      gate: "email",
      source: "resource_pdf_download",
      page_path: "/resources/academy-system-checklist",
    })

    const [download] = gtagEvents("file_download")
    expect(download?.[2]).toMatchObject({
      file_name: "academy-system-checklist",
      content_type: "lead_magnet",
      gate: "email",
      page_path: "/resources/academy-system-checklist",
    })
    expect(JSON.stringify(download)).not.toMatch(/token|signature|@/)
  })

  it("skipMarketingPixels keeps GA4 but leaves Meta untouched", () => {
    consent.marketing = true
    const fbq = vi.fn()
    vi.stubGlobal("window", { ...(window as unknown as Record<string, unknown>), fbq })

    trackEvent("download_materials", { asset_id: "a", lead_magnet: "a" }, { skipMarketingPixels: true })
    expect(gtagEvents("file_download")).toHaveLength(1)
    expect(fbq).not.toHaveBeenCalled()

    trackEvent("download_materials", { asset_id: "b", lead_magnet: "b" })
    expect(fbq).toHaveBeenCalledWith("track", "Lead", expect.any(Object), expect.any(Object))
  })

  it("sanitizes link targets and drops unknown keys", () => {
    trackEvent("click_cta", {
      button: "chatbot_contact",
      destination: "/contact?topic=a&prefill=%EC%A0%84%ED%99%94+010-1234-5678",
      page: "mailto:someone@example.com",
      unknown_key: "drop-me",
    })

    const [cta] = gtagEvents("select_content")
    expect(cta?.[2]).toMatchObject({
      content_type: "cta",
      item_id: "chatbot_contact",
      destination: "/contact",
      page: "mailto:",
    })
    expect(cta?.[2]).not.toHaveProperty("unknown_key")
  })

  it("passes the new funnel events through under the same GA4 name", () => {
    trackEvent("click_to_call", { link_location: "contact_page", page_path: "/contact" })
    trackEvent("pricing_view", { pricing_surface: "pricing_simulator", page_path: "/pricing/simulator" })

    expect(gtagEvents("click_to_call")[0]?.[2]).toMatchObject({
      link_location: "contact_page",
      page_path: "/contact",
    })
    expect(gtagEvents("pricing_view")[0]?.[2]).toMatchObject({ pricing_surface: "pricing_simulator" })
  })

  it("sends the sanitized page URL as the internal tracking referrer", () => {
    consent.analytics = true
    trackEvent("submit_newsletter", { source: "resource_pdf_download", form_type: "resource" })

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(init.referrer).toBe("https://classin.kr/contact?utm_source=naver")
    expect(JSON.parse(String(init.body)).params).toMatchObject({ form_type: "resource" })
  })
})

describe("trackFormStart", () => {
  it("fires once per tab session for each form", () => {
    trackFormStart("contact_start", "contact")
    trackFormStart("contact_start", "contact")
    trackFormStart("contact_start", "demo")

    const starts = gtagEvents("contact_start").map(([, , params]) => params)
    expect(starts).toHaveLength(2)
    expect(starts[0]).toMatchObject({ form_type: "contact", page_path: "/contact" })
    expect(starts[1]).toMatchObject({ form_type: "demo" })
  })
})

describe("page context helpers", () => {
  it("setGooglePageContext forwards only provided values to gtag('set')", () => {
    setGooglePageContext({ page_location: "https://classin.kr/pricing", page_referrer: "" })
    expect(gtag).toHaveBeenCalledWith("set", {
      page_location: "https://classin.kr/pricing",
      page_referrer: "",
    })
  })

  it("trackInternalEvent never touches gtag and needs analytics consent", () => {
    trackInternalEvent("page_view", { path: "/pricing" })
    expect(fetchMock).not.toHaveBeenCalled()

    consent.analytics = true
    trackInternalEvent("page_view", { path: "/pricing" })
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(gtag).not.toHaveBeenCalled()
  })
})
