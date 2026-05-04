import { NextRequest, NextResponse } from "next/server"

import {
  createBusinessRechargeOrder,
  createSubscriptionCheckoutOrder,
} from "@/lib/server/software-checkout"
import { checkRateLimit, getClientIp } from "@/lib/server/rate-limit"
import { createCheckoutToken } from "@/lib/server/security-tokens"

export async function POST(req: NextRequest) {
  const ip = getClientIp(req)
  const { allowed } = checkRateLimit(ip, "billing-checkout-prepare", {
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
