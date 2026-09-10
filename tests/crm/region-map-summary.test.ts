/**
 * CRM 지역 지도 집계 규칙.
 *
 * 이 화면의 정직성은 전적으로 located / nonGeo / unknown 세 갈래 분류에 달려 있다.
 * 셋이 섞이면 "지역을 모른다"가 "특정 지역에 몰려 있다"로 보이거나, 정당한 온라인 거래가
 * 데이터 결함으로 보인다.
 */
import { describe, expect, it } from "vitest"

import {
  emptyRegionTally,
  tallyRegionValue,
  tallyRegionValues,
  toRegionLayer,
} from "@/lib/crm/region-map-summary"

describe("tallyRegionValue — 세 갈래 분류", () => {
  it("시도로 접히는 값은 located", () => {
    const tally = tallyRegionValues(["서울", "Suwon", "부산광역시", "강남구"])
    expect(tally.located).toBe(4)
    expect(tally.unknown).toBe(0)
    expect(tally.nonGeo).toBe(0)
    expect(tally.regions).toEqual({ 서울: 2, 경기: 1, 부산: 1 })
  })

  it("온라인·해외는 nonGeo — 미상으로 세지 않는다", () => {
    const tally = tallyRegionValues(["온라인", "해외", "Online", "OVERSEAS"])
    expect(tally.nonGeo).toBe(4)
    expect(tally.unknown).toBe(0)
    expect(tally.located).toBe(0)
    expect(tally.regions).toEqual({})
  })

  it("빈 값·해외 지명·모호 토큰은 unknown", () => {
    const tally = tallyRegionValues([null, undefined, "", "   ", "Detroit", "남구", "X"])
    expect(tally.unknown).toBe(7)
    expect(tally.located).toBe(0)
    expect(tally.nonGeo).toBe(0)
  })

  it("total은 언제나 세 갈래의 합이다", () => {
    const tally = tallyRegionValues(["서울", "온라인", null, "Suwon", "Detroit"])
    expect(tally.total).toBe(5)
    expect(tally.located + tally.nonGeo + tally.unknown).toBe(tally.total)
  })

  it("0건 시도는 regions에 담기지 않는다", () => {
    const tally = tallyRegionValues(["서울"])
    expect(Object.keys(tally.regions)).toEqual(["서울"])
  })
})

describe("toRegionLayer — 커버리지", () => {
  it("커버리지는 located/total이며 nonGeo는 분자에 들어가지 않는다", () => {
    // 거래 레이어의 실제 모양: 국내 331 + 온라인 52 + 해외 2
    const tally = emptyRegionTally()
    for (let i = 0; i < 331; i += 1) tallyRegionValue(tally, "서울")
    for (let i = 0; i < 52; i += 1) tallyRegionValue(tally, "온라인")
    for (let i = 0; i < 2; i += 1) tallyRegionValue(tally, "해외")

    const layer = toRegionLayer("deal", "거래", "REV 딜 건수", tally)
    expect(layer.total).toBe(385)
    expect(layer.located).toBe(331)
    expect(layer.nonGeo).toBe(54)
    expect(layer.unknown).toBe(0)
    expect(Math.round(layer.coverage * 1000) / 1000).toBe(0.86)
  })

  it("빈 레이어는 커버리지 0으로 떨어진다(0 나누기 없음)", () => {
    const layer = toRegionLayer("lead", "리드", "유입 리드 건수", emptyRegionTally())
    expect(layer.total).toBe(0)
    expect(layer.coverage).toBe(0)
  })

  it("경고 문구는 그대로 실려 화면이 커버리지와 함께 보여줄 수 있다", () => {
    const layer = toRegionLayer("customer", "고객", "NEO 고객 계정", emptyRegionTally(), ["주소 필드 없음"])
    expect(layer.notes).toEqual(["주소 필드 없음"])
  })
})
