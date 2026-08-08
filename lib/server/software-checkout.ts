import "server-only"

import { createSupabaseAdminClient } from "@/lib/supabase/admin"
// FX 는 구독형(USD 정가 → KRW 승인)에서만 쓴다. 충전형은 2026-07 이후 원화 선충전이라 환산이 없다.
import { convertUsdToKrw, getFxRates } from "@/lib/billing/fx"
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
import { emitNotificationEvent } from "@/lib/notifications/emit-event"

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
  /** 승인 요청 금액(KRW). order.amount 와 항상 같다 — 환산이 없기 때문. */
  amountKrw: number
  amountKrwBeforeDiscount: number
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

function parseAmountKrw(value: unknown): number {
  const n = typeof value === "number" ? value : Number.parseFloat(String(value ?? ""))
  return Number.isFinite(n) ? Math.round(n) : Number.NaN
}

const ATTRIBUTION_KEYS = [
  "utmSource",
  "utmMedium",
  "utmCampaign",
  "utmTerm",
  "utmContent",
  "gclid",
  "fbclid",
  "msclkid",
  "ttclid",
  "landingPage",
  "currentPage",
  "referrer",
]

function sanitizeAttribution(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null

  const source = value as Record<string, unknown>
  const attribution: Record<string, string> = {}
  for (const key of ATTRIBUTION_KEYS) {
    const normalized = normalizeString(source[key]).slice(0, 500)
    if (normalized) attribution[key] = normalized
  }

  return Object.keys(attribution).length > 0 ? attribution : null
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
  const attribution = sanitizeAttribution(body.attribution)

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
        attribution,
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
  const attribution = sanitizeAttribution(body.attribution)

  const quoteCodeInput = normalizeString(body.quoteCode)
  const promoCodeInput = normalizeString(body.promoCode)
  const requestedAmountKrw = parseAmountKrw(body.amountKrw)

  // 견적 코드가 있으면 amountKrw 를 견적에서 덮어쓴다.
  let quoteCode: SoftwareQuoteCode | null = null
  if (quoteCodeInput) {
    const result = await validateQuoteCode(quoteCodeInput, "business_recharge")
    if (!result.ok) {
      throw new Error(result.message)
    }
    quoteCode = result.code
  }

  const baseAmountKrw = quoteCode?.amountKrw ?? requestedAmountKrw
  if (!Number.isFinite(baseAmountKrw) || baseAmountKrw <= 0) {
    throw new Error("충전 금액을 입력해 주세요.")
  }

  // 견적이 아닌 직접 입력이면 정책 검증.
  if (!quoteCode) {
    const validation = validateRechargeAmount(baseAmountKrw)
    if (!validation.ok) {
      throw new Error(validation.reason)
    }
  }

  let appliedPromo: PromoCode | null = null
  let finalAmountKrw = baseAmountKrw
  let discountAmount = 0

  if (promoCodeInput) {
    const promoResult = await validatePromoCode({
      rawCode: promoCodeInput,
      target: "business_recharge",
      baseAmount: baseAmountKrw,
      currency: "KRW",
    })
    if (!promoResult.ok) {
      throw new Error(promoResult.message)
    }
    appliedPromo = promoResult.promo
    // percent 할인은 소수점이 남을 수 있다 — Toss 승인 금액은 원 단위 정수여야 하므로 반올림.
    finalAmountKrw = Math.round(promoResult.amountAfter)
    discountAmount = Math.round(promoResult.discountAmount)
  }

  if (finalAmountKrw <= 0) {
    throw new Error("할인이 결제 금액을 초과했습니다. 다른 코드를 사용해 주세요.")
  }

  // 환산 없음 — 입력 원화가 곧 Toss 승인 금액이다.
  const amountKrw = finalAmountKrw

  const orderId = createOrderId("sw_biz")
  const orderName = buildRechargeOrderName(finalAmountKrw)

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
        currency: "KRW",
        amountKrw: finalAmountKrw,
        amountKrwBeforeDiscount: baseAmountKrw,
        discountAmountKrw: discountAmount,
        quoteCode: quoteCode?.code ?? null,
        promoCode: appliedPromo?.code ?? null,
        attribution,
        rules: {
          baseMinKrw: BUSINESS_RECHARGE.baseMinKrw,
          incrementKrw: BUSINESS_RECHARGE.incrementKrw,
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
    amountKrw: finalAmountKrw,
    amountKrwBeforeDiscount: baseAmountKrw,
    quoteCode,
    appliedPromo,
    discount:
      discountAmount > 0
        ? { currency: "KRW", amount: discountAmount }
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

// 결제 자체는 이미 완료된 뒤이므로 코드 반영 실패가 confirm 응답을 막아서는 안 된다.
// emitNotificationEvent 호출 자체가 실패해도(웹훅 설정 누락, DB 오류 등) 여기서 흡수해
// 결제 confirm 흐름에는 절대 영향을 주지 않는다.
// NOTE: lib/notifications/types.ts 에는 이 상황 전용 eventType/notificationType 이 없다.
// 해당 파일은 다른 작업이 동시에 수정 중이라 이번 변경에서는 건드리지 않고,
// 기존 타입 중 가장 근접한 "warning" + categoryTag "finance" 조합으로 대체한다.
/** 위컴·알림 payload 에 실을 오류 요약 — 이름 + 본문 앞 120자. DB 내부 상세 노출을 줄인다. */
const MAX_REDEMPTION_ERROR_CHARS = 120

function summarizeRedemptionError(error: unknown) {
  const name = error instanceof Error ? error.name : typeof error
  const raw = error instanceof Error ? error.message : String(error)
  const flattened = raw.replace(/\s+/g, " ").trim()
  if (!flattened) return name
  const body =
    flattened.length > MAX_REDEMPTION_ERROR_CHARS
      ? `${flattened.slice(0, MAX_REDEMPTION_ERROR_CHARS)}…`
      : flattened
  return `${name}: ${body}`
}

async function notifyRedemptionFailure(input: {
  kind: "quote_code" | "promo_code"
  orderId: string
  codeId: string | null
  error: unknown
}) {
  const label = input.kind === "quote_code" ? "견적 코드" : "프로모 코드"
  const errorMessage = summarizeRedemptionError(input.error)

  try {
    await emitNotificationEvent({
      eventType: `billing.${input.kind}_redemption_failed`,
      notificationType: "warning",
      categoryTag: "finance",
      severity: "warning",
      scopeTag: "org_admin",
      title: `결제 완료 후 ${label} 반영 실패`,
      message: [
        `주문 ${input.orderId} 결제는 정상 완료됐지만 ${label} 사용 처리가 실패했습니다.`,
        `코드 ID: ${input.codeId ?? "unknown"}`,
        `오류: ${errorMessage}`,
        "코드가 미반영 상태로 남아있을 수 있으니 수동으로 확인해 주세요.",
      ].join("\n"),
      source: "billing",
      sourceId: input.orderId,
      payload: {
        orderId: input.orderId,
        codeId: input.codeId,
        kind: input.kind,
        errorMessage,
      },
      channels: ["wecom_webhook"],
    })
  } catch (notifyError) {
    console.error(
      `[software-checkout] ${label} redemption failure notification error:`,
      notifyError
    )
  }
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
    // 결제는 이미 끝났다 — 알림 외부 호출(위컴)이 confirm 응답을 붙잡지 않게 await 하지 않는다.
    void notifyRedemptionFailure({
      kind: "quote_code",
      orderId: order.orderId,
      codeId: order.quoteCodeId,
      error: codeError,
    }).catch((notifyError) => {
      console.error("[software-checkout] quote code failure notify error:", notifyError)
    })
  }

  try {
    if (order.appliedPromoCodeId && order.rawPrepare) {
      const raw = order.rawPrepare as Record<string, unknown>

      // mode 별로 통화와 before/after 필드를 명시적으로 선택.
      // 현재 Phase 1 범위에서는 promo 는 business 주문에만 붙지만,
      // 구조적으로 subscription 확장이 들어와도 안전하도록 분리.
      let before: number | null = null
      let after: number | null = null
      let currency: "USD" | "KRW" | null = null

      if (order.mode === "business") {
        before = Number(raw.amountKrwBeforeDiscount ?? 0)
        after = Number(raw.amountKrw ?? 0)
        currency = "KRW"
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
    void notifyRedemptionFailure({
      kind: "promo_code",
      orderId: order.orderId,
      codeId: order.appliedPromoCodeId,
      error: promoError,
    }).catch((notifyError) => {
      console.error("[software-checkout] promo failure notify error:", notifyError)
    })
  }

  return order
}
