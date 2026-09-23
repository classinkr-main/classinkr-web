import { describe, expect, it } from "vitest"

import {
  getLeadAdLabel,
  getLeadCampaignLabel,
  getLeadChannelLabel,
  hasAdClickId,
  hasTrackingSignal,
  isMarketingLead,
} from "@/lib/crm/lead-attribution"
import {
  collectNaverAdParams,
  naverAdLabel,
  naverCampaignTypeLabel,
  NAVER_AD_PARAMS,
  parseNaverAd,
} from "@/lib/naver-ad-params"
import type { LeadRecord } from "@/lib/repositories/leads"

/**
 * 네이버 유입 귀속 — 이게 없으면 집행 데이터만 있고 "네이버가 리드를 몇 개 데려왔나"가
 * 영원히 '—' 로 남는다. 그 경로의 각 단계를 잠근다:
 *   URL n_* 수집 → JSONB 정규화 → 채널/캠페인/소재 라벨 → 마케팅 렌즈 판정
 */

const lead = (over: Partial<LeadRecord> = {}): LeadRecord => ({
  id: "lead-1",
  source: "demo_modal",
  timestamp: "2026-09-10T00:00:00.000Z",
  status: "new",
  ...over,
})

describe("collectNaverAdParams — URL 에서 모으기", () => {
  it("값이 하나도 없으면 null — 빈 객체를 만들지 않는다", () => {
    expect(collectNaverAdParams(() => null)).toBeNull()
    expect(collectNaverAdParams(() => "")).toBeNull()
    expect(collectNaverAdParams(() => "   ")).toBeNull()
  })

  it("한 키라도 있으면 그 키만 담아 돌려준다", () => {
    const params = new URLSearchParams("n_ad=ad-77&n_keyword=학원+관리+프로그램&utm_source=naver")
    expect(collectNaverAdParams((key) => params.get(key))).toEqual({
      n_ad: "ad-77",
      n_keyword: "학원 관리 프로그램",
    })
  })

  it("긴 값은 500자로 자른다(utm 수집과 같은 규약)", () => {
    const long = "가".repeat(600)
    const result = collectNaverAdParams((key) => (key === "n_query" ? long : null))
    expect(result?.n_query).toHaveLength(500)
  })

  it("파라미터 10종을 전부 안다", () => {
    expect(NAVER_AD_PARAMS).toHaveLength(10)
    const params = new URLSearchParams(NAVER_AD_PARAMS.map((key) => `${key}=v`).join("&"))
    expect(Object.keys(collectNaverAdParams((key) => params.get(key)) ?? {})).toHaveLength(10)
  })
})

describe("parseNaverAd — DB/요청 본문 정규화", () => {
  it("목록 밖 키를 버린다 — 저장은 원본이어도 읽을 때 흘리지 않는다", () => {
    expect(parseNaverAd({ n_ad: "a", evil: "x", __proto__: "y" })).toEqual({ n_ad: "a" })
  })

  it("객체가 아니거나 유효 키가 없으면 null", () => {
    expect(parseNaverAd(null)).toBeNull()
    expect(parseNaverAd("naver")).toBeNull()
    expect(parseNaverAd([])).toBeNull()
    expect(parseNaverAd({})).toBeNull()
    expect(parseNaverAd({ utm_source: "naver" })).toBeNull()
  })

  it("비문자열 값은 버린다", () => {
    expect(parseNaverAd({ n_ad: 123, n_keyword: "수학학원" })).toEqual({ n_keyword: "수학학원" })
  })
})

describe("표시 라벨", () => {
  it("소재 축은 광고 → 광고그룹 → 검색어 순으로 떨어진다", () => {
    expect(naverAdLabel({ n_ad: "a", n_ad_group: "g", n_keyword: "k" })).toBe("a")
    expect(naverAdLabel({ n_ad_group: "g", n_keyword: "k" })).toBe("g")
    expect(naverAdLabel({ n_keyword: "k" })).toBe("k")
    expect(naverAdLabel({ n_rank: "1" })).toBeNull()
    expect(naverAdLabel(null)).toBeNull()
  })

  it("캠페인 유형에 접두를 붙인다 — 캠페인명처럼 보이면 안 된다", () => {
    expect(naverCampaignTypeLabel({ n_campaign_type: "파워링크" })).toBe("네이버 파워링크")
    expect(naverCampaignTypeLabel({})).toBeNull()
  })
})

describe("리드 귀속 — 채널·캠페인·소재", () => {
  it("네이버 유입은 'naver / cpc' 로 읽힌다 — utm 없이 돌리는 계정이 많다", () => {
    expect(getLeadChannelLabel(lead({ naver_ad: { n_ad: "ad-1" } }))).toBe("naver / cpc")
    expect(getLeadChannelLabel(lead({ naver_ad: { n_campaign_type: "파워링크" } }))).toBe("naver / cpc")
  })

  it("utm 이 있으면 utm 이 이긴다 — 폴백은 utm 이 없을 때만", () => {
    expect(
      getLeadChannelLabel(lead({ utm_source: "naver", utm_medium: "search", naver_ad: { n_ad: "a" } }))
    ).toBe("naver / search")
  })

  it("gclid 폴백을 깨지 않는다", () => {
    expect(getLeadChannelLabel(lead({ gclid: "g" }))).toBe("google / cpc")
  })

  it("캠페인 축은 유형 라벨로, 소재 축은 광고명으로 떨어진다", () => {
    const row = lead({ naver_ad: { n_campaign_type: "파워링크", n_ad: "ad-7" } })
    expect(getLeadCampaignLabel(row)).toBe("네이버 파워링크")
    expect(getLeadAdLabel(row)).toBe("ad-7")
  })

  it("utm_content 가 있으면 소재 축에서 그게 이긴다(기존 우선순위 유지)", () => {
    expect(getLeadAdLabel(lead({ utm_content: "banner-a", naver_ad: { n_ad: "ad-7" } }))).toBe(
      "banner-a"
    )
  })
})

describe("마케팅 렌즈 · 광고 클릭 식별자", () => {
  it("n_* 가 있으면 트래킹 신호로 센다", () => {
    expect(hasTrackingSignal(lead({ naver_ad: { n_ad: "a" } }))).toBe(true)
    expect(hasTrackingSignal(lead())).toBe(false)
  })

  it("채널톡·수기 유입이어도 n_* 가 붙었으면 마케팅 리드다", () => {
    expect(isMarketingLead(lead({ source: "channel_talk", naver_ad: { n_keyword: "k" } }))).toBe(true)
    expect(isMarketingLead(lead({ source: "channel_talk" }))).toBe(false)
  })

  it("hasAdClickId 가 네 채널을 다 본다 — 호출부가 조립을 복제하면 네이버가 빠진다", () => {
    expect(hasAdClickId(lead({ gclid: "g" }))).toBe(true)
    expect(hasAdClickId(lead({ fbclid: "f" }))).toBe(true)
    expect(hasAdClickId(lead({ msclkid: "m" }))).toBe(true)
    expect(hasAdClickId(lead({ ttclid: "t" }))).toBe(true)
    expect(hasAdClickId(lead({ naver_ad: { n_ad: "a" } }))).toBe(true)
    expect(hasAdClickId(lead())).toBe(false)
    expect(hasAdClickId(null)).toBe(false)
    expect(hasAdClickId(undefined)).toBe(false)
  })

  it("공백만 든 클릭ID 는 신호가 아니다", () => {
    expect(hasAdClickId(lead({ gclid: "   " }))).toBe(false)
  })
})
