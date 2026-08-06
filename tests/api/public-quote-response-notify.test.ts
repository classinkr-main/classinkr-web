import { afterEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"

/**
 * 공개 견적 확인/수락(POST /api/share/quote/[token]/confirm, /accept)이
 * 담당자 어드민 알림(emitNotificationEvent)을 정확히 한 번, 최초 응답에서만
 * 트리거하는지 확인한다. 이전에는 activity_log 만 남고 어드민에게는
 * 아무 알림도 가지 않아 담당자가 CRM 큐를 직접 열어봐야만 알 수 있었다.
 *
 * 알림 전송 실패가 고객 응답 자체(200 반환)를 막지 않는지도 함께 검증한다 —
 * 웹훅 설정 누락 등으로 emit 이 reject 돼도 확인/수락 기록은 반드시 저장돼야 한다.
 */

const DOCUMENT = {
  id: "qd_1",
  deal_id: "deal_1",
  quote_number: "Q-2026-0001",
  current_version_id: "qv_1",
  status: "shared" as const,
  created_by: null,
  created_by_role: "admin" as const,
  approved_by: null,
  approved_at: null,
  created_at: "2026-08-01T00:00:00.000Z",
  updated_at: "2026-08-01T00:00:00.000Z",
}

const VERSION = {
  id: "qv_1",
  quote_document_id: "qd_1",
  version_number: 1,
  title: "테스트 학원 견적서",
  content_html: null,
  structured_json: null,
  subtotal: 6_300_000,
  discount_amount: 0,
  tax_amount: 0,
  total_amount: 6_300_000,
  valid_until: "2026-08-15",
  created_by: null,
}

const SHARE = {
  id: "share_1",
  quote_document_version_id: "qv_1",
  token: "tok123",
  access_mode: "view" as const,
  expires_at: null,
  created_by: null,
  created_at: "2026-08-01T00:00:00.000Z",
}

const DEAL = {
  id: "deal_1",
  partner_account_id: "partner_1",
  customer_id: "customer_1",
  deal_code: "D-1",
  title: "본관 전자칠판 4대 설치",
  status: "active" as const,
  current_stage: "quote" as const,
  expected_amount: 6_300_000,
  contracted_amount: 0,
  installed_amount: 0,
  paid_amount: 0,
  outstanding_amount: 6_300_000,
  payment_status: "unpaid" as const,
  starts_at: null,
  closed_at: null,
  notes: null,
  created_by: null,
  owner_id: null,
  created_at: "2026-08-01T00:00:00.000Z",
  updated_at: "2026-08-01T00:00:00.000Z",
}

function buildRequest(body: Record<string, unknown> = {}) {
  return new NextRequest("https://classin.co.kr/api/share/quote/tok123/confirm", {
    method: "POST",
    body: JSON.stringify(body),
  })
}

afterEach(() => {
  vi.restoreAllMocks()
  vi.resetModules()
})

describe("POST /api/share/quote/[token]/confirm — 담당자 알림", () => {
  async function loadRoute(options: {
    emitNotificationEvent?: ReturnType<typeof vi.fn>
    alreadyConfirmedAt?: string | null
  }) {
    vi.resetModules()

    const emitNotificationEvent =
      options.emitNotificationEvent ?? vi.fn().mockResolvedValue({ id: "evt_1" })
    const ensureQuoteInteractionLog = vi.fn().mockResolvedValue({
      log: { id: "log_1", created_at: "2026-08-06T09:00:00.000Z" },
      created: true,
    })

    vi.doMock("@/lib/notifications/emit-event", () => ({ emitNotificationEvent }))
    vi.doMock("@/lib/portal/repositories/activity", () => ({
      PUBLIC_QUOTE_REVIEW_ACTION: "public_quote_review_confirmed",
      ensureQuoteInteractionLog,
      summarizeQuoteInteractions: vi.fn().mockResolvedValue({
        reviewConfirmedAt: options.alreadyConfirmedAt ?? null,
        acceptedAt: null,
      }),
    }))
    vi.doMock("@/lib/portal/repositories/deals", () => ({
      getDeal: vi.fn().mockResolvedValue(DEAL),
    }))
    vi.doMock("@/lib/portal/repositories/quote-documents", () => ({
      getPublicQuoteByToken: vi.fn().mockResolvedValue({
        status: "ok",
        document: DOCUMENT,
        version: VERSION,
        share: SHARE,
        customer_name: "테스트 학원",
        customer_email: null,
      }),
    }))

    const route = await import("@/app/api/share/quote/[token]/confirm/route")
    return { route, emitNotificationEvent, ensureQuoteInteractionLog }
  }

  it("최초 확인이면 어드민에게 status_update 알림을 보낸다", async () => {
    const { route, emitNotificationEvent } = await loadRoute({})

    const response = await route.POST(buildRequest(), { params: Promise.resolve({ token: "tok123" }) })
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.confirmedAt).toBe("2026-08-06T09:00:00.000Z")
    expect(emitNotificationEvent).toHaveBeenCalledTimes(1)

    const call = emitNotificationEvent.mock.calls[0][0]
    expect(call.eventType).toBe("quote.review_confirmed")
    expect(call.notificationType).toBe("status_update")
    expect(call.title).toContain(DOCUMENT.quote_number)
    expect(call.message).toContain("테스트 학원")
    expect(call.routeUrl).toBe(`/admin/quotes/${DOCUMENT.id}/view`)
    expect(call.payload.dealId).toBe(DEAL.id)
    expect(call.payload.versionId).toBe(VERSION.id)
  })

  it("이미 확인된 견적이면 재알림을 보내지 않는다(idempotent)", async () => {
    const { route, emitNotificationEvent } = await loadRoute({
      alreadyConfirmedAt: "2026-08-05T00:00:00.000Z",
    })

    const response = await route.POST(buildRequest(), { params: Promise.resolve({ token: "tok123" }) })
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.confirmedAt).toBe("2026-08-05T00:00:00.000Z")
    expect(emitNotificationEvent).not.toHaveBeenCalled()
  })

  it("알림 전송이 실패해도 확인 응답은 그대로 200을 반환한다", async () => {
    const failingEmit = vi.fn().mockRejectedValue(new Error("webhook down"))
    const { route } = await loadRoute({ emitNotificationEvent: failingEmit })

    const response = await route.POST(buildRequest(), { params: Promise.resolve({ token: "tok123" }) })
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.confirmedAt).toBe("2026-08-06T09:00:00.000Z")

    // fire-and-forget 프라미스가 마이크로태스크 큐에서 reject 를 흡수할 시간을 준다.
    await new Promise((resolve) => setTimeout(resolve, 0))
  })
})

