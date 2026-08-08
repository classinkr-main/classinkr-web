import { describe, expect, it } from "vitest"

import {
  buildAdLeadCsvRows,
  buildAdLeadScopes,
  buildAdLeadStats,
  isConvertibleLead,
  isPaidAdLead,
  leadInPeriod,
  matchesAdLeadSearch,
  matchesAdLeadStatus,
} from "@/lib/campaigns/ad-leads"
import { getLeadLandingPath, getLeadTrackingKey } from "@/lib/crm/lead-attribution"
import type { LeadRecord } from "@/lib/repositories/leads"

const NOW = new Date("2026-08-08T00:00:00.000Z").getTime()

function makeLead(patch: Partial<LeadRecord> = {}): LeadRecord {
  return {
    id: patch.id ?? "lead-1",
    source: "contact_page",
    status: "new",
    timestamp: new Date(NOW - 24 * 3600 * 1000).toISOString(),
    ...patch,
  } as LeadRecord
}

describe("isPaidAdLead", () => {
  it("Meta 리드애즈는 UTM이 없어도 광고 유입이다", () => {
    expect(isPaidAdLead(makeLead({ source: "meta_lead_ads" }))).toBe(true)
  })

  it("광고 클릭 식별자가 있으면 홈페이지 폼으로 들어와도 광고 유입이다", () => {
    expect(isPaidAdLead(makeLead({ source: "contact_page", gclid: "abc" }))).toBe(true)
    expect(isPaidAdLead(makeLead({ source: "demo_modal", fbclid: "xyz" }))).toBe(true)
  })

  it("유료 매체 utm_medium 표기 흔들림을 흡수한다", () => {
    for (const medium of ["cpc", "CPC", "paid_social", "paid-social", " display "]) {
      expect(isPaidAdLead(makeLead({ utm_medium: medium }))).toBe(true)
    }
  })

  it("자연 유입(organic·referral·수기)은 광고가 아니다", () => {
    expect(isPaidAdLead(makeLead({ utm_medium: "organic" }))).toBe(false)
    expect(isPaidAdLead(makeLead({ source: "admin_manual" }))).toBe(false)
    expect(isPaidAdLead(makeLead({ source: "newsletter" }))).toBe(false)
  })
})

describe("leadInPeriod", () => {
  it("기간 경계 안팎을 가른다", () => {
    const recent = makeLead({ timestamp: new Date(NOW - 3 * 24 * 3600 * 1000).toISOString() })
    const old = makeLead({ timestamp: new Date(NOW - 60 * 24 * 3600 * 1000).toISOString() })
    expect(leadInPeriod(recent, "7d", NOW)).toBe(true)
    expect(leadInPeriod(old, "7d", NOW)).toBe(false)
    expect(leadInPeriod(old, "90d", NOW)).toBe(true)
    expect(leadInPeriod(old, "all", NOW)).toBe(true)
  })

  it("날짜가 깨진 리드는 기간 필터에서 빠지고 전체에서만 보인다", () => {
    const broken = makeLead({ timestamp: "not-a-date" })
    expect(leadInPeriod(broken, "30d", NOW)).toBe(false)
    expect(leadInPeriod(broken, "all", NOW)).toBe(true)
  })
})

describe("상태 필터", () => {
  it("전환 대상은 이미 전환·종료된 리드를 뺀다", () => {
    expect(isConvertibleLead(makeLead({ status: "new" }))).toBe(true)
    expect(isConvertibleLead(makeLead({ status: "contacted" }))).toBe(true)
    expect(isConvertibleLead(makeLead({ status: "converted" }))).toBe(false)
    expect(isConvertibleLead(makeLead({ status: "closed" }))).toBe(false)
  })

  it("칩 키가 상태와 1:1로 맞는다", () => {
    const converted = makeLead({ status: "converted" })
    expect(matchesAdLeadStatus(converted, "all")).toBe(true)
    expect(matchesAdLeadStatus(converted, "converted")).toBe(true)
    expect(matchesAdLeadStatus(converted, "convertible")).toBe(false)
    expect(matchesAdLeadStatus(converted, "new")).toBe(false)
  })
})

describe("matchesAdLeadSearch", () => {
  const lead = makeLead({
    org: "클래스인 영어학원",
    name: "김원장",
    source: "meta_lead_ads",
    utm_campaign: "여름 HW",
    utm_content: "[SW] 전자칠판",
  })

  it("이름·학원·캠페인·광고명을 한 상자에서 찾는다", () => {
    expect(matchesAdLeadSearch(lead, "영어학원")).toBe(true)
    expect(matchesAdLeadSearch(lead, "여름")).toBe(true)
    expect(matchesAdLeadSearch(lead, "전자칠판")).toBe(true)
  })

  it("토큰을 모두 만족해야 한다", () => {
    expect(matchesAdLeadSearch(lead, "김원장 여름")).toBe(true)
    expect(matchesAdLeadSearch(lead, "김원장 겨울")).toBe(false)
  })

  it("빈 검색어는 모두 통과", () => {
    expect(matchesAdLeadSearch(lead, "   ")).toBe(true)
  })
})

