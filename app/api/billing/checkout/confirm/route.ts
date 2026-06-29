import { NextRequest, NextResponse } from "next/server"

import { confirmTossPayment } from "@/lib/billing/toss"
import { checkRateLimitDistributed, getClientIp } from "@/lib/server/rate-limit"
import {
  getSoftwareCheckoutOrder,
  markSoftwareCheckoutOrderPaid,
  type SoftwareCheckoutOrder,
} from "@/lib/server/software-checkout"
import {
  getMarketingRequestMeta,
  sendServerConversion,
} from "@/lib/marketing/server-conversions"
import { verifyCheckoutToken } from "@/lib/server/security-tokens"

function parseAmount(value: unknown) {
  const amount =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number.parseInt(value, 10)
        : Number.NaN

  return Number.isFinite(amount) && amount > 0 ? amount : null
}

function getPurchaseConversionEventId(orderId: string) {
  return `purchase:${orderId}`
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

function emitPurchaseConversion(req: NextRequest, order: SoftwareCheckoutOrder) {
  const conversionEventId = getPurchaseConversionEventId(order.orderId)
  const sourceUrl =
    getRawPrepareValue(order, "currentPage") ??
    getRawPrepareValue(order, "landingPage") ??
    `${req.nextUrl.origin}/checkout/success`

  void sendServerConversion({
    eventId: conversionEventId,
    metaEventName: "Purchase",
    ga4EventName: "purchase",
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
    console.warn("[billing/checkout/confirm] server conversion failed:", error)
  })

  return conversionEventId
}

export async function POST(req: NextRequest) {
  const ip = getClientIp(req)
  const { allowed } = await checkRateLimitDistributed(ip, "billing-checkout-confirm", {
    windowMs: 60_000,
    max: 20,
  })
  if (!allowed) {
    return NextResponse.json({ error: "Too many requests." }, { status: 429 })
  }

  try {
    const body = (await req.json()) as {
      paymentKey?: string
      orderId?: string
      amount?: string | number
      checkoutToken?: string
    }

    const paymentKey = typeof body.paymentKey === "string" ? body.paymentKey.trim() : ""
    const orderId = typeof body.orderId === "string" ? body.orderId.trim() : ""
    const amount = parseAmount(body.amount)

    if (!paymentKey || !orderId || amount == null) {
      return NextResponse.json(
        { error: "paymentKey, orderId, amount are required." },
        { status: 400 }
      )
    }

    const existingOrder = await getSoftwareCheckoutOrder(orderId)
    if (!existingOrder) {
      return NextResponse.json({ error: "주문을 찾지 못했습니다." }, { status: 404 })
    }

    if (existingOrder.amount !== amount) {
      return NextResponse.json(
        { error: "결제 금액 검증에 실패했습니다." },
        { status: 400 }
      )
    }

    if (!verifyCheckoutToken(orderId, amount, body.checkoutToken)) {
      return NextResponse.json({ error: "Invalid checkout token." }, { status: 403 })
    }

    if (existingOrder.status === "paid" && existingOrder.paymentKey === paymentKey) {
      return NextResponse.json({
        order: {
          ...existingOrder,
          conversionEventId: getPurchaseConversionEventId(existingOrder.orderId),
        },
      })
    }

    const confirmation = await confirmTossPayment({
      paymentKey,
      orderId,
      amount,
    })
    if (confirmation.orderId !== orderId) {
      return NextResponse.json({ error: "Payment order mismatch." }, { status: 400 })
    }
    if (typeof confirmation.totalAmount === "number" && confirmation.totalAmount !== amount) {
      return NextResponse.json({ error: "Payment amount mismatch." }, { status: 400 })
    }
    if (typeof confirmation.status === "string" && confirmation.status !== "DONE") {
      return NextResponse.json({ error: "Payment is not completed." }, { status: 400 })
    }

    const order = await markSoftwareCheckoutOrderPaid(orderId, confirmation)
    if (!order) {
      return NextResponse.json(
        { error: "Order not found or cannot be marked paid." },
        { status: 409 }
      )
    }

    return NextResponse.json({
      order: {
        ...order,
        conversionEventId: emitPurchaseConversion(req, order),
      },
    })
  } catch (error) {
    console.error("[billing/checkout/confirm] POST error:", error)
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "결제 승인 검증에 실패했습니다.",
      },
      { status: 500 }
    )
  }
}
