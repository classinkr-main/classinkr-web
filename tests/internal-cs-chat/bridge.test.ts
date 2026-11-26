import { describe, expect, it } from "vitest"

import {
  authenticateInternalCsBridgeRequest,
  signInternalCsBridgeTimestamped,
  decodeInternalCsInboundImage,
  parseInternalCsInboundPayload,
  signInternalCsBridgeBody,
  verifyInternalCsBridgeSignature,
} from "@/lib/internal-cs-chat/bridge"

const conversationId = "123e4567-e89b-42d3-a456-426614174000"

function basePayload(overrides: Record<string, unknown> = {}) {
  return {
    version: "2026-07-16",
    eventType: "cs.analysis.created",
    sourceSystem: "test-adapter",
    transport: "mcp",
    idempotencyKey: "event-1",
    conversationId,
    content: "내부 AI 분석 초안",
    ...overrides,
  }
}

describe("internal CS AI bridge contract", () => {
  it("signs and verifies the exact raw body using timing-safe HMAC comparison", () => {
    const secret = "a-secure-test-secret-that-is-long-enough"
    const raw = JSON.stringify(basePayload())
    const signature = signInternalCsBridgeBody(raw, secret)

    expect(verifyInternalCsBridgeSignature(raw, `sha256=${signature}`, secret)).toBe(true)
    expect(verifyInternalCsBridgeSignature(`${raw} `, signature, secret)).toBe(false)
    expect(verifyInternalCsBridgeSignature(raw, "not-a-signature", secret)).toBe(false)
  })

  it("rejects remote image URLs and requires the dual sensitive-data acknowledgement", () => {
    expect(parseInternalCsInboundPayload(basePayload({
      eventType: "cs.asset.created",
      content: undefined,
      image: { url: "https://example.com/capture.png", mimeType: "image/png", base64: "AAAA" },
    }))).toEqual({
      ok: false,
      error: "remote image URLs are not accepted; send base64 bytes",
    })

    const result = parseInternalCsInboundPayload(basePayload({
      eventType: "cs.context.request",
      content: undefined,
      includeOriginalAssets: true,
    }))
    expect(result).toEqual({
      ok: false,
      error: "acknowledgeSensitiveData must be true when includeOriginalAssets is requested",
    })
  })

  it("decodes only base64 bytes whose claimed MIME matches the image signature", () => {
    const parsed = parseInternalCsInboundPayload(basePayload({
      eventType: "cs.asset.created",
      content: undefined,
      image: {
        fileName: "capture.png",
        mimeType: "image/png",
        base64: Buffer.from([0x89, 0x50, 0x4e, 0x47]).toString("base64"),
      },
    }))
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    const decoded = decodeInternalCsInboundImage(parsed.value.image)
    expect(decoded).toMatchObject({ ok: true, mimeType: "image/png", fileName: "capture.png" })

    const mismatched = decodeInternalCsInboundImage({
      ...parsed.value.image!,
      mimeType: "image/jpeg",
    })
    expect(mismatched).toEqual({ ok: false, error: "image MIME type does not match its file signature" })
  })
})

describe("authenticateInternalCsBridgeRequest", () => {
  const secret = "bridge-secret-that-is-longer-than-thirty-two-chars"
  const body = '{"a":1}'
  const now = 1_800_000_000_000
  const ts = String(Math.floor(now / 1000))

  const call = (overrides: Partial<Parameters<typeof authenticateInternalCsBridgeRequest>[0]> = {}) =>
    authenticateInternalCsBridgeRequest({
      rawBody: body,
      signatureHeader: `sha256=${signInternalCsBridgeTimestamped(body, ts, secret)}`,
      timestampHeader: ts,
      secret,
      now,
      ...overrides,
    })

  it("accepts a timestamped signature inside the window (including the edge)", () => {
    expect(call()).toEqual({ ok: true, mode: "timestamped" })
    const edge = String(Math.floor(now / 1000) - 300)
    expect(call({
      timestampHeader: edge,
      signatureHeader: `sha256=${signInternalCsBridgeTimestamped(body, edge, secret)}`,
    })).toEqual({ ok: true, mode: "timestamped" })
  })

  it("accepts millisecond timestamps", () => {
    const ms = String(now)
    expect(call({
      timestampHeader: ms,
      signatureHeader: `sha256=${signInternalCsBridgeTimestamped(body, ms, secret)}`,
    })).toEqual({ ok: true, mode: "timestamped" })
  })

  it("rejects timestamps outside the window and malformed timestamps", () => {
    const old = String(Math.floor(now / 1000) - 301)
    expect(call({
      timestampHeader: old,
      signatureHeader: `sha256=${signInternalCsBridgeTimestamped(body, old, secret)}`,
    })).toEqual({ ok: false, reason: "bad_timestamp" })
    expect(call({ timestampHeader: "yesterday" })).toEqual({ ok: false, reason: "bad_timestamp" })
  })

  it("rejects a tampered body or a signature made for another timestamp", () => {
    expect(call({ rawBody: '{"a":2}' })).toEqual({ ok: false, reason: "bad_signature" })
    const other = String(Math.floor(now / 1000) - 1)
    expect(call({ timestampHeader: other })).toEqual({ ok: false, reason: "bad_signature" })
  })

  it("accepts legacy body-only signatures without a timestamp unless a timestamp is required", () => {
    const legacy = `sha256=${signInternalCsBridgeBody(body, secret)}`
    expect(call({ timestampHeader: null, signatureHeader: legacy })).toEqual({ ok: true, mode: "legacy" })
    expect(call({ timestampHeader: null, signatureHeader: legacy, requireTimestamp: true })).toEqual({
      ok: false,
      reason: "timestamp_required",
    })
  })
})
