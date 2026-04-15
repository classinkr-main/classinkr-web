import "server-only"

import { createSupabaseAdminClient } from "@/lib/supabase/admin"

export type PromoTargetProduct = "business_recharge" | "subscription" | "any"
export type PromoDiscountType = "percent" | "flat_cny" | "flat_usd" | "flat_krw"

export interface PromoCode {
  id: string
  code: string
  label: string | null
  targetProduct: PromoTargetProduct
  discountType: PromoDiscountType
  discountValue: number
  currency: string | null
  usageLimit: number | null
  usedCount: number
  startsAt: string | null
  expiresAt: string | null
  isActive: boolean
  notes: string | null
  createdBy: string | null
  createdAt: string
  updatedAt: string
}

interface PromoCodeRow {
  id: string
  code: string
  label: string | null
  target_product: PromoTargetProduct
  discount_type: PromoDiscountType
  discount_value: number | string
  currency: string | null
  usage_limit: number | null
  used_count: number
  starts_at: string | null
  expires_at: string | null
  is_active: boolean
  notes: string | null
  created_by: string | null
  created_at: string
  updated_at: string
}

function toNumber(value: number | string) {
  if (typeof value === "number") return value
  const parsed = Number.parseFloat(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function mapPromoCode(row: PromoCodeRow): PromoCode {
  return {
    id: row.id,
    code: row.code,
    label: row.label,
    targetProduct: row.target_product,
    discountType: row.discount_type,
    discountValue: toNumber(row.discount_value),
    currency: row.currency,
    usageLimit: row.usage_limit,
    usedCount: row.used_count,
    startsAt: row.starts_at,
    expiresAt: row.expires_at,
    isActive: row.is_active,
    notes: row.notes,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function normalizeCode(raw: string) {
  return raw.trim().toUpperCase()
}

export async function findPromoCode(rawCode: string) {
  const code = normalizeCode(rawCode)
  if (!code) return null

  const supabase = createSupabaseAdminClient()
  const { data, error } = await supabase
    .from("promo_codes")
    .select("*")
    .eq("code", code)
    .maybeSingle()

  if (error) throw error
  return data ? mapPromoCode(data as PromoCodeRow) : null
}

export type PromoApplication =
  | {
      ok: true
      promo: PromoCode
      amountBefore: number
      amountAfter: number
      discountAmount: number
      currency: string
    }
  | {
      ok: false
      reason:
        | "not_found"
        | "inactive"
        | "exhausted"
        | "expired"
        | "not_started"
        | "wrong_target"
        | "currency_mismatch"
        | "invalid"
      message: string
    }

function currencyLabel(currency: string) {
  if (currency === "CNY") return "CNY"
  if (currency === "USD") return "USD"
  if (currency === "KRW") return "KRW"
  return currency
}

function computeDiscountedAmount(promo: PromoCode, baseAmount: number, currency: string) {
  // 통화 매핑 — flat_* 는 통화가 맞아야 함
  if (promo.discountType === "percent") {
    const ratio = Math.min(Math.max(promo.discountValue, 0), 100) / 100
    const discount = Math.round(baseAmount * ratio * 100) / 100
    const after = Math.max(0, baseAmount - discount)
    return { ok: true as const, after, discount }
  }

  const expected = {
    flat_cny: "CNY",
    flat_usd: "USD",
    flat_krw: "KRW",
  }[promo.discountType]

  if (expected !== currency) {
    return { ok: false as const, reason: "currency_mismatch" as const }
  }

  const discount = Math.min(baseAmount, promo.discountValue)
  const after = Math.max(0, baseAmount - discount)
  return { ok: true as const, after, discount }
}

export async function validatePromoCode(input: {
  rawCode: string
  target: PromoTargetProduct
  baseAmount: number
  currency: string
}): Promise<PromoApplication> {
  const code = normalizeCode(input.rawCode)
  if (!code) {
    return { ok: false, reason: "invalid", message: "코드를 입력해 주세요." }
  }

  const promo = await findPromoCode(code)
  if (!promo) {
    return { ok: false, reason: "not_found", message: "등록되지 않은 코드입니다." }
  }

  if (!promo.isActive) {
    return { ok: false, reason: "inactive", message: "현재 사용할 수 없는 코드입니다." }
  }

  if (promo.usageLimit != null && promo.usedCount >= promo.usageLimit) {
    return { ok: false, reason: "exhausted", message: "사용 한도가 소진된 코드입니다." }
  }

  const now = Date.now()
  if (promo.startsAt && new Date(promo.startsAt).getTime() > now) {
    return { ok: false, reason: "not_started", message: "아직 사용 시작되지 않은 코드입니다." }
  }
  if (promo.expiresAt && new Date(promo.expiresAt).getTime() < now) {
    return { ok: false, reason: "expired", message: "유효기간이 지난 코드입니다." }
  }

  if (promo.targetProduct !== "any" && promo.targetProduct !== input.target) {
    return { ok: false, reason: "wrong_target", message: "다른 상품 전용 코드입니다." }
  }

  const applied = computeDiscountedAmount(promo, input.baseAmount, input.currency)
  if (!applied.ok) {
    return {
      ok: false,
      reason: "currency_mismatch",
      message: `이 코드는 ${currencyLabel(input.currency)} 결제에는 적용할 수 없습니다.`,
    }
  }

  return {
    ok: true,
    promo,
    amountBefore: input.baseAmount,
    amountAfter: applied.after,
    discountAmount: applied.discount,
    currency: input.currency,
  }
}

export async function recordPromoRedemption(input: {
  promoCodeId: string
  orderId: string
  amountBefore: number
  amountAfter: number
  currency: string
}) {
  const supabase = createSupabaseAdminClient()
  // redemption row insert + used_count 증가 (간단화: 앱 레벨에서 업데이트. 동시성 보호는 1차 범위 밖)
  const { error: redemptionError } = await supabase.from("promo_code_redemptions").insert({
    promo_code_id: input.promoCodeId,
    order_id: input.orderId,
    amount_before: input.amountBefore,
    amount_after: input.amountAfter,
    currency: input.currency,
  })
  if (redemptionError) throw redemptionError

  const { error: countError } = await supabase.rpc("increment_promo_code_used_count", {
    p_promo_code_id: input.promoCodeId,
  })

  if (countError) {
    // rpc 가 아직 없을 수 있으므로 fallback: 직접 update (race 가능)
    const { data } = await supabase
      .from("promo_codes")
      .select("used_count")
      .eq("id", input.promoCodeId)
      .maybeSingle()
    const next = (data?.used_count ?? 0) + 1
    await supabase
      .from("promo_codes")
      .update({ used_count: next })
      .eq("id", input.promoCodeId)
  }
}
