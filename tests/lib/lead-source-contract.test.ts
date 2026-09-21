import { describe, expect, it } from "vitest"

import {
  DIRECT_INBOUND_LEAD_SOURCES,
  INTAKE_LEAD_SOURCES,
  WEBSITE_FORM_LEAD_SOURCES,
} from "@/lib/lead-types"
import { getSourceGroup, SOURCE_GROUP_LABEL, SOURCE_GROUP_ORDER } from "@/lib/crm/lead-attribution"
import { pickLeadAttribution } from "@/lib/marketing-attribution"

/**
 * 리드 source 계약.
 *
 * 쇼룸 예약·도입 신청은 전용 source 를 갖기 전까지 `contact_page` 를 빌려 썼다. 그래서
 * 응답 SLA·아침 공지·다이제스트가 source 로 대상을 거를 때 단순 문의와 한 덩어리였다.
 * 전용 값으로 가른 지금은 **거르는 집합에서 빠지는 것**이 새로운 위험이다 — 가장 의도가
 * 높은 리드가 조용히 공지에서 사라진다. 여기서 그 관계를 고정한다.
 */

describe("리드 source 집합", () => {
  it("접수 두 갈래가 SLA·공지 대상에 들어 있다", () => {
    for (const source of INTAKE_LEAD_SOURCES) {
      expect(DIRECT_INBOUND_LEAD_SOURCES.has(source), source).toBe(true)
    }
  })

  it("접수 두 갈래가 공개 사이트 폼 묶음에 들어 있다 — 홈페이지 합계가 새지 않게", () => {
    for (const source of INTAKE_LEAD_SOURCES) {
      expect(WEBSITE_FORM_LEAD_SOURCES.has(source), source).toBe(true)
    }
  })

  it("광고 리드폼은 공개 사이트 폼이 아니다", () => {
    expect(DIRECT_INBOUND_LEAD_SOURCES.has("meta_lead_ads")).toBe(true)
    expect(WEBSITE_FORM_LEAD_SOURCES.has("meta_lead_ads")).toBe(false)
  })

  it("뉴스레터는 응답 SLA 대상이 아니다 — 구독이지 상담 요청이 아니다", () => {
    expect(DIRECT_INBOUND_LEAD_SOURCES.has("newsletter")).toBe(false)
  })

  it("접수는 정확히 쇼룸 예약과 도입 신청 둘이다", () => {
    expect([...INTAKE_LEAD_SOURCES].sort()).toEqual(["checkout_request", "showroom_booking"])
  })
})

describe("유입 그룹 매핑", () => {
  it("접수 두 갈래가 전용 그룹으로 간다", () => {
    expect(getSourceGroup("showroom_booking")).toBe("intake")
    expect(getSourceGroup("checkout_request")).toBe("intake")
  })

  it("문의·데모는 홈페이지에 남는다", () => {
    expect(getSourceGroup("contact_page")).toBe("homepage")
    expect(getSourceGroup("demo_modal")).toBe("homepage")
  })

  it("매핑에 없는 source 는 수기·기타로 흡수된다 — 칩에서 리드가 새지 않게", () => {
    expect(getSourceGroup("무언가_새_채널")).toBe("manual_etc")
    expect(getSourceGroup(null)).toBe("manual_etc")
  })

  it("접수 그룹이 순서·라벨 표에도 등재돼 있다", () => {
    expect(SOURCE_GROUP_ORDER).toContain("intake")
    expect(SOURCE_GROUP_LABEL.intake).toBe("접수")
  })
})

describe("pickLeadAttribution", () => {
  it("알려진 귀속 필드만 고른다", () => {
    expect(
      pickLeadAttribution({
        utmSource: "meta",
        utmCampaign: "omo-2026",
        gclid: "abc",
        fbclid: "def",
        landingPage: "https://classin.co.kr/l/omo1",
        referrer: "https://www.google.com/",
        // 아래는 귀속 필드가 아니다 — 통과하면 리드 페이로드가 오염된다.
        phone: "010-1234-5678",
        source: "checkout_request",
        status: "converted",
      })
    ).toEqual({
      utmSource: "meta",
      utmCampaign: "omo-2026",
      gclid: "abc",
      fbclid: "def",
      landingPage: "https://classin.co.kr/l/omo1",
      referrer: "https://www.google.com/",
    })
  })

  it("공백만 있는 값은 버린다", () => {
    expect(pickLeadAttribution({ utmSource: "   ", utmMedium: "cpc" })).toEqual({
      utmMedium: "cpc",
    })
  })

  it("문자열이 아닌 값은 버린다", () => {
    expect(pickLeadAttribution({ utmSource: 42, gclid: null, fbclid: ["a"] })).toEqual({})
  })

  it("500자를 넘는 값은 자른다", () => {
    const long = "x".repeat(900)
    const picked = pickLeadAttribution({ landingPage: long })
    expect(picked.landingPage).toHaveLength(500)
  })

  it("객체가 아니면 빈 값이다", () => {
    expect(pickLeadAttribution(null)).toEqual({})
    expect(pickLeadAttribution("utmSource=meta")).toEqual({})
    expect(pickLeadAttribution([{ utmSource: "meta" }])).toEqual({})
  })
})
