// 계약 전환된(archived) 견적이 공유 버튼 한 번으로 '계약 전환' 묶음에 되살아나 계약서가 두 번 생기던 문제.
// - 공유: 동의·보관·만료 상태는 링크만 돌려주고 상태를 "shared" 로 되돌리지 않는다.
// - 전환: 이미 archived 인 견적은 409 로 거절한다.
import { NextRequest, NextResponse } from "next/server"
import { afterEach, describe, expect, it, vi } from "vitest"

const {
  requirePortalContext,
  getQuoteDocument,
  updateQuoteDocument,
  ensureQuoteDocumentShare,
  getDeal,
  convertQuoteToContract,
} = vi.hoisted(() => ({
  requirePortalContext: vi.fn(),
  getQuoteDocument: vi.fn(),
  updateQuoteDocument: vi.fn(),
  ensureQuoteDocumentShare: vi.fn(),
  getDeal: vi.fn(),
  convertQuoteToContract: vi.fn(),
}))

vi.mock("@/lib/portal/portal-context", () => ({
  requirePortalContext,
  isErrorResponse: (value: unknown) => value instanceof NextResponse,
}))
vi.mock("@/lib/portal/portal-authorize", () => ({
  authorizeForAccount: vi.fn(() => undefined),
  getActorInfo: vi.fn(() => ({ actor_user_id: "admin-1", actor_role: "admin" })),
}))
vi.mock("@/lib/portal/repositories/deals", () => ({ getDeal, updateDeal: vi.fn() }))
vi.mock("@/lib/portal/repositories/quote-documents", () => ({
  getQuoteDocument,
  updateQuoteDocument,
  ensureQuoteDocumentShare,
}))
vi.mock("@/lib/portal/repositories/contract-documents", () => ({ convertQuoteToContract }))
vi.mock("@/lib/portal/repositories/activity", () => ({ logActivity: vi.fn() }))
vi.mock("@/lib/repositories/crm-tasks", () => ({
  completeCrmTask: vi.fn(),
  listActiveTasksForDealByType: vi.fn(async () => []),
}))

import { POST as convert } from "@/app/api/portal/quotes/[id]/convert/route"
import { POST as share } from "@/app/api/portal/quotes/[id]/share/route"

const ADMIN_CTX = { type: "admin", scope: "all", userId: "admin-1", name: "영업 담당", role: "ADMIN" }
const params = { params: Promise.resolve({ id: "qd_1" }) }
const post = (path: string) => new NextRequest(`https://classin.kr/api/portal/quotes/qd_1/${path}`, { method: "POST" })

afterEach(() => {
  vi.clearAllMocks()
})

describe("POST /api/portal/quotes/[id]/share — 닫힌 견적 상태 보존", () => {
  it.each(["archived", "accepted", "expired"])("%s 견적은 링크만 돌려주고 상태를 바꾸지 않는다", async (status) => {
    requirePortalContext.mockResolvedValue(ADMIN_CTX)
    getQuoteDocument.mockResolvedValue({ id: "qd_1", deal_id: "deal_1", status })
    getDeal.mockResolvedValue({ id: "deal_1", partner_account_id: null })
    ensureQuoteDocumentShare.mockResolvedValue({
      document: { id: "qd_1", status },
      version: { id: "v1" },
      share: { token: "tok" },
    })

    const response = await share(post("share"), params)
    expect(response.status).toBe(201)
    expect(updateQuoteDocument).not.toHaveBeenCalled()
    expect((await response.json()).document.status).toBe(status)
  })

  it("작성 중 견적은 공유하면 shared 가 된다", async () => {
    requirePortalContext.mockResolvedValue(ADMIN_CTX)
    getQuoteDocument.mockResolvedValue({ id: "qd_1", deal_id: "deal_1", status: "draft" })
    getDeal.mockResolvedValue({ id: "deal_1", partner_account_id: null })
    ensureQuoteDocumentShare.mockResolvedValue({
      document: { id: "qd_1", status: "draft" },
      version: { id: "v1" },
      share: { token: "tok" },
    })
    updateQuoteDocument.mockResolvedValue({ id: "qd_1", status: "shared" })

    const response = await share(post("share"), params)
    expect(updateQuoteDocument).toHaveBeenCalledWith("qd_1", { status: "shared" })
    expect((await response.json()).document.status).toBe("shared")
  })
})

describe("POST /api/portal/quotes/[id]/convert — 중복 전환 방지", () => {
  it("이미 계약으로 전환된(archived) 견적은 409 로 거절하고 계약서를 만들지 않는다", async () => {
    requirePortalContext.mockResolvedValue(ADMIN_CTX)
    getQuoteDocument.mockResolvedValue({ id: "qd_1", deal_id: "deal_1", status: "archived" })
    getDeal.mockResolvedValue({ id: "deal_1", partner_account_id: null })

    const response = await convert(post("convert"), params)
    expect(response.status).toBe(409)
    expect(convertQuoteToContract).not.toHaveBeenCalled()
  })
})
