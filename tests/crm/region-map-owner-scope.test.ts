import { describe, expect, it } from "vitest"
import { emptyRegionTally, scopeRegionLayer, tallyRegionValue, toRegionLayer } from "@/lib/crm/region-map-summary"

function fixture() {
  const deal = emptyRegionTally()
  tallyRegionValue(deal, "서울", { id: "a1", name: "공통 학원", manager: "Alice" })
  tallyRegionValue(deal, "서울", { id: "a2", name: "공통 학원", manager: "Alice" })
  tallyRegionValue(deal, "부산", { id: "b1", name: "다른 학원", manager: "Bob" })
  const compass = emptyRegionTally()
  tallyRegionValue(compass, "제주", { id: "c1", name: "마케팅 학원", manager: "Alice" })
  return { deal: toRegionLayer("deal", "거래", "REV 딜 건수", deal), compass: toRegionLayer("compass", "Compass", "마케팅 리드", compass) }
}

describe("지역 지도 담당자·원천 범위", () => {
  it("담당자 집계는 원천별로 보존하며 다른 레이어의 지역을 합치지 않는다", () => {
    const { deal, compass } = fixture()
    expect(deal).toHaveProperty(["ownerLayers", "alice", "total"], 2)
    expect(scopeRegionLayer(deal, ["Alice"]).regions).toEqual({ 서울: 2 })
    expect(scopeRegionLayer(compass, ["Alice"]).regions).toEqual({ 제주: 1 })
    expect(scopeRegionLayer(deal, null)).toBe(deal)
  })

  it("담당 건이 없으면 전체 담당자나 다른 원천 고객을 대신 보여주지 않는다", () => {
    const scoped = scopeRegionLayer(fixture().deal, ["No owner"])
    expect(scoped).toMatchObject({ total: 0, located: 0, unknown: 0, nonGeo: 0, coverage: 0, regions: {}, topCustomersByRegion: {} })
  })

  it("별칭·대소문자 중복 없이 담당자의 미상·온라인 건수와 커버리지를 계산한다", () => {
    const tally = emptyRegionTally()
    tallyRegionValue(tally, "서울", { name: "내 학원", manager: "Alice" })
    tallyRegionValue(tally, "온라인", { name: "온라인", manager: "앨리스" })
    tallyRegionValue(tally, null, { name: "미상", manager: "ALICE" })
    tallyRegionValue(tally, "부산", { name: "남의 학원", manager: "Bob" })
    const scoped = scopeRegionLayer(toRegionLayer("lead", "리드", "유입 건수", tally), ["alice", "ALICE", "앨리스"])
    expect(scoped).toMatchObject({ total: 3, located: 1, unknown: 1, nonGeo: 1, regions: { 서울: 1 } })
    expect(scoped.coverage).toBeCloseTo(1 / 3)
    expect(scoped.topCustomersByRegion?.서울.map(row => row.name)).toEqual(["내 학원"])
  })

  it("전체 상위 15곳에서 빠진 담당 고객도 담당자 범위의 목록에는 남는다", () => {
    const tally = emptyRegionTally()
    for (let i = 0; i < 20; i++) tallyRegionValue(tally, "서울", { id: `b${i}`, name: `다른 학원${i}`, manager: "Bob" })
    tallyRegionValue(tally, "서울", { id: "a", name: "후순위 내 학원", manager: "Alice" })
    const layer = toRegionLayer("deal", "거래", "REV 딜 건수", tally)
    expect(layer.topCustomersByRegion?.서울.some(row => row.manager === "Alice")).toBe(false)
    expect(scopeRegionLayer(layer, ["Alice"]).topCustomersByRegion?.서울.map(row => row.name)).toEqual(["후순위 내 학원"])
  })
})
