// 계약 전환된(archived) 견적이 공유 버튼 한 번으로 '계약 전환' 묶음에 되살아나 계약서가 두 번 생기던 문제.
// - 공유: 동의·보관 상태는 링크만 돌려주고 상태를 "shared" 로 되돌리지 않는다. 만료는 다시 보내면 되살린다.
// - 전환: 이미 archived 인 견적은 409 로 거절한다.
// - 버전: 동의·보관된 견적은 버전을 올리지 않는다(오더·정산이 읽는 현재 버전이 동의한 버전과 갈라진다).
import { NextRequest, NextResponse } from "next/server"
import { afterEach, describe, expect, it, vi } from "vitest"

const {
  requirePortalContext,
  getQuoteDocument,
  updateQuoteDocument,
  ensureQuoteDocumentShare,
  getDeal,
  convertQuoteToContract,
  createQuoteDocumentVersion,
} = vi.hoisted(() => ({
  requirePortalContext: vi.fn(),
  getQuoteDocument: vi.fn(),
  updateQuoteDocument: vi.fn(),
  ensureQuoteDocumentShare: vi.fn(),
  getDeal: vi.fn(),
  convertQuoteToContract: vi.fn(),
  createQuoteDocumentVersion: vi.fn(),
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
  createQuoteDocumentVersion,
}))
vi.mock("@/lib/portal/repositories/contract-documents", () => ({ convertQuoteToContract }))
vi.mock("@/lib/portal/repositories/activity", () => ({ logActivity: vi.fn() }))
vi.mock("@/lib/repositories/crm-tasks", () => ({
  completeCrmTask: vi.fn(),
  listActiveTasksForDealByType: vi.fn(async () => []),
}))

import { POST as convert } from "@/app/api/portal/quotes/[id]/convert/route"
import { POST as share } from "@/app/api/portal/quotes/[id]/share/route"
import { POST as createVersion } from "@/app/api/portal/quotes/[id]/versions/route"

const ADMIN_CTX = { type: "admin", scope: "all", userId: "admin-1", name: "영업 담당", role: "ADMIN" }
const params = { params: Promise.resolve({ id: "qd_1" }) }
const post = (path: string, body?: unknown) =>
  new NextRequest(`https://classin.kr/api/portal/quotes/qd_1/${path}`, {
    method: "POST",
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })

afterEach(() => {
  vi.clearAllMocks()
})

describe("POST /api/portal/quotes/[id]/share — 닫힌 견적 상태 보존", () => {
  it.each(["archived", "accepted"])("%s 견적은 링크만 돌려주고 상태를 바꾸지 않는다", async (status) => {
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

  it("만료된 견적을 다시 보내면 shared 로 되살린다 — expired 로 두면 새 링크로도 고객이 동의할 수 없다", async () => {
    requirePortalContext.mockResolvedValue(ADMIN_CTX)
    getQuoteDocument.mockResolvedValue({ id: "qd_1", deal_id: "deal_1", status: "expired" })
    getDeal.mockResolvedValue({ id: "deal_1", partner_account_id: null })
    ensureQuoteDocumentShare.mockResolvedValue({
      document: { id: "qd_1", status: "expired" },
      version: { id: "v1" },
      share: { token: "tok" },
    })
    updateQuoteDocument.mockResolvedValue({ id: "qd_1", status: "shared" })

    const response = await share(post("share"), params)
    expect(updateQuoteDocument).toHaveBeenCalledWith("qd_1", { status: "shared" })
    expect((await response.json()).document.status).toBe("shared")
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

describe("POST /api/portal/quotes/[id]/versions — 동의·전환된 견적은 버전을 올리지 않는다", () => {
  it.each(["accepted", "archived"])("%s 견적은 409 로 거절하고 현재 버전을 바꾸지 않는다", async (status) => {
    requirePortalContext.mockResolvedValue(ADMIN_CTX)
    getQuoteDocument.mockResolvedValue({ id: "qd_1", deal_id: "deal_1", status })

    const response = await createVersion(post("versions", { version_number: 2, total_amount: 1 }), params)
    expect(response.status).toBe(409)
    expect(createQuoteDocumentVersion).not.toHaveBeenCalled()
  })

  it.each(["draft", "shared"])("%s 견적은 다음 버전을 만든다", async (status) => {
    requirePortalContext.mockResolvedValue(ADMIN_CTX)
    getQuoteDocument.mockResolvedValue({ id: "qd_1", deal_id: "deal_1", status })
    createQuoteDocumentVersion.mockResolvedValue({ id: "v2", version_number: 2 })

    const response = await createVersion(post("versions", { version_number: 2, total_amount: 1 }), params)
    expect(response.status).toBe(201)
    expect(createQuoteDocumentVersion).toHaveBeenCalledWith(expect.objectContaining({ quote_document_id: "qd_1", version_number: 2 }))
  })
})
