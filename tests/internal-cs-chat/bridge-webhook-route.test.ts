import { NextRequest } from "next/server"
import { afterEach, describe, expect, it, vi } from "vitest"

import { signInternalCsBridgeBody, signInternalCsBridgeTimestamped } from "@/lib/internal-cs-chat/bridge"

const mocks = vi.hoisted(() => ({
  checkRateLimitDistributed: vi.fn(),
  getClientIp: vi.fn(() => "127.0.0.1"),
  getInternalCsIntegrationEventByIdempotency: vi.fn(),
  getInternalCsConversation: vi.fn(),
  createInternalCsConversation: vi.fn(),
  claimInternalCsIntegrationEvent: vi.fn(),
  updateInternalCsIntegrationEvent: vi.fn(),
  createInternalCsMessage: vi.fn(),
  createInternalCsAsset: vi.fn(),
  findInternalCsAssetByHash: vi.fn(),
  getInternalCsAsset: vi.fn(),
  updateInternalCsAssetAnalysis: vi.fn(),
  isInternalCsChatNotReadyError: vi.fn(() => false),
  uploadInternalCsAssetBuffer: vi.fn(),
  analyzeInternalCsImage: vi.fn(),
}))

vi.mock("@/lib/server/rate-limit", () => ({
  checkRateLimitDistributed: mocks.checkRateLimitDistributed,
  getClientIp: mocks.getClientIp,
}))

vi.mock("@/lib/repositories/internal-cs-chat", () => ({
  getInternalCsIntegrationEventByIdempotency: mocks.getInternalCsIntegrationEventByIdempotency,
  getInternalCsConversation: mocks.getInternalCsConversation,
  createInternalCsConversation: mocks.createInternalCsConversation,
  claimInternalCsIntegrationEvent: mocks.claimInternalCsIntegrationEvent,
  updateInternalCsIntegrationEvent: mocks.updateInternalCsIntegrationEvent,
  createInternalCsMessage: mocks.createInternalCsMessage,
  createInternalCsAsset: mocks.createInternalCsAsset,
  findInternalCsAssetByHash: mocks.findInternalCsAssetByHash,
  getInternalCsAsset: mocks.getInternalCsAsset,
  updateInternalCsAssetAnalysis: mocks.updateInternalCsAssetAnalysis,
  isInternalCsChatNotReadyError: mocks.isInternalCsChatNotReadyError,
  isInternalCsAssetStorageDeleted: (row: { metadata?: Record<string, unknown> }) => typeof row.metadata?.storageDeletedAt === "string",
}))

vi.mock("@/lib/storage/internal-cs-assets", () => ({
  uploadInternalCsAssetBuffer: mocks.uploadInternalCsAssetBuffer,
}))

vi.mock("@/lib/internal-cs-chat/vision", () => ({
  analyzeInternalCsImage: mocks.analyzeInternalCsImage,
}))

import { POST } from "@/app/api/webhook/internal-cs/route"

const secret = "test-secret-that-is-at-least-thirty-two-characters"
const conversationId = "123e4567-e89b-42d3-a456-426614174000"

function signedRequest(payload: Record<string, unknown>, overrideSignature?: string) {
  const raw = JSON.stringify(payload)
  const signature = overrideSignature ?? signInternalCsBridgeBody(raw, secret)
  return new NextRequest("https://classin.kr/api/webhook/internal-cs", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-internal-cs-signature": `sha256=${signature}`,
    },
    body: raw,
  })
}

function timestampedRequest(payload: Record<string, unknown>, options: { timestamp?: string; signedTimestamp?: string } = {}) {
  const raw = JSON.stringify(payload)
  const timestamp = options.timestamp ?? String(Math.floor(Date.now() / 1000))
  const signature = signInternalCsBridgeTimestamped(raw, options.signedTimestamp ?? timestamp, secret)
  return new NextRequest("https://classin.kr/api/webhook/internal-cs", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-internal-cs-signature": `sha256=${signature}`,
      "x-internal-cs-timestamp": timestamp,
    },
    body: raw,
  })
}

function payload(overrides: Record<string, unknown> = {}) {
  return {
    version: "2026-07-16",
    eventType: "cs.analysis.created",
    sourceSystem: "approved-adapter",
    transport: "mcp",
    idempotencyKey: "analysis-1",
    conversationId,
    content: "내부 분석 초안",
    model: { provider: "provider", name: "model", mode: "deep" },
    ...overrides,
  }
}

