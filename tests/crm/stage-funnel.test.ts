/**
 * CRM T1 — lib/crm/stage-funnel.ts 단위 테스트.
 *
 * 커버: 리드 3단계 순차 누적 정의, 딜 6단계 "현재 단계 이상" 누적(lost 제외), 전환율 계산,
 * 병목(전환율 최저 구간, value=0 단계 제외, 동률 시 앞선 단계 우선), 딜 집계 실패 시 null,
 * lost/closed가 9단계 밖 별도 값으로 분리되는지.
 */
import { describe, expect, it } from "vitest"

import { buildStageFunnel, type StageFunnelDealInput, type StageFunnelLeadInput } from "@/lib/crm/stage-funnel"

function leads(overrides: Partial<StageFunnelLeadInput> = {}): StageFunnelLeadInput {
  return { new: 40, contacted: 30, converted: 20, closed: 10, ...overrides }
}

function deals(overrides: Partial<StageFunnelDealInput> = {}): StageFunnelDealInput {
  const base = { consult: 15, demo: 10, quote: 8, decision: 5, order: 3, won: 2, lost: 4 }
  const merged = { ...base, ...overrides }
  const total = Object.values(merged).reduce((sum, n) => sum + n, 0)
  return { ...merged, total } as StageFunnelDealInput
}

describe("buildStageFunnel — 딜 집계 실패", () => {
  it("deals가 null이면 전체를 null로 돌려준다(리드만으로 반쪽 퍼널을 만들지 않는다)", () => {
    expect(buildStageFunnel({ leads: leads(), deals: null })).toBeNull()
  })
})

describe("buildStageFunnel — 리드 3단계 순차 누적", () => {
  it("신규 이상 = new+contacted+converted 전부, 연락 이상 = contacted+converted, 전환 = converted", () => {
    const result = buildStageFunnel({ leads: leads({ new: 40, contacted: 30, converted: 20 }), deals: deals() })
    expect(result).not.toBeNull()
    const [leadNew, leadContacted, leadConverted] = result!.stages
    expect(leadNew).toMatchObject({ key: "lead_new", value: 90, group: "lead", conversionFromPrev: null })
    expect(leadContacted).toMatchObject({ key: "lead_contacted", value: 50, group: "lead" })
    // 소수 1자리로 반올림한다: 50/90*100 = 55.555...% → 55.6.
    expect(leadContacted.conversionFromPrev).toBe(55.6)
    expect(leadConverted).toMatchObject({ key: "lead_converted", value: 20, group: "lead" })
    expect(leadConverted.conversionFromPrev).toBe(40)
  })
})

describe("buildStageFunnel — 딜 6단계 현재 단계 이상 누적(lost 제외)", () => {
  it("각 단계 value = 그 단계 이상 인덱스의 합, lost는 섞이지 않는다", () => {
    const dealCounts = deals({ consult: 15, demo: 10, quote: 8, decision: 5, order: 3, won: 2, lost: 4 })
    const result = buildStageFunnel({ leads: leads(), deals: dealCounts })!
    const dealStages = result.stages.filter((stage) => stage.group === "deal")
    expect(dealStages.map((stage) => stage.key)).toEqual([
      "deal_consult",
      "deal_demo",
      "deal_quote",
      "deal_decision",
      "deal_order",
      "deal_won",
    ])
    // consult 이상 = 15+10+8+5+3+2 = 43, demo 이상 = 10+8+5+3+2 = 28, ... won 이상 = 2.
    expect(dealStages.map((stage) => stage.value)).toEqual([43, 28, 18, 10, 5, 2])
    expect(result.lost).toBe(4)
  })

  it("딜 상담(첫 딜 단계)의 conversionFromPrev는 리드 전환 대비로 이어서 계산된다", () => {
    const result = buildStageFunnel({ leads: leads({ converted: 50 }), deals: deals({ consult: 40, demo: 40, quote: 40, decision: 40, order: 40, won: 40, lost: 0 }) })!
    const consult = result.stages.find((stage) => stage.key === "deal_consult")!
    // consult 이상 누적 = 40*6 = 240, 리드 전환(prev) = 50 → 480%.
    expect(consult.value).toBe(240)
    expect(consult.conversionFromPrev).toBeCloseTo((240 / 50) * 100, 5)
  })
})

describe("buildStageFunnel — closed/lost 분리", () => {
  it("closed는 리드 3단계 밖, lost는 딜 6단계 밖 별도 값이다", () => {
    const result = buildStageFunnel({ leads: leads({ closed: 7 }), deals: deals({ lost: 9 }) })!
    expect(result.closed).toBe(7)
    expect(result.lost).toBe(9)
    // 9단계 안에는 closed/lost 값이 섞여 있지 않다.
    const total = result.stages.reduce((sum, s) => sum + s.value, 0)
    expect(result.stages.every((s) => s.value !== 7 || s.key !== "lead_new")).toBe(true)
    expect(total).toBeGreaterThan(0)
  })
})

describe("buildStageFunnel — 병목", () => {
  it("전환율이 최저인 구간을 고른다", () => {
    // 리드 신규 100 → 연락중 90(90%) → 전환 20(22.2%, 최저) → 딜 상담 18(90%) ...
    const result = buildStageFunnel({
      leads: { new: 10, contacted: 80, converted: 20, closed: 0 },
      deals: deals({ consult: 18, demo: 18, quote: 18, decision: 18, order: 18, won: 18, lost: 0 }),
    })!
    expect(result.bottleneck).not.toBeNull()
    expect(result.bottleneck!.key).toBe("lead_converted")
  })

  it("value가 0인 단계는 병목 후보에서 제외한다", () => {
    // won 단계 value=0 → 0% 전환이라도 후보에서 빠지고, 그다음으로 낮은 구간이 뽑힌다.
    const result = buildStageFunnel({
      leads: leads({ new: 10, contacted: 90, converted: 90 }),
      deals: deals({ consult: 50, demo: 50, quote: 50, decision: 50, order: 1, won: 0, lost: 0 }),
    })!
    const wonStage = result.stages.find((s) => s.key === "deal_won")!
    expect(wonStage.value).toBe(0)
    expect(wonStage.conversionFromPrev).toBe(0)
    expect(result.bottleneck?.key).not.toBe("deal_won")
  })

  it("첫 단계(conversionFromPrev=null)는 병목 후보가 아니다", () => {
    const result = buildStageFunnel({ leads: leads(), deals: deals() })!
    expect(result.bottleneck?.key).not.toBe("lead_new")
  })

  it("동률이면 퍼널 순서상 앞선 단계를 우선한다", () => {
    // lead_contacted(50/100=50%)와 lead_converted(25/50=50%)를 동률로 맞춘다. 이후 딜 단계에도
    // 50%가 다시 나오지만(deal_won: 200/400=50%), 먼저 만난 lead_contacted가 유지되어야 한다.
    const tie = buildStageFunnel({
      leads: { new: 50, contacted: 25, converted: 25, closed: 0 },
      deals: deals({ consult: 25, demo: 25, quote: 200, decision: 200, order: 200, won: 200, lost: 0 }),
    })!
    expect(tie.stages.find((s) => s.key === "lead_contacted")!.conversionFromPrev).toBe(50)
    expect(tie.stages.find((s) => s.key === "lead_converted")!.conversionFromPrev).toBe(50)
    expect(tie.stages.find((s) => s.key === "deal_won")!.conversionFromPrev).toBe(50)
    expect(tie.bottleneck?.key).toBe("lead_contacted")
  })
})
