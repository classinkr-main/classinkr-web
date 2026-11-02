// PUT /api/portal/quotes/[id] — 담당자가 견적을 "승인됨"으로 바꾸면 오더를 만든다(2026-10-22 연결 로직 §4-3).
// 오더 생성은 상태 변경을 막지 않고(Safely 가 실패를 삼킨다), 이미 승인된 견적을 다시 저장해도 새로 부르지 않는다.
import { NextRequest, NextResponse } from "next/server"
import { afterEach, describe, expect, it, vi } from "vitest"

const {
  requirePortalContext,
  getQuoteDocument,
  updateQuoteDocument,
  getDeal,
  ensureSalesOrderForAcceptedQuoteSafely,
  notifyHardwareOrderApprovalRequested,
} = vi.hoisted(() => ({
  requirePortalContext: vi.fn(),
  getQuoteDocument: vi.fn(),
  updateQuoteDocument: vi.fn(),
  getDeal: vi.fn(),
  ensureSalesOrderForAcceptedQuoteSafely: vi.fn(),
  notifyHardwareOrderApprovalRequested: vi.fn(),
}))

vi.mock("@/lib/portal/portal-context", () => ({
  requirePortalContext,
  isErrorResponse: (value: unknown) => value instanceof NextResponse,
}))
vi.mock("@/lib/portal/portal-authorize", () => ({ authorizeForAccount: vi.fn(() => undefined) }))
vi.mock("@/lib/portal/repositories/deals", () => ({ getDeal }))
vi.mock("@/lib/portal/repositories/quote-documents", () => ({
  getQuoteDocument,
  updateQuoteDocument,
  getLatestQuoteDocumentShare: vi.fn(),
  getResolvableQuoteVersion: vi.fn(),
}))
vi.mock("@/lib/repositories/sales-orders", () => ({
  ensureSalesOrderForAcceptedQuoteSafely,
  notifyHardwareOrderApprovalRequested,
}))

import { PUT } from "@/app/api/portal/quotes/[id]/route"

const ADMIN_CTX = { type: "admin", scope: "all", userId: "admin-1", name: "영업 담당", role: "ADMIN" }

function putRequest(body: unknown) {
  return new NextRequest("https://classin.kr/api/portal/quotes/qd_1", {
    method: "PUT",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  })
}

const params = { params: Promise.resolve({ id: "qd_1" }) }

afterEach(() => {
  vi.clearAllMocks()
})

describe("PUT /api/portal/quotes/[id] — 견적 승인 → 오더", () => {
  it("승인됨으로 바꾸면 담당자 경로로 오더를 만들고 응답에 싣는다", async () => {
    requirePortalContext.mockResolvedValue(ADMIN_CTX)
    getQuoteDocument.mockResolvedValue({ id: "qd_1", deal_id: "deal_1", status: "shared" })
    updateQuoteDocument.mockResolvedValue({ id: "qd_1", status: "accepted" })
    const order = { id: "so_1", status: "pending_approval" }
    ensureSalesOrderForAcceptedQuoteSafely.mockResolvedValue({ order, created: true })

    const response = await PUT(putRequest({ status: "accepted" }), params)
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(ensureSalesOrderForAcceptedQuoteSafely).toHaveBeenCalledWith({
      quoteDocumentId: "qd_1",
      acceptedVia: "staff",
      actor: "영업 담당",
    })
    expect(body.order).toEqual(order)
    // 새로 만든 오더면 이왕찬·지사장에게 승인 요청을 보낸다(승인 대기 여부는 알림 함수가 거른다).
    expect(notifyHardwareOrderApprovalRequested).toHaveBeenCalledWith(order)
  })

  it("이미 있던 오더를 돌려받으면 승인 요청을 다시 보내지 않는다", async () => {
    requirePortalContext.mockResolvedValue(ADMIN_CTX)
    getQuoteDocument.mockResolvedValue({ id: "qd_1", deal_id: "deal_1", status: "shared" })
    updateQuoteDocument.mockResolvedValue({ id: "qd_1", status: "accepted" })
    ensureSalesOrderForAcceptedQuoteSafely.mockResolvedValue({ order: { id: "so_1", status: "pending_approval" }, created: false })

    await PUT(putRequest({ status: "accepted" }), params)

    expect(notifyHardwareOrderApprovalRequested).not.toHaveBeenCalled()
  })

  it("오더 생성이 실패해도(null) 견적 상태 변경은 200", async () => {
    requirePortalContext.mockResolvedValue(ADMIN_CTX)
    getQuoteDocument.mockResolvedValue({ id: "qd_1", deal_id: "deal_1", status: "shared" })
    updateQuoteDocument.mockResolvedValue({ id: "qd_1", status: "accepted" })
    ensureSalesOrderForAcceptedQuoteSafely.mockResolvedValue(null)

    const response = await PUT(putRequest({ status: "accepted" }), params)

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ quote: { id: "qd_1", status: "accepted" } })
  })

  it("이미 승인된 견적이나 다른 상태로 바꾸면 오더를 부르지 않는다", async () => {
    requirePortalContext.mockResolvedValue(ADMIN_CTX)
    getQuoteDocument.mockResolvedValue({ id: "qd_1", deal_id: "deal_1", status: "accepted" })
    updateQuoteDocument.mockResolvedValue({ id: "qd_1", status: "accepted" })
    await PUT(putRequest({ status: "accepted" }), params)

    getQuoteDocument.mockResolvedValue({ id: "qd_1", deal_id: "deal_1", status: "draft" })
    updateQuoteDocument.mockResolvedValue({ id: "qd_1", status: "shared" })
    await PUT(putRequest({ status: "shared" }), params)

    expect(ensureSalesOrderForAcceptedQuoteSafely).not.toHaveBeenCalled()
  })
})
