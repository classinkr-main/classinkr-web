import { afterEach, describe, expect, expectTypeOf, it, vi } from "vitest"

import {
  hasAnyAttribution,
  sanitizeLeadAttribution,
  type LeadAttributionPayload,
} from "@/lib/lead-attribution-payload"
import { collectLeadAttribution, type LeadAttribution } from "@/lib/marketing-attribution"

/**
 * 미러링 경로(도입신청·쇼룸 예약)의 귀속 정규화.
 *
 * 이 함수가 없던 동안 두 경로는 리드를 만들면서 귀속을 **하나도** 넘기지 않았다 —
 * 광고를 타고 들어와 도입신청한 리드가 통째로 '출처 미상'이었다. 그 회귀를 막는 게 목적이다.
 * 옛 pickLeadAttribution(lib/marketing-attribution.ts)이 잠그던 계약도 여기로 옮겨 왔다.
 */

describe("sanitizeLeadAttribution", () => {
  it("평평한 camelCase 본문을 읽는다(정적 랜딩 규약)", () => {
    expect(
      sanitizeLeadAttribution({
        utmSource: "google",
        utmMedium: "cpc",
        gclid: "ABC123",
        org: "무시될 필드",
      })
    ).toEqual({ utmSource: "google", utmMedium: "cpc", gclid: "ABC123" })
  })

  it("귀속이 아닌 폼 필드는 통과시키지 않는다 — 미러가 펼칠 때 source·status 를 덮으면 안 된다", () => {
    // 미러링 경로는 결과를 `...attribution` 으로 리드 페이로드에 펼친다. 여기서 source·status 가
    // 새면 쇼룸·도입신청 리드가 다른 source 로 둔갑하거나 상태가 건너뛴다.
    expect(
      sanitizeLeadAttribution({
        utmSource: "meta",
        utmCampaign: "omo-2026",
        fbclid: "def",
        landingPage: "https://classin.co.kr/l/omo1",
        referrer: "https://www.google.com/",
        phone: "010-1234-5678",
        source: "checkout_request",
        sourceDetail: "위조",
        status: "converted",
        anonymousId: "anon-1",
        attribution: { phone: "010-0000-0000", status: "converted" },
      })
    ).toEqual({
      utmSource: "meta",
      utmCampaign: "omo-2026",
      fbclid: "def",
      landingPage: "https://classin.co.kr/l/omo1",
      referrer: "https://www.google.com/",
    })
  })

  it("snake_case 도 받는다(외부 연동 규약)", () => {
    expect(sanitizeLeadAttribution({ utm_source: "naver", landing_page: "/l/kids" })).toEqual({
      utmSource: "naver",
      landingPage: "/l/kids",
    })
  })

  it("attribution 중첩 객체를 읽는다(collectLeadAttribution 통째 전송)", () => {
    expect(
      sanitizeLeadAttribution({
        attribution: { utmSource: "google", fbclid: "FB1" },
      })
    ).toEqual({ utmSource: "google", fbclid: "FB1" })
  })

  it("평평한 값이 중첩보다 이긴다 — 그 요청에 더 구체적인 값이다", () => {
    expect(
      sanitizeLeadAttribution({
        utmSource: "flat",
        attribution: { utmSource: "nested", utmMedium: "nested-only" },
      })
    ).toEqual({ utmSource: "flat", utmMedium: "nested-only" })
  })

  it("네이버 n_* 는 객체라 문자열 경로를 못 탄다 — 따로 받는다", () => {
    expect(
      sanitizeLeadAttribution({ naverAd: { n_ad: "nad-7", n_keyword: "학원관리" } })
    ).toEqual({ naverAd: { n_ad: "nad-7", n_keyword: "학원관리" } })
    expect(
      sanitizeLeadAttribution({ attribution: { naverAd: { n_ad: "nad-9" } } })
    ).toEqual({ naverAd: { n_ad: "nad-9" } })
  })

  it("네이버 목록 밖 키는 버린다", () => {
    expect(sanitizeLeadAttribution({ naverAd: { evil: "x", n_ad: "a" } })).toEqual({
      naverAd: { n_ad: "a" },
    })
  })

  it("빈 객체 naverAd 는 키를 만들지 않는다 — 네이버 유입으로 오독된다", () => {
    expect(sanitizeLeadAttribution({ naverAd: {} })).toEqual({})
  })

  it("앞뒤 공백은 잘라 담는다", () => {
    expect(
      sanitizeLeadAttribution({ utmSource: "  meta  ", attribution: { gclid: "\tG1\n" } })
    ).toEqual({ utmSource: "meta", gclid: "G1" })
  })

  it("공백만 있는 값은 그 키만 버리고 나머지는 담는다", () => {
    expect(sanitizeLeadAttribution({ utmSource: "   ", utmMedium: "cpc" })).toEqual({
      utmMedium: "cpc",
    })
  })

  it("공백·비문자열은 키를 만들지 않는다 — 리드 필드를 빈 값으로 덮지 않게", () => {
    expect(sanitizeLeadAttribution({ gclid: "   ", utmSource: 123, fbclid: null })).toEqual({})
  })

  it("배열·객체·불리언 값도 문자열로 치지 않는다", () => {
    expect(
      sanitizeLeadAttribution({
        utmSource: ["meta"],
        gclid: { value: "g" },
        fbclid: true,
        landingPage: 0,
      })
    ).toEqual({})
  })

  it("500자로 자른다(클라이언트 수집기와 같은 규약)", () => {
    const long = "a".repeat(900)
    expect(sanitizeLeadAttribution({ utmCampaign: long }).utmCampaign).toHaveLength(500)
    expect(sanitizeLeadAttribution({ landingPage: long }).landingPage).toHaveLength(500)
  })

  it("귀속이 없으면 빈 객체 — 호출부가 펼쳐도 기존 필드를 undefined 로 덮지 않는다", () => {
    expect(sanitizeLeadAttribution({ org: "학원" })).toEqual({})
    expect(sanitizeLeadAttribution(null)).toEqual({})
    expect(sanitizeLeadAttribution("x")).toEqual({})
    expect(sanitizeLeadAttribution("utmSource=meta")).toEqual({})
    expect(sanitizeLeadAttribution([])).toEqual({})
    expect(sanitizeLeadAttribution([{ utmSource: "meta" }])).toEqual({})
  })

  it("전 채널 클릭 식별자를 다 받는다", () => {
    const all = sanitizeLeadAttribution({
      gclid: "g",
      fbclid: "f",
      msclkid: "m",
      ttclid: "t",
      naverAd: { n_ad: "n" },
    })
    expect(Object.keys(all).sort()).toEqual(["fbclid", "gclid", "msclkid", "naverAd", "ttclid"])
  })

  it("hasAnyAttribution", () => {
    expect(hasAnyAttribution(sanitizeLeadAttribution({ gclid: "g" }))).toBe(true)
    expect(hasAnyAttribution(sanitizeLeadAttribution({}))).toBe(false)
  })
})

