import { NextRequest, NextResponse } from "next/server"
import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({ auth: vi.fn(), get: vi.fn(), change: vi.fn(), audit: vi.fn() }))
vi.mock("@/lib/admin-auth", () => ({ requireVerifiedAdminContext: mocks.auth, STAFF_ADMIN_API_ROLES: ["SUPER_ADMIN", "ADMIN"] }))
vi.mock("@/lib/auth/audit", () => ({ logAdminAudit: mocks.audit }))
vi.mock("@/lib/portal/repositories/quote-documents", () => ({ getQuoteDocument: mocks.get, setQuoteDeleted: mocks.change }))
import { DELETE, POST } from "@/app/api/admin/quotes/[id]/route"

const id = "62df8b3f-7e09-408b-a3b1-c3da30077dcf"
const context = { params: Promise.resolve({ id }) }
const request = (method: string) => new NextRequest(`https://classin.co.kr/api/admin/quotes/${id}`, { method })

beforeEach(() => {
  vi.resetAllMocks()
  mocks.auth.mockResolvedValue({ userId: "admin", role: "ADMIN" })
  mocks.get.mockResolvedValue({ id, quote_number: "Q-1", status: "shared" })
  mocks.change.mockResolvedValue({ id })
})

describe("견적 삭제와 복구", () => {
  it("관리자 삭제는 견적만 삭제함으로 옮기고 감사 로그를 남긴다", async () => {
    expect((await DELETE(request("DELETE"), context)).status).toBe(200)
    expect(mocks.change).toHaveBeenCalledWith(id, true)
    expect(mocks.audit).toHaveBeenCalledWith(expect.objectContaining({ action: "quotes.delete", targetId: id }))
  })
  it("복구는 이전 상태를 보존하고 삭제 표시만 지운다", async () => {
    expect((await POST(request("POST"), context)).status).toBe(200)
    expect(mocks.change).toHaveBeenCalledWith(id, false)
    expect(mocks.audit).toHaveBeenCalledWith(expect.objectContaining({ action: "quotes.restore" }))
  })
  it("인증 실패와 동시 상태 변경을 성공으로 처리하지 않는다", async () => {
    mocks.auth.mockResolvedValueOnce(NextResponse.json({ error: "Forbidden" }, { status: 403 }))
    expect((await DELETE(request("DELETE"), context)).status).toBe(403)
    expect(mocks.change).not.toHaveBeenCalled()
    mocks.change.mockResolvedValueOnce(null)
    expect((await DELETE(request("DELETE"), context)).status).toBe(409)
  })
})
