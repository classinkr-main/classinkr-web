// SW 결제 패널에는 맞춤형 광고 활용 동의 칸이 없다 — prepare·confirm 의 서버 전환은 해시 연락처를 보내지 않는다.
import { NextRequest } from "next/server"
import { afterEach, describe, expect, it, vi } from "vitest"

const ORDER = {
  orderId: "order-1",
  orderName: "ClassIn 구독",
  amount: 10000,
  currency: "KRW",
  mode: "subscription",
  buyerEmail: "buyer@example.com",
  buyerPhone: "010-1234-5678",
  status: "pending",
  rawPrepare: {},
}

const sendServerConversion = vi.fn().mockResolvedValue({})

vi.mock("@/lib/marketing/server-conversions", () => ({
  getMarketingRequestMeta: vi.fn(() => null),
  sendServerConversion,
}))
vi.mock("@/lib/server/rate-limit", () => ({
  checkRateLimitDistributed: vi.fn().mockResolvedValue({ allowed: true, resetAt: 0 }),
  getClientIp: vi.fn(() => "203.0.113.50"),
}))
vi.mock("@/lib/server/security-tokens", () => ({
  createCheckoutToken: vi.fn(() => "token"),
  verifyCheckoutToken: vi.fn(() => true),
}))
vi.mock("@/lib/billing/public-env", () => ({ isSoftwareCheckoutEnabled: () => true }))
vi.mock("@/lib/billing/toss", () => ({
  confirmTossPayment: vi.fn().mockResolvedValue({ orderId: "order-1", totalAmount: 10000, status: "DONE" }),
}))
vi.mock("@/lib/server/software-checkout", () => ({
  createSubscriptionCheckoutOrder: vi.fn().mockResolvedValue(ORDER),
  createBusinessRechargeOrder: vi.fn(),
  getSoftwareCheckoutOrder: vi.fn().mockResolvedValue(ORDER),
  markSoftwareCheckoutOrderPaid: vi.fn().mockResolvedValue({ ...ORDER, status: "paid" }),
}))

function post(path: string, body: Record<string, unknown>) {
  return new NextRequest(`https://classin.co.kr${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  })
}

describe("billing checkout server conversions", () => {
  afterEach(() => sendServerConversion.mockClear())

  it("prepare sends allowHashedUserData: false", async () => {
    const { POST } = await import("@/app/api/billing/checkout/prepare/route")
    const response = await POST(post("/api/billing/checkout/prepare", { mode: "subscription" }))

    expect(response.status).toBe(201)
    expect(sendServerConversion).toHaveBeenCalledWith(expect.objectContaining({
      metaEventName: "InitiateCheckout",
      user: expect.objectContaining({ allowHashedUserData: false }),
    }))
  })

  it("confirm sends allowHashedUserData: false", async () => {
    const { POST } = await import("@/app/api/billing/checkout/confirm/route")
    const response = await POST(
      post("/api/billing/checkout/confirm", { paymentKey: "pk", orderId: "order-1", amount: 10000, checkoutToken: "token" })
    )

    expect(response.status).toBe(200)
    expect(sendServerConversion).toHaveBeenCalledWith(expect.objectContaining({
      metaEventName: "Purchase",
      user: expect.objectContaining({ allowHashedUserData: false }),
    }))
  })
})
