import "server-only"

import { createSupabaseAdminClient } from "@/lib/supabase/admin"
import { convertCnyToKrw, convertUsdToKrw, getFxRates } from "@/lib/billing/fx"
import {
  clampAccountCount,
  computeSubscriptionAmountUsd,
  getBillingCycleLabel,
  getSelfServeSoftwarePlan,
  type BillingCycle,
  type SelfServePlanId,
} from "@/lib/billing/plans"
import {
  BUSINESS_RECHARGE,
  buildRechargeOrderName,
  validateRechargeAmount,
} from "@/lib/billing/recharge"
import {
  markQuoteCodeRedeemed,
  validateQuoteCode,
  type SoftwareQuoteCode,
} from "@/lib/billing/quote-codes"
import {
  recordPromoRedemption,
  validatePromoCode,
  type PromoCode,
} from "@/lib/billing/promo-codes"
import type { TossConfirmPaymentResponse } from "@/lib/billing/toss"

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export type CheckoutOrderStatus =
  | "pending"
  | "processing"
  | "paid"
  | "failed"
  | "canceled"

export type CheckoutOrderMode = "subscription" | "business"

export interface SoftwareCheckoutOrder {
  id: string
  orderId: string
  mode: CheckoutOrderMode
  planId: SelfServePlanId | null
  billingCycle: BillingCycle | null
  orderName: string
  organizationName: string
  buyerName: string
  buyerEmail: string
  buyerPhone: string | null
  amount: number // KRW
  currency: string
  provider: string
  status: CheckoutOrderStatus
  paymentKey: string | null
  paymentMethod: string | null
  easyPayProvider: string | null
  failureCode: string | null
  failureMessage: string | null
  approvedAt: string | null
  receiptUrl: string | null
  quoteCodeId: string | null
  appliedPromoCodeId: string | null
  rawPrepare: Record<string, unknown> | null
  createdAt: string
  updatedAt: string
}

export interface SubscriptionOrderCreated extends SoftwareCheckoutOrder {
  mode: "subscription"
  planId: SelfServePlanId
  billingCycle: BillingCycle
  accountCount: number
  amountUsd: number
  fxRate: number
  fxFetchedAt: string
  fxSource: string
}

export interface BusinessOrderCreated extends SoftwareCheckoutOrder {
  mode: "business"
  amountCny: number
  amountCnyBeforeDiscount: number
  fxRate: number
  fxFetchedAt: string
  fxSource: string
  quoteCode: SoftwareQuoteCode | null
  appliedPromo: PromoCode | null
  discount: {
    currency: string
    amount: number
  } | null
}

interface CheckoutOrderRow {
  id: string
  order_id: string
  mode: CheckoutOrderMode
  plan_id: SelfServePlanId | null
  billing_cycle: BillingCycle | null
  order_name: string
  organization_name: string
  buyer_name: string
  buyer_email: string
  buyer_phone: string | null
  amount: number
  currency: string
  provider: string
  status: CheckoutOrderStatus
  payment_key: string | null
  payment_method: string | null
  easy_pay_provider: string | null
  failure_code: string | null
  failure_message: string | null
  approved_at: string | null
  receipt_url: string | null
  quote_code_id: string | null
  applied_promo_code_id: string | null
  raw_prepare: Record<string, unknown> | null
  created_at: string
  updated_at: string
}

function normalizeString(value: unknown) {
  if (typeof value !== "string") return ""
  return value.trim()
}

function normalizePhone(value: unknown) {
  const digits = normalizeString(value).replace(/\D/g, "")
  return digits.length >= 8 ? digits : ""
}

function parseBillingCycle(value: unknown): BillingCycle {
  if (value === "monthly" || value === "yearly") return value
  throw new Error("billingCycle must be monthly or yearly.")
}

function parsePlanId(value: unknown): SelfServePlanId {
  if (value === "standard" || value === "plus") return value
  throw new Error("planId must be standard or plus.")
}

function parseAccountCount(value: unknown): number {
  const n = typeof value === "number" ? value : Number.parseInt(String(value ?? ""), 10)
  return clampAccountCount(n)
}

function parseAmountCny(value: unknown): number {
  const n = typeof value === "number" ? value : Number.parseFloat(String(value ?? ""))
  return Number.isFinite(n) ? Math.round(n) : Number.NaN
}

