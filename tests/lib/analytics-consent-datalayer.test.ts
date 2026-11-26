import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest"

/**
 * 동의 전 dataLayer 이벤트(쿠키 점검 C9). GTM 은 동의 뒤에 붙으면서 dataLayer 를 처음부터 읽는다 —
 * 동의 전 이벤트가 배열에 남아 있으면 동의 전 행동까지 GTM 트리거가 처리하고, 동의 순간 채우는
 * page_view 와 겹쳐 두 번 센다.
 */
const consent = vi.hoisted(() => ({ analytics: false, marketing: false }))

vi.mock("@/lib/consent/consent", () => ({
  currentChoice: vi.fn(() => ({ ...consent })),
  getAnonymousId: vi.fn(() => null),
}))

vi.mock("@/lib/analytics-config", () => ({
  GOOGLE_ADS_DEMO_CONVERSION_LABEL: null,
  GOOGLE_ADS_SHOWROOM_CONVERSION_LABEL: null,
  GOOGLE_ADS_ID: "AW-TEST",
  KAKAO_PIXEL_ID: null,
  NAVER_LEAD_CONVERSION_TYPE: null,
  NAVER_WCS_ID: null,
}))

import { pendingPageViewFor, replayPageViewAfterConsent, trackEvent } from "@/lib/analytics"

let gtag: Mock
let fetchMock: Mock
let dataLayer: Array<Record<string, unknown>>

beforeEach(() => {
  consent.analytics = false
  consent.marketing = false
  gtag = vi.fn()
  fetchMock = vi.fn().mockResolvedValue(new Response("{}"))
  dataLayer = []
  const href = "https://classin.kr/pricing?utm_source=naver"
  vi.stubGlobal("window", {
    location: { href, origin: "https://classin.kr", pathname: "/pricing" },
    gtag,
    dataLayer,
  })
  vi.stubGlobal("fetch", fetchMock)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

const events = () => dataLayer.map((entry) => entry.event)
const gtagEvents = (name: string) =>
  (gtag.mock.calls as unknown as Array<[string, string]>).filter(([command, event]) => command === "event" && event === name)

describe("dataLayer 동의 게이트", () => {
  it("동의가 하나도 없으면(미결정·필수만) 이벤트를 dataLayer 에 넣지 않는다", () => {
    trackEvent("page_view", { path: "/pricing" })
    trackEvent("click_email", { destination: "mailto" })
    trackEvent("chatbot_opened", { source: "launcher" })

    expect(dataLayer).toEqual([])
    expect(gtag).not.toHaveBeenCalled()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it.each([
    ["분석만", { analytics: true, marketing: false }],
    ["마케팅만", { analytics: false, marketing: true }],
  ])("%s 동의하면 GTM 이 붙는 조건과 같아 dataLayer 에 넣는다", (_label, choice) => {
    Object.assign(consent, choice)
    trackEvent("click_cta", { button: "hero" })
    expect(events()).toEqual(["click_cta"])
  })

  it("동의 전 이벤트는 동의 뒤에 몰아 보내지 않는다 — GTM 이 처음 읽는 배열에는 동의 순간 채운 page_view 하나뿐이다", () => {
    trackEvent("page_view", { path: "/pricing" })
    trackEvent("click_email", { destination: "mailto" })
    const pending = pendingPageViewFor({ ...consent })

    consent.analytics = true
    consent.marketing = true
    const left = replayPageViewAfterConsent({ path: "/pricing", page_title: "가격" }, pending)

    expect(events()).toEqual(["page_view"])
    expect(left).toEqual({ dataLayer: false, analytics: false })
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(gtagEvents("page_view")).toHaveLength(1)
  })
})

describe("동의 순간 page_view 채우기", () => {
  it("마케팅을 먼저 켜면 dataLayer 만, 나중에 분석을 켜면 내부 적재·GA4 만 채운다 — 어디에도 두 번 들어가지 않는다", () => {
    let pending = pendingPageViewFor({ ...consent })
    expect(pending).toEqual({ dataLayer: true, analytics: true })

    pending = replayPageViewAfterConsent({ path: "/pricing" }, pending)
    expect(pending).toEqual({ dataLayer: true, analytics: true })
    expect(dataLayer).toEqual([])

    consent.marketing = true
    pending = replayPageViewAfterConsent({ path: "/pricing" }, pending)
    expect(pending).toEqual({ dataLayer: false, analytics: true })
    expect(events()).toEqual(["page_view"])
    expect(fetchMock).not.toHaveBeenCalled()
    expect(gtagEvents("page_view")).toHaveLength(0)

    consent.analytics = true
    pending = replayPageViewAfterConsent({ path: "/pricing" }, pending)
    expect(pending).toEqual({ dataLayer: false, analytics: false })
    expect(events()).toEqual(["page_view"])
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(gtagEvents("page_view")).toHaveLength(1)

    replayPageViewAfterConsent({ path: "/pricing" }, pending)
    expect(events()).toEqual(["page_view"])
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(gtagEvents("page_view")).toHaveLength(1)
  })

  it("이미 동의한 상태에서 보낸 page_view 는 채울 것이 없다", () => {
    expect(pendingPageViewFor({ analytics: true, marketing: true })).toEqual({ dataLayer: false, analytics: false })
    expect(pendingPageViewFor({ analytics: false, marketing: true })).toEqual({ dataLayer: false, analytics: true })
    expect(pendingPageViewFor({ analytics: true, marketing: false })).toEqual({ dataLayer: false, analytics: false })
  })
})
