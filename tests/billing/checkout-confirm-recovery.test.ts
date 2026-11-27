// 결제 승인 뒤 주문 기록이 실패했을 때의 복구 경로(2026-11-25 점검 B-5).
// 돈이 빠져나간 뒤의 실패는 일반 오류로 흘리지 않고, 재시도가 토스 재승인 거절을 만나면 승인된 결제를 다시 읽어 기록을 잇는다.
import { NextRequest } from "next/server"
import { beforeEach, describe, expect, it, vi } from "vitest"

const ORDER = {
  orderId: "order-1",
  orderName: "ClassIn 구독",
  amount: 10000,
  currency: "KRW",
  mode: "subscription",
  buyerEmail: "buyer@example.com",
  buyerPhone: "010-0000-0000",
  status: "pending",
  paymentKey: null as string | null,
  rawPrepare: {},
}
const DONE = { paymentKey: "pay-1", orderId: "order-1", orderName: "ClassIn 구독", totalAmount: 10000, status: "DONE" }

const confirmTossPayment = vi.fn()
const fetchTossPayment = vi.fn()
const getSoftwareCheckoutOrder = vi.fn()
const markSoftwareCheckoutOrderPaid = vi.fn()
const emitNotificationEvent = vi.fn().mockResolvedValue(undefined)

vi.mock("@/lib/marketing/server-conversions", () => ({
  getMarketingRequestMeta: vi.fn(() => null),
  sendServerConversion: vi.fn().mockResolvedValue({}),
}))
vi.mock("@/lib/server/rate-limit", () => ({
  checkRateLimitDistributed: vi.fn().mockResolvedValue({ allowed: true, resetAt: 0 }),
  getClientIp: vi.fn(() => "203.0.113.50"),
}))
vi.mock("@/lib/server/security-tokens", () => ({ verifyCheckoutToken: vi.fn(() => true) }))
vi.mock("@/lib/billing/toss", () => ({ confirmTossPayment, fetchTossPayment }))
vi.mock("@/lib/server/software-checkout", () => ({ getSoftwareCheckoutOrder, markSoftwareCheckoutOrderPaid }))
vi.mock("@/lib/notifications/emit-event", () => ({ emitNotificationEvent }))

function confirm() {
  return new NextRequest("https://classin.co.kr/api/billing/checkout/confirm", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ paymentKey: "pay-1", orderId: "order-1", amount: 10000, checkoutToken: "token" }),
  })
}

describe("POST /api/billing/checkout/confirm — 승인 뒤 기록 실패 복구", () => {
  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    confirmTossPayment.mockReset().mockResolvedValue(DONE)
    fetchTossPayment.mockReset().mockResolvedValue(DONE)
    getSoftwareCheckoutOrder.mockReset().mockResolvedValue(ORDER)
    markSoftwareCheckoutOrderPaid.mockReset().mockResolvedValue({ ...ORDER, status: "paid", paymentKey: "pay-1" })
    emitNotificationEvent.mockClear()
  })

  it("토스가 이미 처리된 결제라고 거절하면 승인된 결제를 다시 읽어 주문을 결제 완료로 기록한다", async () => {
    confirmTossPayment.mockRejectedValue(Object.assign(new Error("이미 처리된 결제 입니다."), { code: "ALREADY_PROCESSED_PAYMENT" }))
    const { POST } = await import("@/app/api/billing/checkout/confirm/route")
    const response = await POST(confirm())

    expect(response.status).toBe(200)
    expect(fetchTossPayment).toHaveBeenCalledWith("pay-1")
    expect(markSoftwareCheckoutOrderPaid).toHaveBeenCalledWith("order-1", DONE)
  })

  it("다시 읽은 결제의 주문·금액·상태가 다르면 기록하지 않는다", async () => {
    confirmTossPayment.mockRejectedValue(Object.assign(new Error("이미 처리된 결제 입니다."), { code: "ALREADY_PROCESSED_PAYMENT" }))
    fetchTossPayment.mockResolvedValue({ ...DONE, totalAmount: 99 })
    const { POST } = await import("@/app/api/billing/checkout/confirm/route")
    const response = await POST(confirm())

    expect(response.status).toBe(400)
    expect(markSoftwareCheckoutOrderPaid).not.toHaveBeenCalled()
  })

  it("다른 토스 오류는 복구 경로로 가지 않고 그대로 실패한다", async () => {
    confirmTossPayment.mockRejectedValue(Object.assign(new Error("카드 한도 초과"), { code: "REJECT_CARD_PAYMENT" }))
    const { POST } = await import("@/app/api/billing/checkout/confirm/route")
    const response = await POST(confirm())

    expect(response.status).toBe(500)
    expect(fetchTossPayment).not.toHaveBeenCalled()
    expect(markSoftwareCheckoutOrderPaid).not.toHaveBeenCalled()
  })

  it("승인 뒤 주문 기록이 두 번 다 실패하면 전용 코드로 답하고 재무 알림을 남긴다", async () => {
    markSoftwareCheckoutOrderPaid.mockRejectedValue(new Error("db down"))
    const { POST } = await import("@/app/api/billing/checkout/confirm/route")
    const response = await POST(confirm())
    const body = await response.json()

    expect(response.status).toBe(500)
    expect(body.code).toBe("payment_captured_record_failed")
    expect(markSoftwareCheckoutOrderPaid).toHaveBeenCalledTimes(2)
    expect(emitNotificationEvent).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: "billing.checkout.capture_record_failed", severity: "critical", categoryTag: "finance" })
    )
    // 알림 본문에 구매자 연락처를 싣지 않는다.
    expect(JSON.stringify(emitNotificationEvent.mock.calls[0][0])).not.toContain("buyer@example.com")
  })

  it("기록 첫 시도가 실패해도 두 번째에 성공하면 정상 응답한다", async () => {
    markSoftwareCheckoutOrderPaid
      .mockRejectedValueOnce(new Error("blip"))
      .mockResolvedValueOnce({ ...ORDER, status: "paid", paymentKey: "pay-1" })
    const { POST } = await import("@/app/api/billing/checkout/confirm/route")
    const response = await POST(confirm())

    expect(response.status).toBe(200)
    expect(emitNotificationEvent).not.toHaveBeenCalled()
  })

  it("다른 요청이 먼저 결제 완료로 바꿨으면 그 주문을 그대로 돌려준다", async () => {
    markSoftwareCheckoutOrderPaid.mockResolvedValue(null)
    getSoftwareCheckoutOrder
      .mockResolvedValueOnce(ORDER)
      .mockResolvedValueOnce({ ...ORDER, status: "paid", paymentKey: "pay-1" })
    const { POST } = await import("@/app/api/billing/checkout/confirm/route")
    const response = await POST(confirm())

    expect(response.status).toBe(200)
    expect(emitNotificationEvent).not.toHaveBeenCalled()
  })
})
