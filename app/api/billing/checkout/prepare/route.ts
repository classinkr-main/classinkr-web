import { NextRequest, NextResponse } from "next/server"

import { createSoftwareCheckoutOrder } from "@/lib/server/software-checkout"

export async function POST(req: NextRequest) {
  try {
    const order = await createSoftwareCheckoutOrder(await req.json())

    return NextResponse.json(
      {
        orderId: order.orderId,
        orderName: order.orderName,
        amount: order.amount,
      },
      { status: 201 }
    )
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
