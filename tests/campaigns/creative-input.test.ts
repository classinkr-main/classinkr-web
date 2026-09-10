import { describe, expect, it } from "vitest"

import { aggregateAdCreativePerf } from "@/lib/marketing/creative-input"
import type { LeadRecord } from "@/lib/repositories/leads"

function lead(partial: Partial<LeadRecord>): LeadRecord {
  return {
    id: partial.id ?? "lead-1",
    source: "meta_lead_ads",
    status: "new",
    timestamp: partial.timestamp ?? "2026-08-01T00:00:00.000Z",
    ...partial,
  } as LeadRecord
}

describe("aggregateAdCreativePerf", () => {
  it("광고명별 리드·전환 집계 + 리드 수 내림차순", () => {
    const rows = aggregateAdCreativePerf([
      lead({ utm_campaign: "여름", utm_term: "A그룹", utm_content: "카피1" }),
      lead({ utm_campaign: "여름", utm_term: "A그룹", utm_content: "카피1" }),
      lead({ utm_campaign: "여름", utm_term: "B그룹", utm_content: "카피2" }),
    ])
    expect(rows).toHaveLength(2)
    expect(rows[0]).toMatchObject({ campaign: "여름", adset: "A그룹", ad: "카피1", leads: 2, converted: 0 })
    expect(rows[1]).toMatchObject({ campaign: "여름", adset: "B그룹", ad: "카피2", leads: 1, converted: 0 })
  })

  it("meta_lead_ads 아닌 리드는 제외", () => {
    expect(
      aggregateAdCreativePerf([
        lead({ source: "homepage", utm_campaign: "여름", utm_term: "A그룹", utm_content: "카피1" }),
      ])
    ).toEqual([])
  })

  it("전환 리드는 converted 로 집계", () => {
    const rows = aggregateAdCreativePerf([
      lead({ utm_campaign: "가을", utm_term: "그룹", utm_content: "카피", status: "converted" }),
      lead({ id: "lead-2", utm_campaign: "가을", utm_term: "그룹", utm_content: "카피", status: "new" }),
    ])
    expect(rows[0]).toMatchObject({ campaign: "가을", ad: "카피", leads: 2, converted: 1 })
  })

  it("테스트 리드는 제외", () => {
    expect(
      aggregateAdCreativePerf([
        lead({ utm_campaign: "가을", utm_term: "그룹", utm_content: "카피", email: "test@meta.com" }),
      ])
    ).toEqual([])
  })

  it("광고명(utm_content)이 없으면 message 의 ad= 줄로 폴백한다(getMetaAdInfo 구버전 파서)", () => {
    const rows = aggregateAdCreativePerf([
      lead({ utm_campaign: "겨울", message: "campaign=겨울\nadset=구버전그룹\nad=구버전카피" }),
    ])
    expect(rows[0]).toMatchObject({ campaign: "겨울", adset: "구버전그룹", ad: "구버전카피", leads: 1 })
  })

  it("동률(leads 동일)이면 광고명 사전순으로 안정적으로 정렬한다", () => {
    const rows = aggregateAdCreativePerf([
      lead({ utm_campaign: "여름", utm_term: "그룹", utm_content: "나카피" }),
      lead({ id: "lead-2", utm_campaign: "여름", utm_term: "그룹", utm_content: "가카피" }),
    ])
    expect(rows.map((r) => r.ad)).toEqual(["가카피", "나카피"])
  })
})