describe("buildAdLeadStats", () => {
  const leads = [
    makeLead({ id: "a", status: "new", source: "meta_lead_ads", utm_campaign: "여름 HW", confirmed_at: undefined }),
    makeLead({ id: "b", status: "contacted", confirmed_at: "2026-08-01T00:00:00.000Z" }),
    makeLead({ id: "c", status: "converted", confirmed_at: "2026-08-01T00:00:00.000Z" }),
    makeLead({ id: "d", status: "closed", confirmed_at: "2026-08-01T00:00:00.000Z" }),
  ]

  it("상태별·전환 대상·미확인·캠페인 태깅을 함께 센다", () => {
    const stats = buildAdLeadStats(leads)
    expect(stats).toMatchObject({
      total: 4,
      newCount: 1,
      contacted: 1,
      converted: 1,
      convertible: 2,
      unconfirmed: 1,
      campaignTagged: 1,
    })
    expect(stats.convRate).toBeCloseTo(0.25)
  })

  it("광고비를 주면 실측 CPL을 계산하고, 없으면 0이 아니라 null로 둔다", () => {
    expect(buildAdLeadStats(leads, 400_000).cpl).toBe(100_000)
    expect(buildAdLeadStats(leads).cpl).toBeNull()
    expect(buildAdLeadStats(leads, 0).cpl).toBeNull()
    expect(buildAdLeadStats([], 400_000).cpl).toBeNull()
  })

  it("빈 목록의 전환율은 0%가 아니라 null(모름)이다", () => {
    expect(buildAdLeadStats([]).convRate).toBeNull()
  })
})

describe("buildAdLeadScopes", () => {
  const leads = [
    makeLead({ id: "meta-new", source: "meta_lead_ads", utm_campaign: "여름 HW" }),
    makeLead({ id: "meta-converted", source: "meta_lead_ads", status: "converted", utm_campaign: "여름 HW" }),
    makeLead({ id: "meta-other", source: "meta_lead_ads", utm_campaign: "겨울 SW" }),
    makeLead({ id: "site", source: "contact_page" }),
    makeLead({ id: "manual", source: "admin_manual" }),
    makeLead({ id: "test", source: "meta_lead_ads", email: "test@meta.com", utm_campaign: "여름 HW" }),
    makeLead({ id: "old-meta", source: "meta_lead_ads", timestamp: new Date(NOW - 200 * 24 * 3600 * 1000).toISOString() }),
  ]

  const base = {
    period: "90d" as const,
    status: "all" as const,
    search: "",
    trackingKey: null,
    getTrackingKey: (lead: LeadRecord) => getLeadTrackingKey(lead, "campaign"),
    nowMs: NOW,
    includeTestLeads: false,
  }

  it("광고 렌즈는 광고 유입만 남기고 테스트 리드를 숨긴 수를 알려준다", () => {
    const { scoped, hiddenTestCount } = buildAdLeadScopes(leads, { ...base, lens: "paid" })
    expect(scoped.map((l) => l.id)).toEqual(["meta-new", "meta-converted", "meta-other"])
    expect(hiddenTestCount).toBe(1)
  })

  it("마케팅 렌즈는 홈페이지 유입까지 포함하되 수기 등록은 뺀다", () => {
    const { scoped } = buildAdLeadScopes(leads, { ...base, lens: "marketing" })
    expect(scoped.map((l) => l.id)).toContain("site")
    expect(scoped.map((l) => l.id)).not.toContain("manual")
  })

  it("테스트 리드를 포함하면 숨긴 수가 0이 된다", () => {
    const { scoped, hiddenTestCount } = buildAdLeadScopes(leads, {
      ...base,
      lens: "paid",
      includeTestLeads: true,
    })
    expect(scoped.map((l) => l.id)).toContain("test")
    expect(hiddenTestCount).toBe(0)
  })

  it("상태·트래킹 키는 rows만 좁히고 롤업 분모(scoped)는 건드리지 않는다", () => {
    const { scoped, rows } = buildAdLeadScopes(leads, {
      ...base,
      lens: "paid",
      status: "convertible",
      trackingKey: "여름 HW",
    })
    expect(scoped).toHaveLength(3)
    expect(rows.map((l) => l.id)).toEqual(["meta-new"])
  })

  it("기간 밖 리드는 두 집합 모두에서 빠진다", () => {
    const { scoped } = buildAdLeadScopes(leads, { ...base, lens: "paid", period: "7d" })
    expect(scoped.map((l) => l.id)).not.toContain("old-meta")
  })
})

describe("buildAdLeadCsvRows", () => {
  it("트래킹 축을 라벨로 풀어 시트에 그대로 붙일 수 있게 만든다", () => {
    const rows = buildAdLeadCsvRows(
      [
        makeLead({
          org: "클래스인 영어학원",
          name: "김원장",
          status: "converted",
          source: "meta_lead_ads",
          utm_campaign: "여름 HW",
          utm_content: "[SW] 전자칠판",
          landing_page: "https://classin.co.kr/product/sw?utm_source=x",
        }),
      ],
      getLeadLandingPath
    )

    expect(rows[0]).toMatchObject({
      org: "클래스인 영어학원",
      status: "전환됨",
      campaign: "여름 HW",
      ad: "[SW] 전자칠판",
      landing: "/product/sw",
    })
  })

  it("값이 없는 칸은 null이 아니라 빈 문자열로 나간다(CSV 셀 깨짐 방지)", () => {
    const rows = buildAdLeadCsvRows([makeLead()], getLeadLandingPath)
    expect(rows[0].campaign).toBe("")
    expect(rows[0].email).toBe("")
  })
})
