import { describe, expect, it } from "vitest"

import {
  deriveAccountSalesStage,
  deriveLeadSalesStage,
  derivePortalSalesStage,
} from "@/lib/crm/sales-stage"

describe("deriveLeadSalesStage — 입력 강제 없는 파생 사다리", () => {
  it("유입만 있으면 접촉 전", () => {
    expect(deriveLeadSalesStage({ status: "new" })).toBe("untouched")
  })

  it("status가 안 바뀌어도 연락 기록이 있으면 컨택 중 (priority.ts와 동일 규칙)", () => {
    expect(deriveLeadSalesStage({ status: "new", hasContactLog: true })).toBe("contacting")
    expect(deriveLeadSalesStage({ status: "contacted" })).toBe("contacting")
  })

  it("데모 신호·미팅 확정은 상담·데모", () => {
    expect(deriveLeadSalesStage({ status: "contacted", hasDemoSignal: true })).toBe("consulting")
    expect(deriveLeadSalesStage({ status: "new", hasMeetingSet: true })).toBe("consulting")
  })

  it("전환·종료", () => {
    expect(deriveLeadSalesStage({ status: "converted" })).toBe("converted")
    expect(deriveLeadSalesStage({ status: "closed" })).toBe("dormant")
  })
})

describe("deriveAccountSalesStage — 결제·만료(신뢰 高) 중심", () => {
  it("만료 D-30 이내는 연장 관리", () => {
    expect(deriveAccountSalesStage({ expiryDays: 10, hasBalance: true })).toBe("renewal")
  })

  it("만료 경과는 회복, 60일 넘으면 휴면", () => {
    expect(deriveAccountSalesStage({ expiryDays: -10, hasBalance: false })).toBe("recovery")
    expect(deriveAccountSalesStage({ expiryDays: -90, hasBalance: false })).toBe("dormant")
  })

  it("잔액 소진은 최근 자체 컨택이 있으면 연장 관리, 없으면 휴면", () => {
    expect(deriveAccountSalesStage({ expiryDays: 90, hasBalance: false, depleted: true, ownContactDays: 10 })).toBe(
      "renewal"
    )
    expect(deriveAccountSalesStage({ expiryDays: 90, hasBalance: false, depleted: true, ownContactDays: null })).toBe(
      "dormant"
    )
  })

  it("정상 활성", () => {
    expect(deriveAccountSalesStage({ expiryDays: 120, hasBalance: true })).toBe("active")
  })
})

describe("derivePortalSalesStage", () => {
  it("계약 진행 구간과 이용 중을 가른다", () => {
    expect(derivePortalSalesStage({ currentStage: "contract" })).toBe("converted")
    expect(derivePortalSalesStage({ currentStage: "installation" })).toBe("active")
    expect(derivePortalSalesStage({ currentStage: "cancelled" })).toBe("dormant")
    expect(derivePortalSalesStage({ activeDealCount: 1 })).toBe("converted")
    expect(derivePortalSalesStage({})).toBe("active")
  })
})