describe("POST /api/share/quote/[token]/accept — 담당자 알림", () => {
  async function loadRoute(options: {
    emitNotificationEvent?: ReturnType<typeof vi.fn>
    alreadyAcceptedAt?: string | null
  }) {
    vi.resetModules()

    const emitNotificationEvent =
      options.emitNotificationEvent ?? vi.fn().mockResolvedValue({ id: "evt_1" })
    const ensureQuoteInteractionLog = vi.fn().mockResolvedValue({
      log: { id: "log_2", created_at: "2026-08-06T09:05:00.000Z" },
      created: true,
    })

    vi.doMock("@/lib/notifications/emit-event", () => ({ emitNotificationEvent }))
    vi.doMock("@/lib/portal/repositories/activity", () => ({
      PUBLIC_QUOTE_ACCEPT_ACTION: "public_quote_accepted",
      ensureQuoteInteractionLog,
      summarizeQuoteInteractions: vi.fn().mockResolvedValue({
        reviewConfirmedAt: "2026-08-06T08:00:00.000Z",
        acceptedAt: options.alreadyAcceptedAt ?? null,
      }),
    }))
    vi.doMock("@/lib/portal/repositories/deals", () => ({
      getDeal: vi.fn().mockResolvedValue(DEAL),
    }))
    vi.doMock("@/lib/portal/repositories/quote-documents", () => ({
      getPublicQuoteByToken: vi.fn().mockResolvedValue({
        status: "ok",
        document: DOCUMENT,
        version: VERSION,
        share: SHARE,
        customer_name: "테스트 학원",
        customer_email: null,
      }),
      updateQuoteDocument: vi.fn().mockResolvedValue(undefined),
    }))
    vi.doMock("@/lib/repositories/crm-tasks", () => ({
      createCrmTask: vi.fn().mockResolvedValue({ id: "task_1" }),
      listActiveTasksForDealByType: vi.fn().mockResolvedValue([]),
    }))

    const route = await import("@/app/api/share/quote/[token]/accept/route")
    return { route, emitNotificationEvent, ensureQuoteInteractionLog }
  }

  it("최초 수락이면 어드민에게 action_required 알림을 보낸다", async () => {
    const { route, emitNotificationEvent } = await loadRoute({})

    const response = await route.POST(buildRequest(), { params: Promise.resolve({ token: "tok123" }) })
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.acceptedAt).toBe("2026-08-06T09:05:00.000Z")
    expect(emitNotificationEvent).toHaveBeenCalledTimes(1)

    const call = emitNotificationEvent.mock.calls[0][0]
    expect(call.eventType).toBe("quote.accepted")
    expect(call.notificationType).toBe("action_required")
    expect(call.title).toContain(DOCUMENT.quote_number)
    expect(call.message).toContain("계약 전환")
    expect(call.routeUrl).toBe(`/admin/quotes/${DOCUMENT.id}/view`)
    expect(call.payload.requestedAction).toBe("convert_to_contract")
  })

  it("이미 수락된 견적이면 재알림을 보내지 않는다(idempotent)", async () => {
    const { route, emitNotificationEvent } = await loadRoute({
      alreadyAcceptedAt: "2026-08-05T00:00:00.000Z",
    })

    const response = await route.POST(buildRequest(), { params: Promise.resolve({ token: "tok123" }) })
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.acceptedAt).toBe("2026-08-05T00:00:00.000Z")
    expect(emitNotificationEvent).not.toHaveBeenCalled()
  })

  it("알림 전송이 실패해도 수락 응답은 그대로 200을 반환한다", async () => {
    const failingEmit = vi.fn().mockRejectedValue(new Error("webhook down"))
    const { route } = await loadRoute({ emitNotificationEvent: failingEmit })

    const response = await route.POST(buildRequest(), { params: Promise.resolve({ token: "tok123" }) })
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.acceptedAt).toBe("2026-08-06T09:05:00.000Z")

    await new Promise((resolve) => setTimeout(resolve, 0))
  })
})
