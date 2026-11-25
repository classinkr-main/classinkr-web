import { NextRequest, NextResponse } from "next/server"
import { afterEach, describe, expect, it, vi } from "vitest"

import { signInternalCsBridgeBody, signInternalCsBridgeTimestamped } from "@/lib/internal-cs-chat/bridge"

const mocks = vi.hoisted(() => ({
  requireVerifiedAdminContext: vi.fn(),
  requireCsCopilotCapability: vi.fn(),
  getInternalCsConversation: vi.fn(),
  getInternalCsIntegrationEventByIdempotency: vi.fn(),
  claimInternalCsIntegrationEvent: vi.fn(),
  updateInternalCsIntegrationEvent: vi.fn(),
  isInternalCsChatNotReadyError: vi.fn(() => false),
  postJson: vi.fn(),
}))

vi.mock("@/lib/admin-auth", () => ({
  CS_COPILOT_API_ROLES: ["SUPER_ADMIN", "ADMIN", "BRANCH"],
  CS_DISPATCH_CAPABILITY: "cs.dispatch",
  requireVerifiedAdminContext: mocks.requireVerifiedAdminContext,
  requireCsCopilotCapability: mocks.requireCsCopilotCapability,
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
    content: "분석 요청 연락처 010-1234-5678 mail@customer.example",
    review_state: "not_required",
    corrected_content: null,
    model_provider: null,
    model_name: null,
    created_at: "2026-07-16T00:00:00.000Z",
  }],
  assets: [{
    id: "asset-1",
    kind: "screenshot",
    original_file_name: "capture_010-9876-5432.png",
    mime_type: "image/png",
    status: "ready",
    analysis_summary: "오류",
    analysis_payload: { extractedText: "문의 담당 other@customer.example 010-5555-6666" },
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
  mocks.requireCsCopilotCapability.mockReturnValue(undefined)
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

  it("returns 403 and does not call the webhook when the cs.dispatch capability is missing", async () => {
    defaults()
    mocks.requireCsCopilotCapability.mockReturnValue(
      NextResponse.json({ error: "Forbidden", requiredCapability: "cs.dispatch" }, { status: 403 })
    )
    const response = await POST(request({ idempotencyKey: "no-cap" }), context)
    expect(response.status).toBe(403)
    expect(mocks.requireCsCopilotCapability).toHaveBeenCalledWith(expect.anything(), "cs.dispatch")
    expect(mocks.postJson).not.toHaveBeenCalled()
    expect(mocks.claimInternalCsIntegrationEvent).not.toHaveBeenCalled()
  })

  it("redacts phone numbers and emails from the outbound body unless original assets are explicitly included", async () => {
    defaults()
    expect((await POST(request({ idempotencyKey: "redacted" }), context)).status).toBe(202)
    const redacted = JSON.stringify(mocks.postJson.mock.calls[0][1])
    expect(redacted).not.toContain("010-1234-5678")
    expect(redacted).not.toContain("mail@customer.example")
    expect(redacted).not.toContain("010-9876-5432")
    expect(redacted).not.toContain("other@customer.example")
    expect(redacted).not.toContain("010-5555-6666")
    expect(redacted).toContain("분석 요청")

    vi.clearAllMocks()
    defaults()
    expect((await POST(request({
      idempotencyKey: "original",
      includeOriginalAssets: true,
      acknowledgeSensitiveData: true,
    }), context)).status).toBe(202)
    const original = JSON.stringify(mocks.postJson.mock.calls[0][1])
    expect(original).toContain("010-1234-5678")
    expect(original).toContain("signed.example")
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
    // 시각을 묶은 서명은 별도 헤더 — 기존 수신자(본문만 검증)가 깨지지 않는다.
    const timestamp = options.headers["x-internal-cs-timestamp"]
    expect(timestamp).toMatch(/^\d{10}$/)
    expect(options.headers["x-internal-cs-signature-v2"]).toBe(
      `sha256=${signInternalCsBridgeTimestamped(JSON.stringify(envelope), timestamp, secret)}`
    )
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
