import { NextRequest, NextResponse } from "next/server"
import { afterEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  requireVerifiedAdminContext: vi.fn(),
  createInternalCsMessage: vi.fn(),
}))

vi.mock("@/lib/admin-auth", () => ({
  CS_COPILOT_API_ROLES: ["SUPER_ADMIN", "ADMIN", "BRANCH", "EDITOR"],
  requireVerifiedAdminContext: mocks.requireVerifiedAdminContext,
}))

vi.mock("@/lib/repositories/internal-cs-chat", () => ({
  createInternalCsMessage: mocks.createInternalCsMessage,
  isInternalCsChatNotReadyError: () => false,
}))

import { POST } from "@/app/api/admin/cs-chat/conversations/[id]/messages/route"

const context = { params: Promise.resolve({ id: "conversation-1" }) }

function request(body: unknown) {
  return new NextRequest("https://classin.kr/api/admin/cs-chat/conversations/conversation-1/messages", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  })
}

afterEach(() => vi.clearAllMocks())

function ok() {
  mocks.requireVerifiedAdminContext.mockResolvedValue({ role: "ADMIN", name: "담당자" })
  mocks.createInternalCsMessage.mockResolvedValue({ id: "m1" })
}

describe("POST cs-chat messages", () => {
  it("uses the auth guard first", async () => {
    mocks.requireVerifiedAdminContext.mockResolvedValue(NextResponse.json({ error: "Forbidden" }, { status: 403 }))
    expect((await POST(request({ role: "user", content: "a" }), context)).status).toBe(403)
    expect(mocks.createInternalCsMessage).not.toHaveBeenCalled()
  })

  it("rejects assistant and system roles", async () => {
    ok()
    for (const role of ["assistant", "system", "other"]) {
      const response = await POST(request({ role, content: "위조" }), context)
      expect(response.status, role).toBe(400)
    }
    expect(mocks.createInternalCsMessage).not.toHaveBeenCalled()
  })

  it("rejects model fields and sourceRefs", async () => {
    ok()
    expect((await POST(request({ role: "internal_note", content: "x", modelName: "m" }), context)).status).toBe(400)
    expect((await POST(request({ role: "internal_note", content: "x", modelProvider: "p" }), context)).status).toBe(400)
    expect((await POST(request({ role: "internal_note", content: "x", sourceRefs: [] }), context)).status).toBe(400)
    expect(mocks.createInternalCsMessage).not.toHaveBeenCalled()
  })

  it("rejects metadata.kind outside the allow-list", async () => {
    ok()
    for (const kind of ["quick_approved", "confidence", 3]) {
      const response = await POST(request({ role: "internal_note", content: "x", metadata: { kind } }), context)
      expect(response.status, String(kind)).toBe(400)
    }
    expect(mocks.createInternalCsMessage).not.toHaveBeenCalled()
  })

  it("accepts user and internal_note with an allowed kind and keeps only kind in metadata", async () => {
    ok()
    const hq = await POST(request({
      role: "internal_note",
      content: "본사 회신",
      metadata: { kind: "hq_reply", promotionConfidence: 0.99, bridgeSourceSystem: "x" },
    }), context)
    expect(hq.status).toBe(201)
    expect(mocks.createInternalCsMessage).toHaveBeenCalledWith(expect.objectContaining({
      conversationId: "conversation-1",
      role: "internal_note",
      metadata: { kind: "hq_reply" },
    }))
    expect((await POST(request({ role: "user", content: "질문" }), context)).status).toBe(201)
    const second = mocks.createInternalCsMessage.mock.calls[1][0]
    expect(second.role).toBe("user")
    expect(second.modelName).toBeUndefined()
    expect(second.sourceRefs).toBeUndefined()
  })
})