describe("collectLeadAttribution → 폼 본문 → sanitizeLeadAttribution 왕복", () => {
  // 도입신청(CheckoutRequestForm)·쇼룸(ShowroomBookingForm) 폼은 collectLeadAttribution() 결과를
  // 본문에 **평평하게 한 번** 펼쳐 보내고, 서버는 sanitizeLeadAttribution 이 평평한 키부터 읽는다.
  // 두 끝의 필드 목록이 따로 관리되므로, 한쪽에만 필드가 늘면 귀속이 조용히 빠진다 — 그걸 잠근다.

  /** lib/marketing-attribution.ts 의 ATTRIBUTION_STORAGE_KEY(비공개)와 같은 값. */
  const STORAGE_KEY = "classinkr.leadAttribution.v1"

  /** 수집기가 보는 브라우저 표면만 흉내 낸다(vitest 환경은 node). */
  function stubBrowser(href: string, referrer: string, stored?: LeadAttribution) {
    const store = new Map<string, string>()
    if (stored) store.set(STORAGE_KEY, JSON.stringify(stored))
    vi.stubGlobal("window", {
      location: { href },
      localStorage: {
        getItem: (key: string) => store.get(key) ?? null,
        setItem: (key: string, value: string) => void store.set(key, value),
      },
    })
    vi.stubGlobal("document", { referrer })
  }

  /** CheckoutRequestForm 본문 모양 — 귀속은 폼 필드 뒤에 평평하게 한 번 펼친다. */
  const checkoutBody = (attribution: LeadAttribution) => ({
    kind: "hardware",
    items: [{ productId: "hw-86", quantity: 1 }],
    org: "행복학원",
    name: "김원장",
    phone: "010-1234-5678",
    desiredDate: "2026-10-01",
    sourcePage: "/checkout",
    consent: true,
    ...attribution,
    anonymousId: "anon-1",
  })

  /** ShowroomBookingForm 본문 모양. */
  const showroomBody = (attribution: LeadAttribution) => ({
    visitDate: "2026-10-02",
    visitTime: "14:00",
    org: "행복학원",
    name: "김원장",
    phone: "010-1234-5678",
    visitorCount: 2,
    interests: ["hardware"],
    sourcePage: "/showroom",
    consent: true,
    ...attribution,
    anonymousId: "anon-1",
  })

  /** 폼은 JSON 으로 보낸다 — 직렬화까지 거친 값을 서버가 읽는다. */
  const overTheWire = (body: object): unknown => JSON.parse(JSON.stringify(body))

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it("광고 클릭 방문의 수집 결과가 네이버 묶음까지 그대로 돌아온다", () => {
    const params = new URLSearchParams({
      utm_source: "naver",
      utm_medium: "cpc",
      utm_campaign: "omo-2026",
      utm_term: "학원 관리",
      utm_content: "banner-a",
      gclid: "G1",
      fbclid: "F1",
      msclkid: "M1",
      ttclid: "T1",
      n_ad: "nad-7",
      n_keyword: "학원관리",
      n_campaign_type: "파워링크",
    })
    const href = `https://classin.co.kr/checkout?${params}`
    stubBrowser(href, "https://search.naver.com/")

    const collected = collectLeadAttribution()

    // 수집기 모양 전체(문자열 12종 + naverAd 객체)를 쓰는 픽스처인지부터 확인한다.
    expect(Object.keys(collected).sort()).toEqual(
      [
        "fbclid",
        "gclid",
        "landingPage",
        "currentPage",
        "msclkid",
        "naverAd",
        "referrer",
        "ttclid",
        "utmCampaign",
        "utmContent",
        "utmMedium",
        "utmSource",
        "utmTerm",
      ].sort()
    )
    expect(collected.naverAd).toEqual({
      n_ad: "nad-7",
      n_keyword: "학원관리",
      n_campaign_type: "파워링크",
    })

    for (const build of [checkoutBody, showroomBody]) {
      expect(sanitizeLeadAttribution(overTheWire(build(collected)))).toEqual(collected)
    }
  })

  it("이전 방문에서 저장된 naverAd 가 이어진 경우도 왕복한다(last-touch 유지)", () => {
    stubBrowser("https://classin.co.kr/showroom", "", {
      utmSource: "naver",
      naverAd: { n_ad: "nad-old", n_media: "27758" },
      landingPage: "https://classin.co.kr/l/omo1?n_ad=nad-old",
      referrer: "https://search.naver.com/",
    })

    const collected = collectLeadAttribution()

    expect(collected).toEqual({
      utmSource: "naver",
      naverAd: { n_ad: "nad-old", n_media: "27758" },
      landingPage: "https://classin.co.kr/l/omo1?n_ad=nad-old",
      currentPage: "https://classin.co.kr/showroom",
      referrer: "https://search.naver.com/",
    })
    for (const build of [checkoutBody, showroomBody]) {
      expect(sanitizeLeadAttribution(overTheWire(build(collected)))).toEqual(collected)
    }
  })

  it("수집기 타입의 모든 필드를 서버가 받는다 — 한쪽에만 필드를 더하면 여기서 깨진다", () => {
    // 타입이 어긋나면 tsc 가, 서버 STRING_KEYS 가 빠뜨리면 아래 toEqual 이 잡는다.
    expectTypeOf<LeadAttribution>().toEqualTypeOf<LeadAttributionPayload>()

    // Required 라서 수집기 타입에 필드가 늘면 이 픽스처부터 컴파일되지 않는다.
    const full: Required<LeadAttribution> = {
      utmSource: "s",
      utmMedium: "m",
      utmCampaign: "c",
      utmTerm: "t",
      utmContent: "ct",
      gclid: "g",
      fbclid: "f",
      msclkid: "ms",
      ttclid: "tt",
      landingPage: "https://classin.co.kr/l/omo1",
      currentPage: "https://classin.co.kr/checkout",
      referrer: "https://www.google.com/",
      naverAd: { n_ad: "a", n_keyword: "k" },
    }
    expect(sanitizeLeadAttribution(overTheWire(checkoutBody(full)))).toEqual(full)
  })
})

