// 결제 확정 후 promo/quote 코드 redemption 실패 관측성 회귀.
// 이전에는 markSoftwareCheckoutOrderPaid 내부에서 redemption 실패를 console.error 로만
// 남겨 운영팀이 알 방법이 없었다. 이제 lib/notifications 의 기존 emitNotificationEvent
// 를 호출해 ops 알림을 남기되, 결제 confirm 흐름 자체(주문을 paid 로 반환하는 것)는
// 절대 막지 않아야 한다 — 결제는 Toss 쪽에서 이미 완료된 뒤이기 때문이다.
import { afterEach, describe, expect, it, vi } from "vitest"

import type { TossConfirmPaymentResponse } from "@/lib/billing/toss"

interface FakeOrderRow {
  id: string
  order_id: string
  mode: string
  plan_id: string | null
  billing_cycle: string | null
  order_name: string
  organization_name: string
  buyer_name: string
  buyer_email: string
  buyer_phone: string | null
  amount: number
  currency: string
  provider: string
  status: string
  payment_key: string | null
  payment_method: string | null
  easy_pay_provider: string | null
  failure_code: string | null
  failure_message: string | null
  approved_at: string | null
  receipt_url: string | null
  quote_code_id: string | null
  applied_promo_code_id: string | null
  raw_prepare: Record<string, unknown> | null
  created_at: string
  updated_at: string
}

function baseRow(overrides: Partial<FakeOrderRow> = {}): FakeOrderRow {
  return {
    id: "order-row-1",
    order_id: "sw_biz_test_1",
    mode: "business",
    plan_id: null,
    billing_cycle: null,
    order_name: "Classin Business 충전 · ₩2,000,000",
    organization_name: "테스트 학원",
    buyer_name: "홍길동",
    buyer_email: "buyer@example.com",
    buyer_phone: "01012345678",
    amount: 2_000_000,
    currency: "KRW",
    provider: "toss_payments",
    status: "paid",
    payment_key: "test-payment-key",
    payment_method: "카드",
    easy_pay_provider: null,
    failure_code: null,
    failure_message: null,
    approved_at: "2026-07-27T00:00:00.000Z",
    receipt_url: null,
    quote_code_id: null,
    applied_promo_code_id: null,
    raw_prepare: null,
    created_at: "2026-07-27T00:00:00.000Z",
    updated_at: "2026-07-27T00:00:00.000Z",
    ...overrides,
  }
}

interface FakeOrderQueryBuilder {
  from: (table: string) => FakeOrderQueryBuilder
  update: (values: Record<string, unknown>) => FakeOrderQueryBuilder
  eq: (column: string, value: unknown) => FakeOrderQueryBuilder
  in: (column: string, values: unknown[]) => FakeOrderQueryBuilder
  select: (columns: string) => FakeOrderQueryBuilder
  maybeSingle: () => Promise<{ data: FakeOrderRow | null; error: null }>
}

/** 주문 테이블과 코드 테이블을 함께 흉내내는 빌더 — 실구현 redemption 경로 테스트용. */
interface FakeRoutedQueryBuilder {
  update: (values: Record<string, unknown>) => FakeRoutedQueryBuilder
  eq: (column: string, value: unknown) => FakeRoutedQueryBuilder
  in: (column: string, values: unknown[]) => FakeRoutedQueryBuilder
  is: (column: string, value: unknown) => FakeRoutedQueryBuilder
  select: (
    columns?: string
  ) => FakeRoutedQueryBuilder | Promise<{ data: Array<{ id: string }>; error: null }>
  maybeSingle: () => Promise<{ data: FakeOrderRow | null; error: null }>
}

function createTableRoutedSupabase(input: {
  orderRow: FakeOrderRow | null
  /** 조건부 UPDATE(`redeemed_at is null`)가 실제로 갱신한 행. 빈 배열 = 이미 사용된 코드. */
  quoteCodeUpdatedRows: Array<{ id: string }>
  onQuoteCodeUpdate?: (values: Record<string, unknown>) => void
}) {
  return {
    from(table: string): FakeRoutedQueryBuilder {
      const isQuoteCodes = table === "software_quote_codes"
      const builder: FakeRoutedQueryBuilder = {
        update(values: Record<string, unknown>) {
          if (isQuoteCodes) input.onQuoteCodeUpdate?.(values)
          return builder
        },
        eq: () => builder,
        in: () => builder,
        is: () => builder,
        select: () =>
          isQuoteCodes
            ? Promise.resolve({ data: input.quoteCodeUpdatedRows, error: null })
            : builder,
        maybeSingle: () => Promise.resolve({ data: input.orderRow, error: null }),
      }
      return builder
    },
  }
}

function createFakeSupabase(row: FakeOrderRow | null): FakeOrderQueryBuilder {
  const builder: FakeOrderQueryBuilder = {
    from: vi.fn(() => builder),
    update: vi.fn(() => builder),
    eq: vi.fn(() => builder),
    in: vi.fn(() => builder),
    select: vi.fn(() => builder),
    maybeSingle: vi.fn(() => Promise.resolve({ data: row, error: null })),
  }
  return builder
}

