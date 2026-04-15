import "server-only"

import { createSupabaseAdminClient } from "@/lib/supabase/admin"
import {
  getBillingCycleLabel,
  getSelfServeSoftwarePlan,
  type BillingCycle,
  type SelfServePlanId,
} from "@/lib/billing/plans"
import type { TossConfirmPaymentResponse } from "@/lib/billing/toss"

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export type CheckoutOrderStatus =
  | "pending"
  | "processing"
  | "paid"
  | "failed"
  | "canceled"

export interface SoftwareCheckoutOrder {
  id: string
  orderId: string
  planId: SelfServePlanId
  billingCycle: BillingCycle
  orderName: string
  organizationName: string
  buyerName: string
  buyerEmail: string
  buyerPhone: string | null
  amount: number
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
  createdAt: string
  updatedAt: string
}

interface CheckoutOrderRow {
  id: string
  order_id: string
  plan_id: SelfServePlanId
  billing_cycle: BillingCycle
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

function mapCheckoutOrder(row: CheckoutOrderRow): SoftwareCheckoutOrder {
  return {
    id: row.id,
    orderId: row.order_id,
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
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function createOrderId() {
  return `sw_${Date.now()}_${crypto.randomUUID().replace(/-/g, "").slice(0, 12)}`
}

function pickEasyPayProvider(payload: TossConfirmPaymentResponse) {
  const easyPay = payload.easyPay
  if (!easyPay || typeof easyPay !== "object") return null
  return typeof easyPay.provider === "string" ? easyPay.provider : null
}

export async function createSoftwareCheckoutOrder(raw: unknown) {
  if (!raw || typeof raw !== "object") {
    throw new Error("Invalid checkout request body.")
  }

  const body = raw as Record<string, unknown>
  const planId = parsePlanId(body.planId)
  const billingCycle = parseBillingCycle(body.billingCycle)
  const organizationName = normalizeString(body.organizationName)
  const buyerName = normalizeString(body.buyerName)
  const buyerEmail = normalizeString(body.buyerEmail).toLowerCase()
  const buyerPhone = normalizePhone(body.buyerPhone)

  if (!organizationName) throw new Error("organizationName is required.")
  if (!buyerName) throw new Error("buyerName is required.")
  if (!buyerEmail || !EMAIL_REGEX.test(buyerEmail)) {
    throw new Error("buyerEmail is invalid.")
  }

  const plan = getSelfServeSoftwarePlan(planId)
  const price = billingCycle === "monthly" ? plan.monthly : plan.yearly
  const orderId = createOrderId()
  const orderName = `${plan.title} ${getBillingCycleLabel(billingCycle)} 이용권`

  const supabase = createSupabaseAdminClient()
  const { data, error } = await supabase
    .from("software_checkout_orders")
    .insert({
      order_id: orderId,
      plan_id: planId,
      billing_cycle: billingCycle,
      order_name: orderName,
      organization_name: organizationName,
      buyer_name: buyerName,
      buyer_email: buyerEmail,
      buyer_phone: buyerPhone || null,
      amount: price.amount,
      currency: "KRW",
      provider: "toss_payments",
      status: "pending",
      raw_prepare: {
        planTitle: plan.title,
        priceLabel: price.label,
      },
    })
    .select("*")
    .single()

  if (error) throw error
  return mapCheckoutOrder(data as CheckoutOrderRow)
}

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
    .select("*")
    .single()

  if (error) throw error
  return mapCheckoutOrder(data as CheckoutOrderRow)
}
