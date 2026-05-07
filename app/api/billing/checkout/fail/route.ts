import { NextRequest, NextResponse } from "next/server"

import { checkRateLimit, getClientIp } from "@/lib/server/rate-limit"
import {
  getSoftwareCheckoutOrder,
  markSoftwareCheckoutOrderFailed,
} from "@/lib/server/software-checkout"
import { verifyCheckoutToken } from "@/lib/server/security-tokens"

export async function POST(req: NextRequest) {
  const ip = getClientIp(req)
  const { allowed } = checkRateLimit(ip, "billing-checkout-fail", {
    windowMs: 60_000,
    max: 20,
  })
  if (!allowed) {
    return NextResponse.json({ error: "Too many requests." }, { status: 429 })
  }

  try {
    const body = (await req.json()) as {
      orderId?: string
      code?: string
      message?: string
      checkoutToken?: string
    }

    const orderId = typeof body.orderId === "string" ? body.orderId.trim() : ""
    if (!orderId) {
      return NextResponse.json({ error: "orderId is required." }, { status: 400 })
    }

    const existingOrder = await getSoftwareCheckoutOrder(orderId)
    if (!existingOrder) {
      return NextResponse.json({ error: "Order not found." }, { status: 404 })
    }
    if (!verifyCheckoutToken(orderId, existingOrder.amount, body.checkoutToken)) {
      return NextResponse.json({ error: "Invalid checkout token." }, { status: 403 })
    }

    const order = await markSoftwareCheckoutOrderFailed({
      orderId,
      failureCode: typeof body.code === "string" ? body.code : null,
      failureMessage: typeof body.message === "string" ? body.message : null,
      rawFail: {
        code: body.code,
        message: body.message,
      },
    })
    if (!order) {
      return NextResponse.json(
        { error: "Order not found or cannot be marked failed." },
        { status: 409 }
      )
    }

    return NextResponse.json({
      ok: true,
      order: {
        orderId: order.orderId,
        status: order.status,
      },
    })
  } catch (error) {
    console.error("[billing/checkout/fail] POST error:", error)
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "실패 주문 상태 저장에 실패했습니다.",
      },
      { status: 500 }
    )
  }
}