const CONFIRMATION: TossConfirmPaymentResponse = {
  paymentKey: "test-payment-key",
  orderId: "sw_biz_test_1",
  orderName: "Classin Business 충전 · ₩2,000,000",
  status: "DONE",
}

async function loadSoftwareCheckout(options: {
  row: FakeOrderRow | null
  markQuoteCodeRedeemed?: ReturnType<typeof vi.fn>
  recordPromoRedemption?: ReturnType<typeof vi.fn>
  emitNotificationEvent?: ReturnType<typeof vi.fn>
}) {
  vi.resetModules()

  const emitNotificationEvent =
    options.emitNotificationEvent ?? vi.fn().mockResolvedValue({ id: "event-1" })
  const markQuoteCodeRedeemed =
    options.markQuoteCodeRedeemed ?? vi.fn().mockResolvedValue(undefined)
  const recordPromoRedemption =
    options.recordPromoRedemption ?? vi.fn().mockResolvedValue(undefined)

  vi.doMock("@/lib/supabase/admin", () => ({
    createSupabaseAdminClient: vi.fn(() => createFakeSupabase(options.row)),
  }))
  vi.doMock("@/lib/notifications/emit-event", () => ({ emitNotificationEvent }))
  vi.doMock("@/lib/billing/quote-codes", () => ({
    markQuoteCodeRedeemed,
    validateQuoteCode: vi.fn(),
  }))
  vi.doMock("@/lib/billing/promo-codes", () => ({
    recordPromoRedemption,
    validatePromoCode: vi.fn(),
  }))

  const mod = await import("@/lib/server/software-checkout")
  return { ...mod, emitNotificationEvent, markQuoteCodeRedeemed, recordPromoRedemption }
}

