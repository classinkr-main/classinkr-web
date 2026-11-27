import { NextRequest, NextResponse } from "next/server"

import { confirmTossPayment, fetchTossPayment, type TossConfirmPaymentResponse } from "@/lib/billing/toss"
import { emitNotificationEvent } from "@/lib/notifications/emit-event"
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

function isAlreadyProcessed(error: unknown) {
  return Boolean(error && typeof error === "object" && (error as { code?: unknown }).code === "ALREADY_PROCESSED_PAYMENT")
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
    requestMeta: getMarketingRequestMeta(req, {
      sourceUrl,
      fbclid: getRawPrepareValue(order, "fbclid"),
    }),
    sourceUrl,
    user: {
      email: order.buyerEmail,
      phone: order.buyerPhone,
      externalId: order.orderId,
      // 결제 패널에는 맞춤형 광고 활용 동의 칸이 없다 — 해시 연락처를 보내지 않는다.
      allowHashedUserData: false,
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

    let confirmation: TossConfirmPaymentResponse
    try {
      confirmation = await confirmTossPayment({
        paymentKey,
        orderId,
        amount,
      })
    } catch (confirmError) {
      // 앞선 요청에서 승인은 끝났는데 주문 기록이 실패했던 건 — 토스는 재승인을 거절한다.
      // 승인된 결제를 다시 읽어 같은 검증을 거친 뒤 기록만 이어 간다(재시도가 복구 경로가 된다).
      if (!isAlreadyProcessed(confirmError)) throw confirmError
      confirmation = await fetchTossPayment(paymentKey)
    }
    if (confirmation.orderId !== orderId) {
      return NextResponse.json({ error: "Payment order mismatch." }, { status: 400 })
    }
    if (typeof confirmation.totalAmount === "number" && confirmation.totalAmount !== amount) {
      return NextResponse.json({ error: "Payment amount mismatch." }, { status: 400 })
    }
    if (typeof confirmation.status === "string" && confirmation.status !== "DONE") {
      return NextResponse.json({ error: "Payment is not completed." }, { status: 400 })
    }

    // 여기부터는 돈이 이미 빠져나간 상태다 — 기록 실패를 일반 오류로 흘리지 않는다.
    let order: SoftwareCheckoutOrder | null = null
    let recordError: unknown = null
    for (let attempt = 0; attempt < 2 && !order; attempt += 1) {
      try {
        order = await markSoftwareCheckoutOrderPaid(orderId, confirmation)
        recordError = null
        if (!order) break
      } catch (error) {
        recordError = error
      }
    }
    if (!order && !recordError) {
      // 다른 요청이 먼저 paid 로 바꿨으면 그 주문을 그대로 돌려준다(멱등).
      const latest = await getSoftwareCheckoutOrder(orderId).catch(() => null)
      if (latest?.status === "paid" && latest.paymentKey === paymentKey) {
        return NextResponse.json({
          order: { ...latest, conversionEventId: getPurchaseConversionEventId(latest.orderId) },
        })
      }
    }
    if (!order) {
      console.error("[billing/checkout/confirm] payment captured but order record failed:", recordError ?? "order not in payable state")
      void emitNotificationEvent({
        eventType: "billing.checkout.capture_record_failed",
        notificationType: "incident",
        categoryTag: "finance",
        severity: "critical",
        title: "결제는 승인됐는데 주문 기록에 실패했습니다",
        message: `주문 ${orderId} — 토스 승인은 끝났지만 주문 상태를 결제 완료로 바꾸지 못했습니다. 고객이 다시 시도하면 자동으로 복구를 시도합니다. 복구되지 않으면 토스 상점관리자의 결제 내역과 대조해 주세요.`,
        routeUrl: "/admin/overview",
        source: "billing_checkout_confirm",
        payload: { orderId, recorded: false, reason: recordError ? "record_error" : "order_not_payable" },
      }).catch(() => {})
      return NextResponse.json(
        {
          error: "결제는 승인되었지만 주문 기록에 실패했습니다. 잠시 뒤 다시 시도해 주세요. 이중 결제되지 않습니다.",
          code: "payment_captured_record_failed",
        },
        { status: recordError ? 500 : 409 }
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
