import { describe, expect, it } from "vitest"

import {
  billingModeUsesBalance,
  deriveEeoBillingMode,
  readEeoBalance,
} from "@/lib/crm/eeo-account-fields"

describe("readEeoBalance", () => {
  it("표시 정본인 currencyShow__c 를 소수점까지 그대로 읽는다", () => {
    expect(readEeoBalance({ currencyShow__c: 1594.65, currency__c: 159465, CurrencyAmount__c: 1595 })).toBeCloseTo(1594.65)
  })

  it("여신이 섞인 CurrencyAmount__c 를 잔액으로 쓰지 않는다", () => {
    // 프로덕션 실측: 실제 잔액 -107.29 元인데 CurrencyAmount__c 는 99,893(여신 10만 포함).
    expect(readEeoBalance({ currencyShow__c: -107.29, CurrencyAmount__c: 99893 })).toBeCloseTo(-107.29)
  })

  it("표시 필드가 없으면 分 단위 원본에서 환산한다", () => {
    expect(readEeoBalance({ currency__c: 207143 })).toBeCloseTo(2071.43)
  })

  it("여신이 섞인 값만 남으면 잔액을 지어내지 않고 null 을 준다", () => {
    expect(readEeoBalance({ CurrencyAmount__c: 99893 })).toBeNull()
  })

  it("빈 payload·숫자가 아닌 값은 null", () => {
    expect(readEeoBalance(null)).toBeNull()
    expect(readEeoBalance({})).toBeNull()
    expect(readEeoBalance({ currencyShow__c: "n/a" })).toBeNull()
  })

  it("문자열로 온 숫자도 읽는다", () => {
    expect(readEeoBalance({ currencyShow__c: "935.58" })).toBeCloseTo(935.58)
  })

  it("잔액 0 과 잔액 없음을 구별한다", () => {
    expect(readEeoBalance({ currencyShow__c: 0 })).toBe(0)
    expect(readEeoBalance({ currencyShow__c: null })).toBeNull()
  })
})

describe("deriveEeoBillingMode", () => {
  it("매출시트 J열의 실제 값들을 분류한다", () => {
    expect(deriveEeoBillingMode("Business Consumption")).toBe("consumption")
    expect(deriveEeoBillingMode("Pro Consumption")).toBe("consumption")
    expect(deriveEeoBillingMode("Standard Subscription")).toBe("subscription")
    expect(deriveEeoBillingMode("Plus Subscription")).toBe("subscription")
    expect(deriveEeoBillingMode("Individual Subscription")).toBe("subscription")
    expect(deriveEeoBillingMode("Enterprise Subscription")).toBe("subscription")
    expect(deriveEeoBillingMode("ClassIn月享版")).toBe("subscription")
    expect(deriveEeoBillingMode("Hardware")).toBe("hardware")
  })

  it("판별되지 않는 값은 추측하지 않는다", () => {
    // 시트에 실재하지만 과금방식이 드러나지 않는 값들.
    expect(deriveEeoBillingMode("Flex standard")).toBe("unknown")
    expect(deriveEeoBillingMode("Nobook")).toBe("unknown")
    expect(deriveEeoBillingMode(null)).toBe("unknown")
    expect(deriveEeoBillingMode("  ")).toBe("unknown")
  })

  it("대소문자·여백에 흔들리지 않는다", () => {
    expect(deriveEeoBillingMode("  business consumption  ")).toBe("consumption")
    expect(deriveEeoBillingMode("STANDARD SUBSCRIPTION")).toBe("subscription")
  })
})

describe("billingModeUsesBalance", () => {
  it("잔액 소진 판정은 충전제에만 적용된다", () => {
    expect(billingModeUsesBalance("consumption")).toBe(true)
    expect(billingModeUsesBalance("subscription")).toBe(false)
    expect(billingModeUsesBalance("hardware")).toBe(false)
    expect(billingModeUsesBalance("unknown")).toBe(false)
  })
})
