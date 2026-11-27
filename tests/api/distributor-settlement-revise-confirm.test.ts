import { NextRequest } from "next/server"
import { beforeEach, describe, expect, it, vi } from "vitest"

import type { DistributorSettlementRecord } from "@/lib/distributor-settlements"

// 발행 후 금액 수정(PUT /api/admin/quotes/[id]/distributor-settlement)과
// 총판 확인(POST /api/share/distributor-quote/[token]/confirm) 라우트.

const mocks = vi.hoisted(() => ({
  getDistributorSettlementByQuote: vi.fn(),
  saveDistributorSettlementDraft: vi.fn(),
  reviseIssuedDistributorSettlement: vi.fn(),
  cancelDistributorSettlement: vi.fn(),
  loadQuoteContext: vi.fn(),
  notifyDistributorSettlementRevised: vi.fn(),
  confirmDistributorQuote: vi.fn(),
  logAdminAudit: vi.fn(),
}))

vi.mock("@/lib/admin-auth", () => ({
  CRM_STAFF_ADMIN_API_ROLES: ["ADMIN"],
  requireVerifiedAdminContext: vi.fn(async () => ({ userId: "u_1", name: "운영자", role: "ADMIN" })),
}))
vi.mock("@/lib/auth/audit", () => ({ logAdminAudit: mocks.logAdminAudit }))
vi.mock("@/lib/repositories/distributor-settlements", () => ({
  DistributorSettlementsNotReadyError: class DistributorSettlementsNotReadyError extends Error {},
  getDistributorSettlementByQuote: mocks.getDistributorSettlementByQuote,
  saveDistributorSettlementDraft: mocks.saveDistributorSettlementDraft,
  reviseIssuedDistributorSettlement: mocks.reviseIssuedDistributorSettlement,
  cancelDistributorSettlement: mocks.cancelDistributorSettlement,
}))
vi.mock("@/lib/server/distributor-settlement-api", () => ({
  distributorActor: () => "운영자",
  readJsonObject: async (req: Request) => req.json(),
  distributorWriteError: (error: unknown) => {
    throw error
  },
  loadDistributorSettlementPayload: vi.fn(),
}))
vi.mock("@/lib/server/distributor-settlement-issue", () => ({
  loadQuoteContext: mocks.loadQuoteContext,
  notifyDistributorSettlementRevised: mocks.notifyDistributorSettlementRevised,
  confirmDistributorQuote: mocks.confirmDistributorQuote,
}))

import { PUT } from "@/app/api/admin/quotes/[id]/distributor-settlement/route"
import { POST as confirm } from "@/app/api/share/distributor-quote/[token]/confirm/route"

const ISSUED = {
  id: "ds_1",
  quoteDocumentId: "qd_1",
  fulfillmentMode: "C",
  status: "partial",
  totalAmount: 5_300_000,
  paidAmount: 2_000_000,
  distributorName: "퀴드러닝",
} as unknown as DistributorSettlementRecord

const BODY = {
  distributorName: "퀴드러닝",
  issueTrigger: "on_accept",
  autoEmail: true,
  vatIncluded: true,
  lines: [
    { sourceLineNumber: 1, itemCode: "board-86", itemName: '86" 전자칠판', itemType: "hardware", quantity: 2, unitPrice: 2_650_000, included: true },
    { sourceLineNumber: 0, itemName: "배송비", itemType: "shipping", quantity: 1, unitPrice: 50_000, included: true },
  ],
}

const put = (body: unknown) =>
  PUT(
    new NextRequest("https://classin.co.kr/api/admin/quotes/qd_1/distributor-settlement", {
      method: "PUT",
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ id: "qd_1" }) }
  )

beforeEach(() => {
  vi.clearAllMocks()
  mocks.loadQuoteContext.mockResolvedValue({
    document: { id: "qd_1", deal_id: "deal_1", quote_number: "Q-2026-014" },
    version: { id: "qv_1", total_amount: 6_300_000 },
  })
  mocks.saveDistributorSettlementDraft.mockResolvedValue(null) // 발행된 건 → 수정 분기
  mocks.getDistributorSettlementByQuote.mockResolvedValue({ available: true, warning: null, value: ISSUED })
  mocks.reviseIssuedDistributorSettlement.mockImplementation(async ({ totals }) => ({ ...ISSUED, totalAmount: totals.totalAmount }))
  mocks.notifyDistributorSettlementRevised.mockImplementation(async ({ settlement }) => settlement)
})

