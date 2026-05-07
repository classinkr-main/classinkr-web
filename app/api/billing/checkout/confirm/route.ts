import { NextRequest, NextResponse } from "next/server"

import { confirmTossPayment } from "@/lib/billing/toss"
import { checkRateLimit, getClientIp } from "@/lib/server/rate-limit"
import {
  getSoftwareCheckoutOrder,
  markSoftwareCheckoutOrderPaid,
} from "@/lib/server/software-checkout"
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

export async function POST(req: NextRequest) {
  const ip = getClientIp(req)
  const { allowed } = checkRateLimit(ip, "billing-checkout-confirm", {
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
      return NextResponse.json({ order: existingOrder })
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

    return NextResponse.json({ order })
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
