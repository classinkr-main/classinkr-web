import { describe, expect, it } from "vitest"
import {
  groupPipelineByConfidence,
  pipelineConfidenceGroup,
  pipelineGroupTotals,
} from "@/lib/branch/pipeline-confidence-groups"

// 칸반 열과 파이프라인 탭 '이번에 닫을 것 / 확도를 올릴 것' 목록이 같은 분류·합산을 쓰는지 고정한다.
const confirmed = (customer: string, revenue: number) => ({
  customer, revenue, monthlyPayments: { "2026-10": revenue }, monthlyConfirmed: { "2026-10": revenue }, monthlyRed: { "2026-10": true },
})
const high = (customer: string, revenue: number) => ({
  customer, revenue, monthlyPayments: { "2026-10": revenue }, monthlyConfirmed: {}, monthlyHighConfidence: { "2026-10": revenue },
})
const none = (customer: string) => ({ customer, revenue: 0 })

describe("파이프라인 확도 묶음", () => {
  it("월별 데이터가 없으면 미분류로 남긴다", () => {
    expect(pipelineConfidenceGroup(none("빈 고객"))).toBe("unclassified")
    expect(pipelineConfidenceGroup({ customer: "0원", revenue: 0, monthlyPayments: { "2026-10": 0 } })).toBe("unclassified")
  })

  it("확정·고확도 신호를 가장 큰 버킷으로 고른다", () => {
    expect(pipelineConfidenceGroup(confirmed("가", 100))).toBe("confirmed")
    expect(pipelineConfidenceGroup(high("나", 80))).toBe("high-confidence")
  })

  it("같은 열의 같은 고객은 한 카드로 합치고 합계는 원래 행 합과 같다", () => {
    const rows = [high("새솔수학", 30), high(" 새솔수학 ", 20), high("도담학원", 40), confirmed("한빛", 90), none("나래")]
    const groups = groupPipelineByConfidence(rows)
    expect(groups["high-confidence"].map((row) => [row.customer, row.revenue, row.count])).toEqual([
      ["새솔수학", 50, 2],
      ["도담학원", 40, 1],
    ])
    const totals = pipelineGroupTotals(groups)
    expect(totals["high-confidence"]).toBe(90)
    expect(totals.confirmed).toBe(90)
    expect(groups.unclassified).toHaveLength(1)
  })

  it("고객명 정렬을 고르면 금액과 무관하게 가나다순이다", () => {
    const groups = groupPipelineByConfidence([high("하늘", 10), high("가온", 5)], "customer-asc")
    expect(groups["high-confidence"].map((row) => row.customer)).toEqual(["가온", "하늘"])
  })
})
