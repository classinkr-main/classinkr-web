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

/** 토스 호출 하나의 상한 — 응답이 안 오면 결제 확인 요청이 플랫폼 상한까지 붙잡힌다. */
const TOSS_REQUEST_TIMEOUT_MS = 15_000

/** 토스가 돌려준 오류 코드(예: ALREADY_PROCESSED_PAYMENT)를 실어 보낸다 — 호출부가 복구 경로를 고른다. */
export class TossApiError extends Error {
  readonly code: string | null
  readonly status: number | null
  readonly timedOut: boolean

  constructor(message: string, options: { code?: string | null; status?: number | null; timedOut?: boolean } = {}) {
    super(message)
    this.name = "TossApiError"
    this.code = options.code ?? null
    this.status = options.status ?? null
    this.timedOut = options.timedOut ?? false
  }
}

async function tossRequest(path: string, init: RequestInit): Promise<TossConfirmPaymentResponse> {
  const secretKey = getTossSecretKey()
  let response: Response
  try {
    response = await fetch(`https://api.tosspayments.com${path}`, {
      ...init,
      headers: {
        Authorization: `Basic ${buildBasicAuth(secretKey)}`,
        "Content-Type": "application/json",
        ...(init.headers ?? {}),
      },
      cache: "no-store",
      signal: AbortSignal.timeout(TOSS_REQUEST_TIMEOUT_MS),
    })
  } catch (error) {
    if (error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError")) {
      throw new TossApiError("토스 결제 서버 응답이 지연되고 있습니다. 잠시 뒤 다시 시도해 주세요.", { timedOut: true })
    }
    throw error
  }

  const payload = (await response.json().catch(() => null)) as
    | TossConfirmPaymentResponse
    | { code?: string; message?: string }
    | null

  if (!response.ok || !payload) {
    const code = payload && typeof payload === "object" && typeof payload.code === "string" ? payload.code : null
    throw new TossApiError(extractErrorMessage(payload), { code, status: response.status })
  }

  return payload as TossConfirmPaymentResponse
}

export async function confirmTossPayment(input: {
  paymentKey: string
  orderId: string
  amount: number
}) {
  return tossRequest("/v1/payments/confirm", { method: "POST", body: JSON.stringify(input) })
}

/** 이미 승인된 결제를 다시 읽는다 — 승인은 됐는데 주문 기록이 실패했던 건을 재시도에서 복구할 때 쓴다. */
export async function fetchTossPayment(paymentKey: string) {
  return tossRequest(`/v1/payments/${encodeURIComponent(paymentKey)}`, { method: "GET" })
}
