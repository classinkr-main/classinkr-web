import { NextRequest, NextResponse } from "next/server"

import {
  createBusinessRechargeOrder,
  createSubscriptionCheckoutOrder,
  type SoftwareCheckoutOrder,
} from "@/lib/server/software-checkout"
import {
  getMarketingRequestMeta,
  sendServerConversion,
} from "@/lib/marketing/server-conversions"
import { checkRateLimitDistributed, getClientIp } from "@/lib/server/rate-limit"
import { createCheckoutToken } from "@/lib/server/security-tokens"

function getBeginCheckoutConversionEventId(orderId: string) {
  return `begin_checkout:${orderId}`
}

function getRawPrepareValue(order: SoftwareCheckoutOrder, key: string) {
  const rawPrepare = order.rawPrepare
  if (!rawPrepare || typeof rawPrepare !== "object" || Array.isArray(rawPrepare)) {
    return undefined
  }

  const attribution = rawPrepare.attribution
  if (!attribution || typeof attribution !== "object" || Array.isArray(attribution)) {
    return undefined
  }

  const value = (attribution as Record<string, unknown>)[key]
  return typeof value === "string" && value.trim() ? value.trim() : undefined
}

function emitBeginCheckoutConversion(req: NextRequest, order: SoftwareCheckoutOrder) {
  const conversionEventId = getBeginCheckoutConversionEventId(order.orderId)
  const sourceUrl =
    getRawPrepareValue(order, "currentPage") ??
    getRawPrepareValue(order, "landingPage") ??
    `${req.nextUrl.origin}/checkout`

  void sendServerConversion({
    eventId: conversionEventId,
    metaEventName: "InitiateCheckout",
    ga4EventName: "begin_checkout",
    requestMeta: getMarketingRequestMeta(req, {
      sourceUrl,
      fbclid: getRawPrepareValue(order, "fbclid"),
    }),
    sourceUrl,
    user: {
      email: order.buyerEmail,
      phone: order.buyerPhone,
      externalId: order.orderId,
      allowHashedUserData: true,
    },
    customData: {
      transaction_id: order.orderId,
      order_id: order.orderId,
      value: order.amount,
      currency: order.currency,
      content_name: order.orderName,
      checkout_mode: order.mode,
      plan_id: order.planId,
      billing_cycle: order.billingCycle,
    },
  }).catch((error) => {
    console.warn("[billing/checkout/prepare] server conversion failed:", error)
  })

  return conversionEventId
}

export async function POST(req: NextRequest) {
  const ip = getClientIp(req)
  const { allowed } = await checkRateLimitDistributed(ip, "billing-checkout-prepare", {
    windowMs: 60_000,
    max: 12,
  })
  if (!allowed) {
    return NextResponse.json({ error: "Too many requests." }, { status: 429 })
  }

  try {
    const body = await req.json()
    const mode = typeof body?.mode === "string" ? body.mode : "subscription"

    if (mode === "subscription") {
      const order = await createSubscriptionCheckoutOrder(body)
      return NextResponse.json(
        {
          mode: "subscription",
          orderId: order.orderId,
          checkoutToken: createCheckoutToken(order.orderId, order.amount),
          orderName: order.orderName,
          conversionEventId: emitBeginCheckoutConversion(req, order),
          amount: order.amount,
          amountKrw: order.amount,
          amountUsd: order.amountUsd,
          accountCount: order.accountCount,
          fxRate: order.fxRate,
          fxFetchedAt: order.fxFetchedAt,
          fxIsStale: order.fxSource === "env_fallback",
        },
        { status: 201 }
      )
    }

    if (mode === "business") {
      const order = await createBusinessRechargeOrder(body)
      return NextResponse.json(
        {
          mode: "business",
          orderId: order.orderId,
          checkoutToken: createCheckoutToken(order.orderId, order.amount),
          orderName: order.orderName,
          conversionEventId: emitBeginCheckoutConversion(req, order),
          amount: order.amount,
          amountKrw: order.amount,
          amountCny: order.amountCny,
          amountCnyBeforeDiscount: order.amountCnyBeforeDiscount,
          discount: order.discount,
          fxRate: order.fxRate,
          fxFetchedAt: order.fxFetchedAt,
          fxIsStale: order.fxSource === "env_fallback",
          quoteCode: order.quoteCode?.code ?? null,
          promoCode: order.appliedPromo?.code ?? null,
        },
        { status: 201 }
      )
    }

    return NextResponse.json({ error: "지원하지 않는 결제 모드입니다." }, { status: 400 })
  } catch (error) {
    console.error("[billing/checkout/prepare] POST error:", error)
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "주문 준비에 실패했습니다.",
      },
      { status: 400 }
    )
  }
}