describe("미러링 경로의 펼치기 규약", () => {
  // 도입신청(lib/checkout-requests.ts)·쇼룸(lib/showroom/bookings.ts)이 쓰는 패턴:
  // `...attribution` 뒤에 `currentPage: sourcePage ?? attribution.currentPage`.
  // sourcePage 가 접수 큐가 보여 주는 실제 제출 지점이라 우선한다. 실제 경로에서 두 값이
  // 부딪히는 경우는 tests/showroom/bookings.test.ts 가 고정한다(이 헬퍼는 규약의 요약본이다).
  const mirror = (body: unknown, sourcePage: string | null) => {
    const attribution = sanitizeLeadAttribution(body)
    return {
      sourceDetail: "checkout_request:hardware",
      ...attribution,
      currentPage: sourcePage ?? attribution.currentPage,
    }
  }

  it("sourcePage 가 수집기의 currentPage 보다 우선한다", () => {
    expect(mirror({ currentPage: "/l/omo1?gclid=x" }, "/checkout").currentPage).toBe("/checkout")
  })

  it("sourcePage 가 없으면 수집기의 currentPage 로 물러난다", () => {
    expect(mirror({ currentPage: "/l/omo1?gclid=x" }, null).currentPage).toBe("/l/omo1?gclid=x")
  })

  it("둘 다 없으면 undefined — 빈 문자열을 지어내지 않는다", () => {
    expect(mirror({}, null).currentPage).toBeUndefined()
  })

  it("펼치기가 sourceDetail 을 덮지 않는다", () => {
    expect(mirror({ gclid: "x" }, "/checkout").sourceDetail).toBe("checkout_request:hardware")
  })
})