describe("PUT — 발행 후 금액 수정", () => {
  it("직접 추가 줄을 포함해 금액을 고치고, 수정 알림을 보낸다", async () => {
    const response = await put(BODY)
    expect(response.status).toBe(200)
    const payload = await response.json()
    expect(payload.revised).toBe(true)
    expect(payload.settlement.totalAmount).toBe(5_350_000)
    const call = mocks.reviseIssuedDistributorSettlement.mock.calls[0][0]
    expect(call.input.lines[1]).toMatchObject({ sourceLineNumber: 0, itemName: "배송비" })
    expect(mocks.notifyDistributorSettlementRevised).toHaveBeenCalledWith(
      expect.objectContaining({ previousTotalAmount: 5_300_000 })
    )
    expect(mocks.logAdminAudit).toHaveBeenCalledWith(expect.objectContaining({ action: "quotes.distributor_settlement.revise" }))
  })

  it("받은 입금보다 작게 줄이면 422", async () => {
    const response = await put({ ...BODY, lines: [BODY.lines[1]] })
    expect(response.status).toBe(422)
    expect((await response.json()).error).toMatch(/이미 받은 입금/)
    expect(mocks.reviseIssuedDistributorSettlement).not.toHaveBeenCalled()
  })

  it("H방식 완료·취소 건은 409", async () => {
    mocks.getDistributorSettlementByQuote.mockResolvedValue({
      available: true,
      warning: null,
      value: { ...ISSUED, fulfillmentMode: "H", status: "completed" },
    })
    const response = await put(BODY)
    expect(response.status).toBe(409)
  })

  it("그사이 입금이 기록돼 조건부 수정이 빗나가면 409", async () => {
    mocks.reviseIssuedDistributorSettlement.mockResolvedValue(null)
    const response = await put(BODY)
    expect(response.status).toBe(409)
    expect(mocks.notifyDistributorSettlementRevised).not.toHaveBeenCalled()
  })

  it("수정 알림이 실패해도 수정 결과는 돌려준다", async () => {
    mocks.notifyDistributorSettlementRevised.mockRejectedValue(new Error("mail down"))
    const response = await put(BODY)
    expect(response.status).toBe(200)
  })
})

const TOKEN = "b".repeat(48)
const post = (token: string, body?: unknown) =>
  confirm(
    new NextRequest(`https://classin.co.kr/api/share/distributor-quote/${token}/confirm`, {
      method: "POST",
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    }),
    { params: Promise.resolve({ token }) }
  )

describe("POST — 총판 확인", () => {
  it("확인 시각과 이름을 돌려준다", async () => {
    mocks.confirmDistributorQuote.mockResolvedValue({
      status: "confirmed",
      settlement: { confirmedAt: "2026-11-24T02:00:00.000Z", confirmedByName: "[담당자 1]" },
    })
    const response = await post(TOKEN, { name: " [담당자 1] " })
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      confirmedAt: "2026-11-24T02:00:00.000Z",
      confirmedByName: "[담당자 1]",
      alreadyConfirmed: false,
    })
    expect(mocks.confirmDistributorQuote).toHaveBeenCalledWith(expect.objectContaining({ token: TOKEN, confirmedByName: "[담당자 1]" }))
  })

  it("형식이 틀린 토큰은 조회 없이 404", async () => {
    const response = await post("not-a-token", {})
    expect(response.status).toBe(404)
    expect(mocks.confirmDistributorQuote).not.toHaveBeenCalled()
  })

  it("이름이 60자를 넘으면 400", async () => {
    const response = await post(TOKEN, { name: "가".repeat(61) })
    expect(response.status).toBe(400)
  })

  it("발행 전·취소된 링크는 404", async () => {
    mocks.confirmDistributorQuote.mockResolvedValue({ status: "not_found" })
    const response = await post(TOKEN, {})
    expect(response.status).toBe(404)
  })

  it("본문 없이 눌러도 이름 없이 확인한다", async () => {
    mocks.confirmDistributorQuote.mockResolvedValue({
      status: "already_confirmed",
      settlement: { confirmedAt: "2026-11-24T02:00:00.000Z", confirmedByName: null },
    })
    const response = await post(TOKEN)
    expect(response.status).toBe(200)
    expect((await response.json()).alreadyConfirmed).toBe(true)
  })
})
