// 공개 견적 확인·수락은 응답용(sign) 공유에서만, 유효한 견적에서만 받는다(2026-11-25 점검 B-7).
// 화면(app/share/quote/[token]/page.tsx)은 access_mode === "sign" 일 때만 버튼을 보인다 — 서버도 같은 조건이어야
// 열람 전용 링크로 직접 호출해 수락 기록·CRM 카드·총판 견적서 자동 발행을 만들 수 없다.
import { NextRequest } from "next/server"
import { afterEach, describe, expect, it, vi } from "vitest"

const ensureQuoteInteractionLog = vi.fn()
const emitNotificationEvent = vi.fn()
const issueDistributorSettlementOnAcceptSafely = vi.fn()

function mockModules(lookup: { accessMode: "view" | "sign"; documentStatus: string }) {
  vi.doMock("@/lib/notifications/emit-event", () => ({ emitNotificationEvent }))
  vi.doMock("@/lib/portal/repositories/activity", () => ({
    PUBLIC_QUOTE_REVIEW_ACTION: "public_quote_review_confirmed",
    PUBLIC_QUOTE_ACCEPT_ACTION: "public_quote_accepted",
    ensureQuoteInteractionLog,
    summarizeQuoteInteractions: vi.fn().mockResolvedValue({ reviewConfirmedAt: null, acceptedAt: null }),
  }))
  vi.doMock("@/lib/portal/repositories/deals", () => ({ getDeal: vi.fn().mockResolvedValue({ id: "deal_1" }) }))
  vi.doMock("@/lib/portal/repositories/quote-documents", () => ({
    getPublicQuoteByToken: vi.fn().mockResolvedValue({
      status: "ok",
      document: { id: "qd_1", deal_id: "deal_1", status: lookup.documentStatus, quote_number: "Q-1" },
      version: { id: "qv_1", title: "견적서" },
      share: { id: "share_1", access_mode: lookup.accessMode, expires_at: null },
      customer_name: "테스트 학원",
      customer_email: null,
    }),
    updateQuoteDocument: vi.fn(),
  }))
  vi.doMock("@/lib/repositories/crm-tasks", () => ({ createCrmTask: vi.fn(), listCrmTasks: vi.fn().mockResolvedValue([]) }))
  vi.doMock("@/lib/repositories/sales-orders", () => ({ ensureSalesOrderForAcceptedQuoteSafely: vi.fn() }))
  vi.doMock("@/lib/server/distributor-settlement-issue", () => ({ issueDistributorSettlementOnAcceptSafely }))
}

function post(action: "accept" | "confirm") {
  return new NextRequest(`https://classin.co.kr/api/share/quote/tok123/${action}`, { method: "POST", body: "{}" })
}

afterEach(() => {
  vi.resetModules()
  vi.clearAllMocks()
})

describe.each(["accept", "confirm"] as const)("POST /api/share/quote/[token]/%s — 공유 방식·문서 상태 조건", (action) => {
  const load = async () =>
    action === "accept"
      ? import("@/app/api/share/quote/[token]/accept/route")
      : import("@/app/api/share/quote/[token]/confirm/route")

  it("열람 전용(view) 공유는 403 이고 아무 기록도 남기지 않는다", async () => {
    mockModules({ accessMode: "view", documentStatus: "shared" })
    const route = await load()
    const response = await route.POST(post(action), { params: Promise.resolve({ token: "tok123" }) })

    expect(response.status).toBe(403)
    expect(ensureQuoteInteractionLog).not.toHaveBeenCalled()
    expect(emitNotificationEvent).not.toHaveBeenCalled()
    expect(issueDistributorSettlementOnAcceptSafely).not.toHaveBeenCalled()
  })

  it.each(["archived", "expired"])("%s 견적은 409 이고 아무 기록도 남기지 않는다", async (status) => {
    mockModules({ accessMode: "sign", documentStatus: status })
    const route = await load()
    const response = await route.POST(post(action), { params: Promise.resolve({ token: "tok123" }) })

    expect(response.status).toBe(409)
    expect(ensureQuoteInteractionLog).not.toHaveBeenCalled()
    expect(issueDistributorSettlementOnAcceptSafely).not.toHaveBeenCalled()
  })
})
