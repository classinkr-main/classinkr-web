import { describe, expect, it, vi, beforeEach, afterEach } from "vitest"

import { SUBSCRIPTION_TIERS } from "@/components/sections/PricingCalculator"
import { getSoftwarePlan, type SoftwarePlanId } from "@/lib/billing/plans"

/**
 * components/sections/PricingCalculator.tsx 의 SUBSCRIPTION_TIERS 는 한때
 * lib/billing/plans.ts(SSOT)와 별도로 priceUsd(99/199/299)를 직접 들고 있었다.
 * 여기서 기대값을 다시 99/199/299 로 하드코딩하면 "SSOT만 바뀌고 이 파일은 그대로여도
 * 테스트가 통과"하는 문제가 그대로 되풀이된다 — 반드시 plans.ts 를 다시 읽어 비교한다.
 * (tests/checkout/hardware-catalog.test.ts, tests/hardware/board-specs.test.ts 와 같은 발상.)
 */
const TIER_TO_PLAN_ID = {
  Standard: "standard",
  Plus: "plus",
  Enterprise: "enterprise",
} as const satisfies Record<keyof typeof SUBSCRIPTION_TIERS, SoftwarePlanId>

function requireMonthlyUsd(planId: SoftwarePlanId): number {
  const plan = getSoftwarePlan(planId)
  if (!plan.monthly) {
    throw new Error(`plans.ts 의 "${planId}" 플랜에 월 단가가 없다`)
  }
  return plan.monthly.amount
}

describe("PricingCalculator SUBSCRIPTION_TIERS ↔ lib/billing/plans (SSOT)", () => {
  it("월 단가(priceUsd)가 plans.ts 의 월 단가와 일치한다", () => {
    for (const [tier, planId] of Object.entries(TIER_TO_PLAN_ID) as Array<
      [keyof typeof SUBSCRIPTION_TIERS, SoftwarePlanId]
    >) {
      expect(SUBSCRIPTION_TIERS[tier].priceUsd, `${tier}.priceUsd`).toBe(
        requireMonthlyUsd(planId)
      )
    }
  })

  it("Enterprise 도 selfServe=false 와 무관하게 월 단가를 SSOT 에서 그대로 읽는다", () => {
    // 체크아웃 UI 는 selfServe:false 라 Enterprise 가격을 노출하지 않지만, 시뮬레이터는
    // "구독형이라면 얼마인지" 추천 계산에 실제 단가가 필요하다 — plans.ts 값 자체는 여전히
    // 파생 대상이어야 한다(요구사항 C는 "노출 여부"에 대한 것이지 "값 파생" 자체를 막지 않는다).
    expect(SUBSCRIPTION_TIERS.Enterprise.priceUsd).toBe(requireMonthlyUsd("enterprise"))
  })

  it("plans.ts 에 없는 시뮬레이터 전용 한도 필드는 파생 대상이 아니다", () => {
    // 가격만 파생시키고 나머지(스토리지/한도 등)는 그대로 둔다는 요구사항(B)을 고정한다.
    // plans.ts 의 SoftwarePlan 타입에는 baseStorageGb 같은 필드가 아예 없다.
    expect(SUBSCRIPTION_TIERS.Standard.baseStorageGb).toBe(50)
    expect(SUBSCRIPTION_TIERS.Plus.baseStorageGb).toBe(500)
    expect(SUBSCRIPTION_TIERS.Enterprise.baseStorageGb).toBe(1024)
    expect(SUBSCRIPTION_TIERS.Standard.onStageMax).toBe(6)
    expect(SUBSCRIPTION_TIERS.Plus.onStageMax).toBe(12)
  })
})

describe("env override 전파 (요구사항 D: 빌드 타임 상수로 굳지 않는다)", () => {
  const ENV_KEYS = [
    "NEXT_PUBLIC_BILLING_STANDARD_MONTHLY_USD",
    "NEXT_PUBLIC_BILLING_PLUS_MONTHLY_USD",
    "NEXT_PUBLIC_BILLING_ENTERPRISE_MONTHLY_USD",
  ] as const
  const original: Partial<Record<(typeof ENV_KEYS)[number], string>> = {}

  beforeEach(() => {
    for (const key of ENV_KEYS) {
      const value = process.env[key]
      if (value !== undefined) original[key] = value
    }
  })

  afterEach(() => {
    for (const key of ENV_KEYS) {
      if (original[key] === undefined) delete process.env[key]
      else process.env[key] = original[key]
      delete original[key]
    }
    vi.resetModules()
  })

  it("NEXT_PUBLIC_BILLING_*_MONTHLY_USD 를 바꾸면 SUBSCRIPTION_TIERS.priceUsd 도 함께 바뀐다", async () => {
    process.env.NEXT_PUBLIC_BILLING_STANDARD_MONTHLY_USD = "111"
    process.env.NEXT_PUBLIC_BILLING_PLUS_MONTHLY_USD = "222"
    process.env.NEXT_PUBLIC_BILLING_ENTERPRISE_MONTHLY_USD = "333"
    vi.resetModules()

    const { SUBSCRIPTION_TIERS: overridden } = await import(
      "@/components/sections/PricingCalculator"
    )

    expect(overridden.Standard.priceUsd).toBe(111)
    expect(overridden.Plus.priceUsd).toBe(222)
    expect(overridden.Enterprise.priceUsd).toBe(333)
  })
})
