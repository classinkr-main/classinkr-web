// 충전형(business_recharge) 프로모 통화 가드 회귀 — 2026-07 CNY → KRW 전환.
// 충전형은 원화 선충전이라 percent 와 flat_krw 만 적용될 수 있다. 외화 정액 코드가
// 흘러들면 "할인 없이 통과"하거나 엉뚱한 통화 금액이 원화에서 차감될 수 있어
// 검증 단계에서 명시 메시지로 끊어야 한다. 구독형 경로는 이 가드를 타지 않는다.
import { afterEach, describe, expect, it, vi } from "vitest"

import type { PromoDiscountType, PromoTargetProduct } from "@/lib/billing/promo-codes"

interface PromoRowInput {
  discount_type: PromoDiscountType
  discount_value: number
  target_product?: PromoTargetProduct
  currency?: string | null
}

function promoRow(input: PromoRowInput) {
  return {
    id: "promo-1",
    code: "SAVE",
    label: null,
    target_product: input.target_product ?? "any",
    discount_type: input.discount_type,
    discount_value: input.discount_value,
    currency: input.currency ?? null,
    usage_limit: null,
    used_count: 0,
    starts_at: null,
    expires_at: null,
    is_active: true,
    notes: null,
    created_by: null,
    created_at: "2026-07-01T00:00:00.000Z",
    updated_at: "2026-07-01T00:00:00.000Z",
  }
}

async function loadPromoCodes(row: ReturnType<typeof promoRow> | null) {
  vi.resetModules()

  const builder = {
    from: vi.fn(() => builder),
    select: vi.fn(() => builder),
    eq: vi.fn(() => builder),
    maybeSingle: vi.fn(() => Promise.resolve({ data: row, error: null })),
  }

  vi.doMock("@/lib/supabase/admin", () => ({
    createSupabaseAdminClient: vi.fn(() => builder),
  }))

  return import("@/lib/billing/promo-codes")
}

const CURRENCY_MISMATCH_MESSAGE =
  "이 프로모 코드는 통화가 맞지 않아 충전형에 적용할 수 없습니다."

describe("validatePromoCode — 충전형은 원화 코드만 받는다", () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.resetModules()
  })

  it("flat_cny 코드는 충전형에 적용할 수 없다", async () => {
    const { validatePromoCode } = await loadPromoCodes(
      promoRow({ discount_type: "flat_cny", discount_value: 1_000, currency: "CNY" })
    )

    const result = await validatePromoCode({
      rawCode: "SAVE",
      target: "business_recharge",
      baseAmount: 2_000_000,
      currency: "KRW",
    })

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.reason).toBe("currency_mismatch")
    expect(result.message).toBe(CURRENCY_MISMATCH_MESSAGE)
  })

  it("flat_usd 코드도 충전형에 적용할 수 없다", async () => {
    const { validatePromoCode } = await loadPromoCodes(
      promoRow({ discount_type: "flat_usd", discount_value: 100, currency: "USD" })
    )

    const result = await validatePromoCode({
      rawCode: "SAVE",
      target: "business_recharge",
      baseAmount: 2_000_000,
      currency: "KRW",
    })

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.message).toBe(CURRENCY_MISMATCH_MESSAGE)
  })

  it("target_product='business_recharge' 로 발급된 외화 정액 코드도 막는다", async () => {
    // target 검사만으로는 못 걸러진다 — discount_type 을 함께 봐야 한다.
    const { validatePromoCode } = await loadPromoCodes(
      promoRow({
        discount_type: "flat_cny",
        discount_value: 1_000,
        target_product: "business_recharge",
        currency: "CNY",
      })
    )

    const result = await validatePromoCode({
      rawCode: "SAVE",
      target: "business_recharge",
      baseAmount: 2_000_000,
      currency: "KRW",
    })

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.message).toBe(CURRENCY_MISMATCH_MESSAGE)
  })

  it("flat_krw 코드는 원화 충전액에서 그대로 차감한다", async () => {
    const { validatePromoCode } = await loadPromoCodes(
      promoRow({ discount_type: "flat_krw", discount_value: 300_000, currency: "KRW" })
    )

    const result = await validatePromoCode({
      rawCode: "SAVE",
      target: "business_recharge",
      baseAmount: 2_000_000,
      currency: "KRW",
    })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.discountAmount).toBe(300_000)
    expect(result.amountAfter).toBe(1_700_000)
    expect(result.currency).toBe("KRW")
  })

  it("percent 코드는 통화와 무관하게 충전형에 적용된다", async () => {
    const { validatePromoCode } = await loadPromoCodes(
      promoRow({ discount_type: "percent", discount_value: 10 })
    )

    const result = await validatePromoCode({
      rawCode: "SAVE",
      target: "business_recharge",
      baseAmount: 2_000_000,
      currency: "KRW",
    })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.discountAmount).toBe(200_000)
    expect(result.amountAfter).toBe(1_800_000)
  })

  it("구독형 USD 정액 코드는 종전대로 통과한다(가드가 충전형에만 걸린다)", async () => {
    const { validatePromoCode } = await loadPromoCodes(
      promoRow({ discount_type: "flat_usd", discount_value: 50, currency: "USD" })
    )

    const result = await validatePromoCode({
      rawCode: "SAVE",
      target: "subscription",
      baseAmount: 300,
      currency: "USD",
    })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.discountAmount).toBe(50)
    expect(result.amountAfter).toBe(250)
  })
})