describe("markSoftwareCheckoutOrderPaid — redemption failure observability", () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.resetModules()
  })

  it("emits an ops notification when quote code redemption fails, and still returns the paid order", async () => {
    const row = baseRow({ quote_code_id: "quote-code-123" })
    const { markSoftwareCheckoutOrderPaid, emitNotificationEvent, markQuoteCodeRedeemed } =
      await loadSoftwareCheckout({
        row,
        markQuoteCodeRedeemed: vi.fn().mockRejectedValue(new Error("db down")),
      })

    const order = await markSoftwareCheckoutOrderPaid("sw_biz_test_1", CONFIRMATION)

    expect(markQuoteCodeRedeemed).toHaveBeenCalledWith("quote-code-123", "sw_biz_test_1")
    expect(order).not.toBeNull()
    expect(order?.status).toBe("paid")

    expect(emitNotificationEvent).toHaveBeenCalledTimes(1)
    const callArg = emitNotificationEvent.mock.calls[0][0]
    expect(callArg.eventType).toBe("billing.quote_code_redemption_failed")
    expect(callArg.categoryTag).toBe("finance")
    expect(callArg.notificationType).toBe("warning")
    expect(callArg.payload).toMatchObject({
      orderId: "sw_biz_test_1",
      codeId: "quote-code-123",
      kind: "quote_code",
    })
  })

  it("emits an ops notification when promo redemption fails, and still returns the paid order", async () => {
    const row = baseRow({
      applied_promo_code_id: "promo-code-456",
      raw_prepare: { amountKrw: 1_900_000, amountKrwBeforeDiscount: 2_000_000 },
    })
    const { markSoftwareCheckoutOrderPaid, emitNotificationEvent, recordPromoRedemption } =
      await loadSoftwareCheckout({
        row,
        recordPromoRedemption: vi.fn().mockRejectedValue(new Error("usage limit race")),
      })

    const order = await markSoftwareCheckoutOrderPaid("sw_biz_test_1", CONFIRMATION)

    expect(recordPromoRedemption).toHaveBeenCalled()
    expect(order).not.toBeNull()
    expect(order?.status).toBe("paid")

    expect(emitNotificationEvent).toHaveBeenCalledTimes(1)
    const callArg = emitNotificationEvent.mock.calls[0][0]
    expect(callArg.eventType).toBe("billing.promo_code_redemption_failed")
    expect(callArg.payload).toMatchObject({
      orderId: "sw_biz_test_1",
      codeId: "promo-code-456",
      kind: "promo_code",
    })
  })

  it("does not emit a notification when both redemptions succeed", async () => {
    const row = baseRow({
      quote_code_id: "quote-code-ok",
      applied_promo_code_id: "promo-code-ok",
      raw_prepare: { amountKrw: 1_900_000, amountKrwBeforeDiscount: 2_000_000 },
    })
    const { markSoftwareCheckoutOrderPaid, emitNotificationEvent, recordPromoRedemption } =
      await loadSoftwareCheckout({ row })

    const order = await markSoftwareCheckoutOrderPaid("sw_biz_test_1", CONFIRMATION)

    expect(order).not.toBeNull()
    expect(emitNotificationEvent).not.toHaveBeenCalled()

    // 충전형 promo 사용 이력은 원화로 기록된다(2026-07 CNY→KRW 전환).
    // raw_prepare 의 amountKrw* 를 읽지 못하면 여기서 0/NaN 이 되어 잡힌다.
    expect(recordPromoRedemption).toHaveBeenCalledWith({
      promoCodeId: "promo-code-ok",
      orderId: "sw_biz_test_1",
      amountBefore: 2_000_000,
      amountAfter: 1_900_000,
      currency: "KRW",
    })
  })

  /**
   * 여기서는 quote-codes 를 모킹하지 않는다 — 모킹하면 "강제로 던지게 만든 예외"만 보게 되고
   * 실제 레이스(조건부 UPDATE 가 0행)를 감지하는지는 검증되지 않는다.
   * supabase 클라이언트만 흉내내고 markQuoteCodeRedeemed 실구현을 그대로 태운다.
   */
  describe("실구현 0행 UPDATE 경로", () => {
    async function loadWithRealQuoteCodes(quoteCodeUpdatedRows: Array<{ id: string }>) {
      vi.resetModules()
      // 앞선 테스트가 등록한 doMock 은 resetModules 로 지워지지 않는다 — 명시적으로 푼다.
      vi.doUnmock("@/lib/billing/quote-codes")
      vi.doUnmock("@/lib/billing/promo-codes")

      const emitNotificationEvent = vi.fn().mockResolvedValue({ id: "event-1" })
      const quoteUpdates: Record<string, unknown>[] = []

      vi.doMock("@/lib/supabase/admin", () => ({
        createSupabaseAdminClient: vi.fn(() =>
          createTableRoutedSupabase({
            orderRow: baseRow({ quote_code_id: "quote-code-race" }),
            quoteCodeUpdatedRows,
            onQuoteCodeUpdate: (values) => quoteUpdates.push(values),
          })
        ),
      }))
      vi.doMock("@/lib/notifications/emit-event", () => ({ emitNotificationEvent }))

      const mod = await import("@/lib/server/software-checkout")
      return { ...mod, emitNotificationEvent, quoteUpdates }
    }

    it("0행이면(다른 주문이 먼저 사용) 실패로 감지해 ops 알림을 남긴다", async () => {
      const consoleError = vi.spyOn(console, "error").mockImplementation(() => {})
      const { markSoftwareCheckoutOrderPaid, emitNotificationEvent, quoteUpdates } =
        await loadWithRealQuoteCodes([])

      const order = await markSoftwareCheckoutOrderPaid("sw_biz_test_1", CONFIRMATION)

      // 결제 자체는 그대로 성공으로 남는다.
      expect(order?.status).toBe("paid")
      expect(quoteUpdates).toHaveLength(1)
      expect(quoteUpdates[0]).toMatchObject({ redeemed_order_id: "sw_biz_test_1" })

      expect(emitNotificationEvent).toHaveBeenCalledTimes(1)
      const callArg = emitNotificationEvent.mock.calls[0][0]
      expect(callArg.eventType).toBe("billing.quote_code_redemption_failed")
      expect(callArg.payload).toMatchObject({
        orderId: "sw_biz_test_1",
        codeId: "quote-code-race",
        kind: "quote_code",
      })
      // 원시 오류 문자열이 아니라 이름 + 요약이 실린다.
      expect(String(callArg.payload.errorMessage)).toContain("Error: ")
      expect(String(callArg.payload.errorMessage).length).toBeLessThanOrEqual(140)
      expect(consoleError).toHaveBeenCalled()
    })

    it("1행이 갱신되면 알림 없이 조용히 지나간다", async () => {
      const { markSoftwareCheckoutOrderPaid, emitNotificationEvent } =
        await loadWithRealQuoteCodes([{ id: "quote-code-race" }])

      const order = await markSoftwareCheckoutOrderPaid("sw_biz_test_1", CONFIRMATION)

      expect(order?.status).toBe("paid")
      expect(emitNotificationEvent).not.toHaveBeenCalled()
    })
  })

  it("still returns the paid order even if the notification pipeline itself throws", async () => {
    const row = baseRow({ quote_code_id: "quote-code-789" })
    const failingEmit = vi.fn().mockRejectedValue(new Error("wecom webhook unreachable"))
    const { markSoftwareCheckoutOrderPaid, emitNotificationEvent } = await loadSoftwareCheckout({
      row,
      markQuoteCodeRedeemed: vi.fn().mockRejectedValue(new Error("db down")),
      emitNotificationEvent: failingEmit,
    })

    const order = await markSoftwareCheckoutOrderPaid("sw_biz_test_1", CONFIRMATION)

    expect(order).not.toBeNull()
    expect(order?.status).toBe("paid")
    expect(emitNotificationEvent).toHaveBeenCalledTimes(1)
  })
})
