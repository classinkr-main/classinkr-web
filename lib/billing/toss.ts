import "server-only"

import { getTossSecretKey } from "@/lib/billing/server-env"

export interface TossConfirmPaymentResponse {
  paymentKey: string
  orderId: string
  orderName: string
  method?: string
  status?: string
  approvedAt?: string
  easyPay?: {
    provider?: string
    amount?: number
    discountAmount?: number
  } | null
  totalAmount?: number
  suppliedAmount?: number
  vat?: number
  balanceAmount?: number
  receipt?: {
    url?: string
  } | null
  [key: string]: unknown
}

function buildBasicAuth(secretKey: string) {
  return Buffer.from(`${secretKey}:`).toString("base64")
}

function extractErrorMessage(payload: unknown) {
  if (!payload || typeof payload !== "object") {
    return "토스 결제 승인에 실패했습니다."
  }

  const message = "message" in payload ? payload.message : null
  return typeof message === "string" && message.trim()
    ? message
    : "토스 결제 승인에 실패했습니다."
}

export async function confirmTossPayment(input: {
  paymentKey: string
  orderId: string
  amount: number
}) {
  const secretKey = getTossSecretKey()

  const response = await fetch("https://api.tosspayments.com/v1/payments/confirm", {
    method: "POST",
    headers: {
      Authorization: `Basic ${buildBasicAuth(secretKey)}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(input),
    cache: "no-store",
  })

  const payload = (await response.json().catch(() => null)) as
    | TossConfirmPaymentResponse
    | { code?: string; message?: string }
    | null

  if (!response.ok || !payload) {
    throw new Error(extractErrorMessage(payload))
  }

  return payload as TossConfirmPaymentResponse
}