const loaded = {
  conversation: {
    id: conversationId,
    title: "상담",
    status: "active",
    priority: "normal",
    tags: ["capture"],
    last_message_at: null,
    customer_context: { private: "must-not-leak" },
    created_by: "private-owner",
  },
  messages: [],
  assets: [{
    id: "asset-1",
    kind: "screenshot",
    original_file_name: "capture.png",
    mime_type: "image/png",
    status: "ready",
    analysis_summary: "오류 화면",
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
  vi.stubEnv("INTERNAL_CS_INGEST_SECRET", secret)
  mocks.checkRateLimitDistributed.mockResolvedValue({ allowed: true, remaining: 59, resetAt: 0 })
  mocks.getInternalCsIntegrationEventByIdempotency.mockResolvedValue(null)
  mocks.getInternalCsConversation.mockResolvedValue(loaded)
  mocks.claimInternalCsIntegrationEvent.mockResolvedValue({
    created: true,
    event: { id: "event-1" },
  })
  mocks.updateInternalCsIntegrationEvent.mockResolvedValue({ id: "event-1" })
  mocks.createInternalCsMessage.mockResolvedValue({ id: "message-1", review_state: "pending" })
}

describe("POST /api/webhook/internal-cs", () => {
  it("fails closed when the HMAC secret is absent or the signature is invalid", async () => {
    vi.stubEnv("INTERNAL_CS_INGEST_SECRET", "")
    expect((await POST(signedRequest(payload()))).status).toBe(503)

    vi.stubEnv("INTERNAL_CS_INGEST_SECRET", secret)
    expect((await POST(signedRequest(payload(), "0".repeat(64)))).status).toBe(401)
    expect(mocks.getInternalCsConversation).not.toHaveBeenCalled()
  })

  it("stores external AI output as an assistant draft pending CS review and redacts event logs", async () => {
    defaults()
    const response = await POST(signedRequest(payload()))
    const json = await response.json()

    expect(response.status).toBe(202)
    expect(json).toMatchObject({
      ok: true,
      messageId: "message-1",
      customerDeliveryAllowed: false,
      reviewRequired: true,
    })
    expect(mocks.createInternalCsMessage).toHaveBeenCalledWith(expect.objectContaining({
      conversationId,
      role: "assistant",
      content: "내부 분석 초안",
      modelProvider: "provider",
      modelName: "model",
      modelMode: "deep",
    }))
    const eventInput = mocks.claimInternalCsIntegrationEvent.mock.calls[0][0]
    expect(eventInput.payload).toMatchObject({ contentLength: 8 })
    expect(JSON.stringify(eventInput.payload)).not.toContain("내부 분석 초안")
    expect(mocks.updateInternalCsIntegrationEvent).toHaveBeenCalledWith(expect.objectContaining({
      eventId: "event-1",
      status: "completed",
      result: expect.objectContaining({ messageId: "message-1" }),
    }))
  })

  it("returns a whitelisted context and excludes original signed URLs by default", async () => {
    defaults()
    const response = await POST(signedRequest(payload({
      eventType: "cs.context.request",
      content: undefined,
      model: undefined,
      idempotencyKey: "context-1",
    })))
    const json = await response.json()

    expect(response.status).toBe(200)
    expect(json.context.conversation).toEqual({
      id: conversationId,
      title: "상담",
      status: "active",
      priority: "normal",
      tags: ["capture"],
      lastMessageAt: null,
    })
    expect(json.context.conversation.customer_context).toBeUndefined()
    expect(json.context.assets[0].signedUrl).toBeUndefined()
  })

  it("stops processing when another request already won the idempotency claim", async () => {
    defaults()
    mocks.claimInternalCsIntegrationEvent.mockResolvedValue({
      created: false,
      event: {
        id: "event-existing",
        conversation_id: conversationId,
        status: "processing",
        result: {},
      },
    })

    const response = await POST(signedRequest(payload()))
    const json = await response.json()

    expect(response.status).toBe(200)
    expect(json).toMatchObject({ duplicate: true, eventId: "event-existing", status: "processing" })
    expect(mocks.createInternalCsMessage).not.toHaveBeenCalled()
    expect(mocks.analyzeInternalCsImage).not.toHaveBeenCalled()
  })

  it("rejects remote image URLs before any persistence", async () => {
    defaults()
    const response = await POST(signedRequest(payload({
      eventType: "cs.asset.created",
      content: undefined,
      model: undefined,
      image: {
        url: "https://example.com/capture.png",
        mimeType: "image/png",
        base64: "AAAA",
      },
    })))
    expect(response.status).toBe(400)
    expect(mocks.claimInternalCsIntegrationEvent).not.toHaveBeenCalled()
  })

  it("accepts a fresh timestamped signature and rejects timestamps outside the 5 minute window", async () => {
    defaults()
    expect((await POST(timestampedRequest(payload()))).status).toBe(202)

    vi.clearAllMocks()
    defaults()
    const stale = String(Math.floor(Date.now() / 1000) - 6 * 60)
    expect((await POST(timestampedRequest(payload({ idempotencyKey: "stale" }), { timestamp: stale }))).status).toBe(401)
    const future = String(Math.floor(Date.now() / 1000) + 6 * 60)
    expect((await POST(timestampedRequest(payload({ idempotencyKey: "future" }), { timestamp: future }))).status).toBe(401)
    expect(mocks.getInternalCsConversation).not.toHaveBeenCalled()
    expect(mocks.claimInternalCsIntegrationEvent).not.toHaveBeenCalled()
  })

  it("does not let a body-only signature be replayed with a fresh timestamp header", async () => {
    defaults()
    const raw = JSON.stringify(payload({ idempotencyKey: "replay" }))
    const request = new NextRequest("https://classin.kr/api/webhook/internal-cs", {
      method: "POST",
      headers: {
        "x-internal-cs-signature": `sha256=${signInternalCsBridgeBody(raw, secret)}`,
        "x-internal-cs-timestamp": String(Math.floor(Date.now() / 1000)),
      },
      body: raw,
    })
    expect((await POST(request)).status).toBe(401)
    // 서명한 시각과 헤더의 시각이 다르면 거절한다.
    const now = Math.floor(Date.now() / 1000)
    expect((await POST(timestampedRequest(payload({ idempotencyKey: "swap" }), {
      timestamp: String(now),
      signedTimestamp: String(now - 10),
    }))).status).toBe(401)
  })

  it("keeps accepting body-only signatures during the transition and rejects them once the switch is on", async () => {
    defaults()
    expect((await POST(signedRequest(payload()))).status).toBe(202)

    vi.clearAllMocks()
    defaults()
    vi.stubEnv("INTERNAL_CS_BRIDGE_REQUIRE_TIMESTAMP", "1")
    expect((await POST(signedRequest(payload()))).status).toBe(401)
    expect(mocks.claimInternalCsIntegrationEvent).not.toHaveBeenCalled()
  })

  it("answers a repeated context.request with status only (no context, no signed URLs)", async () => {
    defaults()
    mocks.getInternalCsIntegrationEventByIdempotency.mockResolvedValue({
      id: "event-prior",
      conversation_id: conversationId,
      status: "completed",
      result: { messageCount: 0, assetCount: 1, originalAssetsIncluded: true },
    })
    const response = await POST(signedRequest(payload({
      eventType: "cs.context.request",
      content: undefined,
      model: undefined,
      idempotencyKey: "context-1",
      includeOriginalAssets: true,
      acknowledgeSensitiveData: true,
    })))
    const json = await response.json()

    expect(response.status).toBe(200)
    expect(json).toMatchObject({ ok: true, duplicate: true, eventId: "event-prior", status: "completed" })
    expect(json.context).toBeUndefined()
    expect(JSON.stringify(json)).not.toContain("signed.example")
    expect(mocks.getInternalCsConversation).not.toHaveBeenCalled()
  })

  it("redacts phone numbers and emails in the returned context unless original assets are requested", async () => {
    defaults()
    mocks.getInternalCsConversation.mockResolvedValue({
      ...loaded,
      messages: [{
        id: "m1", role: "user", content: "연락처 010-2222-3333 a@b.example", review_state: "not_required",
        corrected_content: null, model_provider: null, model_name: null, created_at: "2026-07-16T00:00:00.000Z",
      }],
    })
    const response = await POST(signedRequest(payload({
      eventType: "cs.context.request", content: undefined, model: undefined, idempotencyKey: "context-redact",
    })))
    const text = JSON.stringify(await response.json())
    expect(text).not.toContain("010-2222-3333")
    expect(text).not.toContain("a@b.example")
  })
})
