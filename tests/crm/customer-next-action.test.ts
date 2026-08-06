import { describe, expect, it } from "vitest"

import { buildCustomerNextActionRecommendation } from "@/lib/crm/customer-next-action"
import type { ServiceRisk } from "@/lib/crm/service-risk"

function serviceRisk(overrides: Partial<ServiceRisk> = {}): ServiceRisk {
  return {
    level: "urgent",
    reasons: [{ code: "subscription_expiring", label: "구독 만료 D-7" }],
    expireInDays: 7,
    balance: 100,
    confidence: "high",
    freshnessLabel: "NEO 2시간 전",
    source: "neo",
    ...overrides,
  }
}

describe("buildCustomerNextActionRecommendation", () => {
  it("keeps one expiry reason and shows NEO freshness", () => {
    expect(
      buildCustomerNextActionRecommendation({
        nextActionLabel: null,
        priorityReason: null,
        serviceRisk: serviceRisk(),
        riskReasons: ["7일 내 만료"],
      })
    ).toEqual({
      title: "재계약·갱신 확인",
      reason: "구독 만료 D-7 · NEO 2시간 전",
      taskType: "renewal",
    })
  })

  it("makes NEO verification the first task when the service snapshot is stale", () => {
    expect(
      buildCustomerNextActionRecommendation({
        nextActionLabel: null,
        priorityReason: null,
        serviceRisk: serviceRisk({
          confidence: "low",
          freshnessLabel: "NEO 4일 전",
          reasons: [
            { code: "subscription_expiring", label: "구독 만료 D-7" },
            { code: "stale_snapshot", label: "NEO 최신 확인 필요" },
          ],
        }),
        riskReasons: ["7일 내 만료"],
      })
    ).toEqual({
      title: "NEO 최신 확인 후 재계약·갱신 확인",
      reason: "구독 만료 D-7 · NEO 4일 전 · NEO 최신 확인 필요",
      taskType: "data_fix",
    })
  })

  it("preserves lead recommendations as call tasks", () => {
    expect(
      buildCustomerNextActionRecommendation({
        nextActionLabel: "첫 응답",
        priorityReason: "24시간 이상 미응답",
        serviceRisk: null,
        riskReasons: [],
      })
    ).toEqual({
      title: "첫 응답",
      reason: "24시간 이상 미응답",
      taskType: "call",
    })
  })
})
