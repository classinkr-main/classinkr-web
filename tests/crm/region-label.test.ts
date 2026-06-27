import { describe, expect, it } from "vitest"

import { deriveCustomerRegion, regionCandidatesFromPayload, REGION_UNSPECIFIED } from "@/lib/crm/region-label"

describe("deriveCustomerRegion", () => {
  it("derives a region label from an address candidate", () => {
    const result = deriveCustomerRegion(["서울특별시 강남구 테헤란로 123"])
    expect(result.source).toBe("address")
    expect(result.label).toBeTruthy()
    expect(result.label).not.toBe(REGION_UNSPECIFIED)
  })

  it("prefers a manual override and marks its source", () => {
    const result = deriveCustomerRegion(["부산 해운대구"], "대구 수성구")
    expect(result.source).toBe("manual")
    // manual override wins over the address candidate
  })

  it("falls back to 지역 미지정 when nothing resolves", () => {
    expect(deriveCustomerRegion([null, undefined, "   ", "no-region-here-xyz"])).toEqual({
      label: REGION_UNSPECIFIED,
      source: "unspecified",
    })
  })

  it("does not treat an unresolvable manual value as manual", () => {
    const result = deriveCustomerRegion(["서울 강남구"], "ㅁㄴㅇㄹ")
    expect(result.source).toBe("address")
  })
})

describe("regionCandidatesFromPayload", () => {
  it("collects string address/region fields from a snapshot payload", () => {
    const candidates = regionCandidatesFromPayload({
      province: "서울",
      city: "",
      Address__c: "강남구 역삼동",
      balance: 1000,
      주소: "테헤란로",
    })
    expect(candidates).toEqual(expect.arrayContaining(["서울", "강남구 역삼동", "테헤란로"]))
    expect(candidates).not.toContain("")
  })

  it("returns empty for null payload", () => {
    expect(regionCandidatesFromPayload(null)).toEqual([])
  })
})
