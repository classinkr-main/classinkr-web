import { NextRequest, NextResponse } from "next/server"

import { markSoftwareCheckoutOrderFailed } from "@/lib/server/software-checkout"

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      orderId?: string
      code?: string
      message?: string
    }

    const orderId = typeof body.orderId === "string" ? body.orderId.trim() : ""
    if (!orderId) {
      return NextResponse.json({ error: "orderId is required." }, { status: 400 })
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

    return NextResponse.json({ order })
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
