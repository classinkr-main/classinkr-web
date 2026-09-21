import { describe, expect, it } from "vitest"

import {
  hasAnyAttribution,
  sanitizeLeadAttribution,
} from "@/lib/lead-attribution-payload"

/**
 * 미러링 경로(도입신청·쇼룸 예약)의 귀속 정규화.
 *
 * 이 함수가 없던 동안 두 경로는 리드를 만들면서 귀속을 **하나도** 넘기지 않았다 —
 * 광고를 타고 들어와 도입신청한 리드가 통째로 '출처 미상'이었다. 그 회귀를 막는 게 목적이다.
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

  it("공백·비문자열은 키를 만들지 않는다 — 리드 필드를 빈 값으로 덮지 않게", () => {
    expect(sanitizeLeadAttribution({ gclid: "   ", utmSource: 123, fbclid: null })).toEqual({})
  })

  it("500자로 자른다(클라이언트 수집기와 같은 규약)", () => {
    const long = "a".repeat(900)
    expect(sanitizeLeadAttribution({ utmCampaign: long }).utmCampaign).toHaveLength(500)
  })

  it("귀속이 없으면 빈 객체 — 호출부가 펼쳐도 기존 필드를 undefined 로 덮지 않는다", () => {
    expect(sanitizeLeadAttribution({ org: "학원" })).toEqual({})
    expect(sanitizeLeadAttribution(null)).toEqual({})
    expect(sanitizeLeadAttribution("x")).toEqual({})
    expect(sanitizeLeadAttribution([])).toEqual({})
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

describe("미러링 경로의 펼치기 규약", () => {
  // 도입신청·쇼룸이 쓰는 패턴: `...attribution` 뒤에 currentPage 폴백.
  const mirror = (body: unknown, sourcePage: string | null) => {
    const attribution = sanitizeLeadAttribution(body)
    return {
      sourceDetail: "checkout_request:hardware",
      ...attribution,
      currentPage: attribution.currentPage ?? sourcePage ?? undefined,
    }
  }

  it("수집기가 준 currentPage 가 sourcePage 보다 우선한다", () => {
    expect(mirror({ currentPage: "/l/omo1?gclid=x" }, "/checkout").currentPage).toBe(
      "/l/omo1?gclid=x"
    )
  })

  it("귀속에 currentPage 가 없으면 sourcePage 로 떨어진다", () => {
    expect(mirror({ gclid: "x" }, "/checkout").currentPage).toBe("/checkout")
  })

  it("둘 다 없으면 undefined — 빈 문자열을 지어내지 않는다", () => {
    expect(mirror({}, null).currentPage).toBeUndefined()
  })

  it("펼치기가 sourceDetail 을 덮지 않는다", () => {
    expect(mirror({ gclid: "x" }, "/checkout").sourceDetail).toBe("checkout_request:hardware")
  })
})
