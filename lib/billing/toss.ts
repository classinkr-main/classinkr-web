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

// 토스 승인은 비멱등이다. 응답이 없다고 해서 "승인되지 않았다"고 단정하면
// 실제로는 승인된 결제를 실패로 처리하게 되므로, 타임아웃은 일반 실패와 구별해서 던진다.
// 호출부는 이 에러를 받으면 결제 상태를 조회해 화해(reconcile)해야 하며,
// 그냥 실패로 응답하거나 승인을 재시도해서는 안 된다.
const TOSS_CONFIRM_TIMEOUT_MS = Number(
  process.env.TOSS_CONFIRM_TIMEOUT_MS ?? 8_000
)

export class TossConfirmTimeoutError extends Error {
  readonly orderId: string

  constructor(orderId: string) {
    super("결제 승인 결과를 확인하지 못했습니다. 잠시 후 결제 내역을 확인해 주세요.")
    this.name = "TossConfirmTimeoutError"
    this.orderId = orderId
  }
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

  let response: Response
  try {
    response = await fetch("https://api.tosspayments.com/v1/payments/confirm", {
      method: "POST",
      headers: {
        Authorization: `Basic ${buildBasicAuth(secretKey)}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(input),
      cache: "no-store",
      signal: AbortSignal.timeout(TOSS_CONFIRM_TIMEOUT_MS),
    })
  } catch (error) {
    // AbortError(타임아웃) 및 네트워크 단절 — 승인 여부를 알 수 없는 상태다.
    console.error("[toss] 승인 응답 확인 실패", {
      orderId: input.orderId,
      reason: error instanceof Error ? error.name : "unknown",
    })
    throw new TossConfirmTimeoutError(input.orderId)
  }

  const payload = (await response.json().catch(() => null)) as
    | TossConfirmPaymentResponse
    | { code?: string; message?: string }
    | null

  if (!response.ok || !payload) {
    throw new Error(extractErrorMessage(payload))
  }

  return payload as TossConfirmPaymentResponse
}
