import { NextRequest, NextResponse } from "next/server"
import { afterEach, describe, expect, it, vi } from "vitest"

import { signInternalCsBridgeBody } from "@/lib/internal-cs-chat/bridge"

const mocks = vi.hoisted(() => ({
  requireVerifiedAdminContext: vi.fn(),
  getInternalCsConversation: vi.fn(),
  getInternalCsIntegrationEventByIdempotency: vi.fn(),
  claimInternalCsIntegrationEvent: vi.fn(),
  updateInternalCsIntegrationEvent: vi.fn(),
  isInternalCsChatNotReadyError: vi.fn(() => false),
  postJson: vi.fn(),
}))

vi.mock("@/lib/admin-auth", () => ({
  CRM_STAFF_ADMIN_API_ROLES: ["SUPER_ADMIN", "ADMIN", "BRANCH"],
  requireVerifiedAdminContext: mocks.requireVerifiedAdminContext,
}))

vi.mock("@/lib/repositories/internal-cs-chat", () => ({
  getInternalCsConversation: mocks.getInternalCsConversation,
  getInternalCsIntegrationEventByIdempotency: mocks.getInternalCsIntegrationEventByIdempotency,
  claimInternalCsIntegrationEvent: mocks.claimInternalCsIntegrationEvent,
  updateInternalCsIntegrationEvent: mocks.updateInternalCsIntegrationEvent,
  isInternalCsChatNotReadyError: mocks.isInternalCsChatNotReadyError,
}))

vi.mock("@/lib/server/post-json", () => ({ postJson: mocks.postJson }))

import { POST } from "@/app/api/admin/cs-chat/conversations/[id]/dispatch/route"

const secret = "outbound-test-secret-that-is-longer-than-thirty-two"
const context = { params: Promise.resolve({ id: "conversation-1" }) }

function request(body: Record<string, unknown>) {
  return new NextRequest("https://classin.kr/api/admin/cs-chat/conversations/conversation-1/dispatch", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  })
}

const loaded = {
  conversation: {
    id: "conversation-1",
    title: "내부 상담",
    status: "active",
    priority: "normal",
    tags: [],
    last_message_at: null,
    customer_context: { private: true },
  },
  messages: [{
    id: "message-1",
    role: "user",
    content: "분석 요청",
    review_state: "not_required",
    corrected_content: null,
    model_provider: null,
    model_name: null,
    created_at: "2026-07-16T00:00:00.000Z",
  }],
  assets: [{
    id: "asset-1",
    kind: "screenshot",
    original_file_name: "capture.png",
    mime_type: "image/png",
    status: "ready",
    analysis_summary: "오류",
    analysis_payload: {},
    review_state: "pending",
    signed_url: "https://signed.example/private",
  }],
  integrationEvents: [],
}

afterEach(() => {
  vi.clearAllMocks()
  vi.unstubAllEnvs()
})

function defaults() {
  vi.stubEnv("INTERNAL_CS_OUTBOUND_WEBHOOK_URL", "https://approved.example/internal-ai")
  vi.stubEnv("INTERNAL_CS_OUTBOUND_WEBHOOK_SECRET", secret)
  mocks.requireVerifiedAdminContext.mockResolvedValue({ role: "ADMIN", name: "CS 담당자" })
  mocks.getInternalCsIntegrationEventByIdempotency.mockResolvedValue(null)
  mocks.getInternalCsConversation.mockResolvedValue(loaded)
  mocks.claimInternalCsIntegrationEvent.mockResolvedValue({
    created: true,
    event: { id: "event-1" },
  })
  mocks.updateInternalCsIntegrationEvent.mockResolvedValue({ id: "event-1" })
  mocks.postJson.mockResolvedValue({ ok: true, status: 202 })
}

describe("POST internal CS outbound dispatch", () => {
  it("requires an authorized administrator and configured strong secret", async () => {
    vi.stubEnv("INTERNAL_CS_OUTBOUND_WEBHOOK_URL", "https://approved.example/hook")
    vi.stubEnv("INTERNAL_CS_OUTBOUND_WEBHOOK_SECRET", "short")
    mocks.requireVerifiedAdminContext.mockResolvedValue({ role: "ADMIN", name: "CS" })
    expect((await POST(request({}), context)).status).toBe(503)

    mocks.requireVerifiedAdminContext.mockResolvedValue(
      NextResponse.json({ error: "Forbidden" }, { status: 403 })
    )
    expect((await POST(request({}), context)).status).toBe(403)
  })

  it("requires explicit acknowledgement before original image URLs are included", async () => {
    defaults()
    const response = await POST(request({ includeOriginalAssets: true }), context)
    expect(response.status).toBe(400)
    expect(mocks.postJson).not.toHaveBeenCalled()
  })

  it("uses only the fixed env URL, signs the exact body, and excludes original URLs by default", async () => {
    defaults()
    const response = await POST(request({
      idempotencyKey: "dispatch-1",
      targetUrl: "https://attacker.example/hook",
    }), context)
    expect(response.status).toBe(202)

    const [url, envelope, options] = mocks.postJson.mock.calls[0]
    expect(url).toBe("https://approved.example/internal-ai")
    expect(JSON.stringify(envelope)).not.toContain("signed.example")
    expect(envelope.context.conversation.customer_context).toBeUndefined()
    const expectedSignature = signInternalCsBridgeBody(JSON.stringify(envelope), secret)
    expect(options.headers["x-internal-cs-signature"]).toBe(`sha256=${expectedSignature}`)
    expect(mocks.claimInternalCsIntegrationEvent).toHaveBeenCalledWith(expect.objectContaining({
      direction: "outbound",
      transport: "admin",
      idempotencyKey: "dispatch-1",
      payload: expect.objectContaining({ target: "configured_internal_ai_webhook" }),
    }))
  })

  it("does not repeat the outbound HTTP request when the idempotency claim already exists", async () => {
    defaults()
    mocks.claimInternalCsIntegrationEvent.mockResolvedValue({
      created: false,
      event: { id: "event-existing", status: "completed", result: { httpStatus: 202 } },
    })

    const response = await POST(request({ idempotencyKey: "dispatch-existing" }), context)
    const json = await response.json()

    expect(response.status).toBe(200)
    expect(json).toMatchObject({ ok: true, duplicate: true, eventId: "event-existing" })
    expect(mocks.postJson).not.toHaveBeenCalled()
  })
})