function mapCheckoutOrder(row: CheckoutOrderRow): SoftwareCheckoutOrder {
  return {
    id: row.id,
    orderId: row.order_id,
    mode: row.mode ?? "subscription",
    planId: row.plan_id,
    billingCycle: row.billing_cycle,
    orderName: row.order_name,
    organizationName: row.organization_name,
    buyerName: row.buyer_name,
    buyerEmail: row.buyer_email,
    buyerPhone: row.buyer_phone,
    amount: row.amount,
    currency: row.currency,
    provider: row.provider,
    status: row.status,
    paymentKey: row.payment_key,
    paymentMethod: row.payment_method,
    easyPayProvider: row.easy_pay_provider,
    failureCode: row.failure_code,
    failureMessage: row.failure_message,
    approvedAt: row.approved_at,
    receiptUrl: row.receipt_url,
    quoteCodeId: row.quote_code_id,
    appliedPromoCodeId: row.applied_promo_code_id,
    rawPrepare: row.raw_prepare,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function createOrderId(prefix: string) {
  return `${prefix}_${Date.now()}_${crypto.randomUUID().replace(/-/g, "").slice(0, 12)}`
}

function pickEasyPayProvider(payload: TossConfirmPaymentResponse) {
  const easyPay = payload.easyPay
  if (!easyPay || typeof easyPay !== "object") return null
  return typeof easyPay.provider === "string" ? easyPay.provider : null
}

// ─── 공통 본인확인 ──────────────────────────────────────

function validateBuyerIdentity(body: Record<string, unknown>) {
  const organizationName = normalizeString(body.organizationName)
  const buyerName = normalizeString(body.buyerName)
  const buyerEmail = normalizeString(body.buyerEmail).toLowerCase()
  const buyerPhone = normalizePhone(body.buyerPhone)

  if (!organizationName) throw new Error("organizationName is required.")
  if (!buyerName) throw new Error("buyerName is required.")
  if (!buyerEmail || !EMAIL_REGEX.test(buyerEmail)) {
    throw new Error("buyerEmail is invalid.")
  }

  return { organizationName, buyerName, buyerEmail, buyerPhone }
}

// ─── Subscription order ──────────────────────────────────

export async function createSubscriptionCheckoutOrder(raw: unknown): Promise<SubscriptionOrderCreated> {
  if (!raw || typeof raw !== "object") {
    throw new Error("Invalid checkout request body.")
  }

  const body = raw as Record<string, unknown>
  const planId = parsePlanId(body.planId)
  const billingCycle = parseBillingCycle(body.billingCycle)
  const accountCount = parseAccountCount(body.accountCount)
  const identity = validateBuyerIdentity(body)

  const plan = getSelfServeSoftwarePlan(planId)
  const price = billingCycle === "monthly" ? plan.monthly : plan.yearly
  const amountUsd = computeSubscriptionAmountUsd(planId, billingCycle, accountCount)

  const fx = await getFxRates()
  const amountKrw = convertUsdToKrw(amountUsd, fx.usdKrw)
  if (amountKrw <= 0) {
    throw new Error("결제 금액 환산에 실패했습니다.")
  }

  const orderId = createOrderId("sw_sub")
  const orderName = `${plan.title} ${getBillingCycleLabel(billingCycle)} 이용권 · ${accountCount}계정`

  const supabase = createSupabaseAdminClient()
  const { data, error } = await supabase
    .from("software_checkout_orders")
    .insert({
      order_id: orderId,
      mode: "subscription",
      plan_id: planId,
      billing_cycle: billingCycle,
      order_name: orderName,
      organization_name: identity.organizationName,
      buyer_name: identity.buyerName,
      buyer_email: identity.buyerEmail,
      buyer_phone: identity.buyerPhone || null,
      amount: amountKrw,
      currency: "KRW",
      provider: "toss_payments",
      status: "pending",
      raw_prepare: {
        planTitle: plan.title,
        priceLabel: price.label,
        accountCount,
        amountUsd,
        fxRate: fx.usdKrw,
        fxFetchedAt: fx.fetchedAt,
        fxSource: fx.source,
      },
    })
    .select("*")
    .single()

  if (error) throw error

  const order = mapCheckoutOrder(data as CheckoutOrderRow)
  return {
    ...order,
    mode: "subscription",
    planId,
    billingCycle,
    accountCount,
    amountUsd,
    fxRate: fx.usdKrw,
    fxFetchedAt: fx.fetchedAt,
    fxSource: fx.source,
  }
}

// Phase 1 API 호환용 별칭. 기존 호출부 유지.
export const createSoftwareCheckoutOrder = createSubscriptionCheckoutOrder

// ─── Business order ──────────────────────────────────────

export async function createBusinessRechargeOrder(raw: unknown): Promise<BusinessOrderCreated> {
  if (!raw || typeof raw !== "object") {
    throw new Error("Invalid checkout request body.")
  }

  const body = raw as Record<string, unknown>
  const identity = validateBuyerIdentity(body)

  const quoteCodeInput = normalizeString(body.quoteCode)
  const promoCodeInput = normalizeString(body.promoCode)
  const requestedAmountCny = parseAmountCny(body.amountCny)

  // 견적 코드가 있으면 amountCny 를 견적에서 덮어쓴다.
  let quoteCode: SoftwareQuoteCode | null = null
  if (quoteCodeInput) {
    const result = await validateQuoteCode(quoteCodeInput, "business_recharge")
    if (!result.ok) {
      throw new Error(result.message)
    }
    quoteCode = result.code
  }

  const baseAmountCny = quoteCode?.amountCny ?? requestedAmountCny
  if (!Number.isFinite(baseAmountCny) || baseAmountCny <= 0) {
    throw new Error("충전 금액을 입력해 주세요.")
  }

  // 견적이 아닌 직접 입력이면 정책 검증.
  if (!quoteCode) {
    const validation = validateRechargeAmount(baseAmountCny)
    if (!validation.ok) {
      throw new Error(validation.reason)
    }
  }

  let appliedPromo: PromoCode | null = null
  let finalAmountCny = baseAmountCny
  let discountAmount = 0

  if (promoCodeInput) {
    const promoResult = await validatePromoCode({
      rawCode: promoCodeInput,
      target: "business_recharge",
      baseAmount: baseAmountCny,
      currency: "CNY",
    })
    if (!promoResult.ok) {
      throw new Error(promoResult.message)
    }
    appliedPromo = promoResult.promo
    finalAmountCny = promoResult.amountAfter
    discountAmount = promoResult.discountAmount
  }

  if (finalAmountCny <= 0) {
    throw new Error("할인이 결제 금액을 초과했습니다. 다른 코드를 사용해 주세요.")
  }

  const fx = await getFxRates()
  const amountKrw = convertCnyToKrw(finalAmountCny, fx.cnyKrw)
  if (amountKrw <= 0) {
    throw new Error("결제 금액 환산에 실패했습니다.")
  }

  const orderId = createOrderId("sw_biz")
  const orderName = buildRechargeOrderName(finalAmountCny)

  const supabase = createSupabaseAdminClient()
  const { data, error } = await supabase
    .from("software_checkout_orders")
    .insert({
      order_id: orderId,
      mode: "business",
      plan_id: null,
      billing_cycle: null,
      order_name: orderName,
      organization_name: identity.organizationName,
      buyer_name: identity.buyerName,
      buyer_email: identity.buyerEmail,
      buyer_phone: identity.buyerPhone || null,
      amount: amountKrw,
      currency: "KRW",
      provider: "toss_payments",
      status: "pending",
      quote_code_id: quoteCode?.id ?? null,
      applied_promo_code_id: appliedPromo?.id ?? null,
      raw_prepare: {
        amountCny: finalAmountCny,
        amountCnyBeforeDiscount: baseAmountCny,
        discountAmountCny: discountAmount,
        fxRate: fx.cnyKrw,
        fxFetchedAt: fx.fetchedAt,
        fxSource: fx.source,
        quoteCode: quoteCode?.code ?? null,
        promoCode: appliedPromo?.code ?? null,
        rules: {
          baseMinCny: BUSINESS_RECHARGE.baseMinCny,
          incrementCny: BUSINESS_RECHARGE.incrementCny,
        },
      },
    })
    .select("*")
    .single()

  if (error) throw error

  const order = mapCheckoutOrder(data as CheckoutOrderRow)
  return {
    ...order,
    mode: "business",
    amountCny: finalAmountCny,
    amountCnyBeforeDiscount: baseAmountCny,
    fxRate: fx.cnyKrw,
    fxFetchedAt: fx.fetchedAt,
    fxSource: fx.source,
    quoteCode,
    appliedPromo,
    discount:
      discountAmount > 0
        ? { currency: "CNY", amount: discountAmount }
        : null,
  }
}

// ─── 조회/상태 전이 ──────────────────────────────────────

export async function getSoftwareCheckoutOrder(orderId: string) {
  const supabase = createSupabaseAdminClient()
  const { data, error } = await supabase
    .from("software_checkout_orders")
    .select("*")
    .eq("order_id", orderId)
    .maybeSingle()

  if (error) throw error
  return data ? mapCheckoutOrder(data as CheckoutOrderRow) : null
}

export async function markSoftwareCheckoutOrderFailed(input: {
  orderId: string
  failureCode?: string | null
  failureMessage?: string | null
  rawFail?: Record<string, unknown> | null
}) {
  const supabase = createSupabaseAdminClient()
  const { data, error } = await supabase
    .from("software_checkout_orders")
    .update({
      status: "failed",
      failure_code: input.failureCode ?? null,
      failure_message: input.failureMessage ?? null,
      raw_fail: input.rawFail ?? null,
    })
    .eq("order_id", input.orderId)
    .in("status", ["pending", "processing"])
    .select("*")
    .maybeSingle()

  if (error) throw error
  return data ? mapCheckoutOrder(data as CheckoutOrderRow) : null
}

export async function markSoftwareCheckoutOrderPaid(
  orderId: string,
  confirmation: TossConfirmPaymentResponse
) {
  const supabase = createSupabaseAdminClient()
  const { data, error } = await supabase
    .from("software_checkout_orders")
    .update({
      status: "paid",
      payment_key: confirmation.paymentKey,
      payment_method:
        typeof confirmation.method === "string" ? confirmation.method : null,
      easy_pay_provider: pickEasyPayProvider(confirmation),
      approved_at:
        typeof confirmation.approvedAt === "string"
          ? confirmation.approvedAt
          : new Date().toISOString(),
      receipt_url:
        confirmation.receipt &&
        typeof confirmation.receipt === "object" &&
        typeof confirmation.receipt.url === "string"
          ? confirmation.receipt.url
          : null,
      raw_confirm: confirmation,
      failure_code: null,
      failure_message: null,
    })
    .eq("order_id", orderId)
    .in("status", ["pending", "processing"])
    .select("*")
    .maybeSingle()

  if (error) throw error
  if (!data) return null

  const order = mapCheckoutOrder(data as CheckoutOrderRow)

  // 코드 redemption 기록 (실패해도 결제 confirm 흐름은 막지 않음)
  try {
    if (order.quoteCodeId) {
      await markQuoteCodeRedeemed(order.quoteCodeId, order.orderId)
    }
  } catch (codeError) {
    console.error("[software-checkout] quote code redemption error:", codeError)
  }

  try {
    if (order.appliedPromoCodeId && order.rawPrepare) {
      const raw = order.rawPrepare as Record<string, unknown>

      // mode 별로 통화와 before/after 필드를 명시적으로 선택.
      // 현재 Phase 1 범위에서는 promo 는 business 주문에만 붙지만,
      // 구조적으로 subscription 확장이 들어와도 안전하도록 분리.
      let before: number | null = null
      let after: number | null = null
      let currency: "CNY" | "USD" | "KRW" | null = null

      if (order.mode === "business") {
        before = Number(raw.amountCnyBeforeDiscount ?? 0)
        after = Number(raw.amountCny ?? 0)
        currency = "CNY"
      }
      // NOTE: subscription + promo is not yet supported. The prepare route does not
      // apply promos to subscription orders, so appliedPromoCodeId will always be null
      // for subscription mode. When subscription promo support is added, add an
      // amountUsdBeforeDiscount field to the prepare response and set before/after here.

      if (
        currency &&
        before != null &&
        after != null &&
        Number.isFinite(before) &&
        Number.isFinite(after)
      ) {
        await recordPromoRedemption({
          promoCodeId: order.appliedPromoCodeId,
          orderId: order.orderId,
          amountBefore: before,
          amountAfter: after,
          currency,
        })
      }
    }
  } catch (promoError) {
    console.error("[software-checkout] promo redemption error:", promoError)
  }

  return order
}
