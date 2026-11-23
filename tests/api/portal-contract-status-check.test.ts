// 전환 계약 "확인 후 체크" 진행 — PUT /api/portal/contracts/[id] 상태 검증.
// 발송함(shared) → 고객 확인(partner_signed) → 계약 확정(completed), 취소, 한 단계 해제만 허용한다.
import { NextRequest, NextResponse } from "next/server"
import { afterEach, describe, expect, it, vi } from "vitest"

const { requirePortalContext, getContractDocument, updateContractDocument, getDeal, logActivity, proposeLedger } =
  vi.hoisted(() => ({
    requirePortalContext: vi.fn(),
    getContractDocument: vi.fn(),
    updateContractDocument: vi.fn(),
    getDeal: vi.fn(),
    logActivity: vi.fn(),
    proposeLedger: vi.fn(),
  }))

vi.mock("@/lib/portal/portal-context", () => ({
  requirePortalContext,
  isErrorResponse: (value: unknown) => value instanceof NextResponse,
}))
vi.mock("@/lib/portal/portal-authorize", () => ({
  authorizeForAccount: vi.fn(() => undefined),
  getActorInfo: vi.fn(() => ({ actor_user_id: "admin-1", actor_role: "admin" })),
}))
vi.mock("@/lib/portal/repositories/deals", () => ({ getDeal }))
vi.mock("@/lib/portal/repositories/contract-documents", () => ({ getContractDocument, updateContractDocument }))
vi.mock("@/lib/portal/repositories/activity", () => ({ logActivity }))
vi.mock("@/lib/admin/handoff/contract-to-ledger-draft", () => ({
  proposeLedgerDraftForSignedContract: proposeLedger,
}))

import { PUT } from "@/app/api/portal/contracts/[id]/route"

const ADMIN_CTX = { type: "admin", scope: "all", userId: "admin-1", name: "영업 담당", role: "ADMIN" }
const PARTNER_CTX = { type: "partner", scope: "partner", userId: "p-1", partnerAccountId: "pa_1" }
const params = { params: Promise.resolve({ id: "cd_1" }) }
const put = (body: unknown) =>
  new NextRequest("https://classin.kr/api/portal/contracts/cd_1", { method: "PUT", body: JSON.stringify(body) })

function setup(status: string, ctx: unknown = ADMIN_CTX) {
  requirePortalContext.mockResolvedValue(ctx)
  getContractDocument.mockResolvedValue({ id: "cd_1", deal_id: "deal_1", contract_number: "C-2026-001", status })
  getDeal.mockResolvedValue({ id: "deal_1", partner_account_id: "pa_1", customer_id: "cu_1" })
  updateContractDocument.mockImplementation(async (_id: string, patch: { status?: string }) => ({
    id: "cd_1",
    ...patch,
  }))
  proposeLedger.mockResolvedValue({ status: "created" })
}

afterEach(() => {
  vi.clearAllMocks()
})

describe("PUT /api/portal/contracts/[id] — 확인 후 체크", () => {
  it.each([
    ["draft", "shared"],
    ["shared", "partner_signed"],
    ["partner_signed", "completed"],
    ["draft", "cancelled"],
    ["shared", "cancelled"],
    ["partner_signed", "cancelled"],
    ["shared", "draft"],
    ["partner_signed", "shared"],
  ])("%s → %s 전환은 저장하고 활동 로그를 남긴다", async (from, to) => {
    setup(from)
    const response = await PUT(put({ status: to }), params)
    expect(response.status).toBe(200)
    expect(updateContractDocument).toHaveBeenCalledWith("cd_1", { status: to })
    expect(logActivity).toHaveBeenCalledTimes(1)
    expect(logActivity.mock.calls[0][0]).toMatchObject({
      action_type: "update",
      target_type: "contract_document",
      target_id: "cd_1",
    })
    expect(logActivity.mock.calls[0][0].summary).toContain("C-2026-001 상태 변경")
  })

  it("활동 로그에 한글 단계명으로 기록한다", async () => {
    setup("draft")
    await PUT(put({ status: "shared" }), params)
    expect(logActivity.mock.calls[0][0].summary).toBe("계약서 C-2026-001 상태 변경: 발송 전 → 발송함")
  })

  it("알 수 없는 상태 값은 400", async () => {
    setup("draft")
    for (const status of ["signed", "", 3, null]) {
      const response = await PUT(put({ status }), params)
      expect(response.status).toBe(400)
    }
    expect(updateContractDocument).not.toHaveBeenCalled()
  })

  it.each([
    ["draft", "completed"],
    ["draft", "partner_signed"],
    ["shared", "completed"],
    ["completed", "shared"],
    ["cancelled", "draft"],
    ["draft", "draft"],
    ["draft", "admin_signed"],
  ])("%s → %s 건너뛰기·되돌리기는 409", async (from, to) => {
    setup(from)
    const response = await PUT(put({ status: to }), params)
    expect(response.status).toBe(409)
    expect((await response.json()).error).toMatch(/바꿀 수 없습니다/)
    expect(updateContractDocument).not.toHaveBeenCalled()
    expect(proposeLedger).not.toHaveBeenCalled()
  })

  it("계약 확정(completed)이면 매출 원장 초안을 한 번 제안한다", async () => {
    setup("partner_signed")
    const response = await PUT(put({ status: "completed" }), params)
    expect(response.status).toBe(200)
    expect(proposeLedger).toHaveBeenCalledTimes(1)
    expect(proposeLedger).toHaveBeenCalledWith({ contractDocumentId: "cd_1" })
  })

  it("completed 가 아닌 전환은 원장 초안을 제안하지 않는다", async () => {
    setup("draft")
    await PUT(put({ status: "shared" }), params)
    expect(proposeLedger).not.toHaveBeenCalled()
  })

  it("원장 제안이 던지거나 error 를 돌려줘도 응답은 성공한다", async () => {
    setup("partner_signed")
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {})
    proposeLedger.mockRejectedValueOnce(new Error("boom"))
    expect((await PUT(put({ status: "completed" }), params)).status).toBe(200)

    setup("partner_signed")
    proposeLedger.mockResolvedValueOnce({ status: "error", error: "x" })
    expect((await PUT(put({ status: "completed" }), params)).status).toBe(200)
    errorSpy.mockRestore()
  })

  it("활동 로그 실패도 응답을 막지 않는다", async () => {
    setup("draft")
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {})
    logActivity.mockRejectedValueOnce(new Error("log down"))
    expect((await PUT(put({ status: "shared" }), params)).status).toBe(200)
    errorSpy.mockRestore()
  })

  it("파트너는 상태를 바꿀 수 없다 — 허용 필드 없음 400", async () => {
    setup("draft", PARTNER_CTX)
    const response = await PUT(put({ status: "shared" }), params)
    expect(response.status).toBe(400)
    expect((await response.json()).error).toBe("no allowed fields")
    expect(updateContractDocument).not.toHaveBeenCalled()
  })

  it("상태 없이 current_version_id 만 보내면 기존처럼 저장한다", async () => {
    setup("shared")
    const response = await PUT(put({ current_version_id: "v2" }), params)
    expect(response.status).toBe(200)
    expect(updateContractDocument).toHaveBeenCalledWith("cd_1", { current_version_id: "v2" })
    expect(logActivity).not.toHaveBeenCalled()
  })
})
