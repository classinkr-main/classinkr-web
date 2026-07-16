import "server-only"

import { createHmac, timingSafeEqual } from "crypto"

import { detectImageMime } from "@/lib/server/image-validation"

export const INTERNAL_CS_BRIDGE_VERSION = "2026-07-16" as const
export const INTERNAL_CS_INBOUND_EVENT_TYPES = [
  "cs.context.request",
  "cs.message.created",
  "cs.observation.created",
  "cs.analysis.created",
  "cs.asset.created",
] as const

export type InternalCsInboundEventType = (typeof INTERNAL_CS_INBOUND_EVENT_TYPES)[number]
export type InternalCsBridgeTransport = "webhook" | "mcp"
export type InternalCsBridgeImageMimeType = "image/jpeg" | "image/png" | "image/webp"

export interface InternalCsInboundPayload {
  version: typeof INTERNAL_CS_BRIDGE_VERSION
  eventType: InternalCsInboundEventType
  sourceSystem: string
  transport: InternalCsBridgeTransport
  idempotencyKey: string
  correlationId: string | null
  conversationId: string | null
  conversation: {
    title: string | null
    priority: "low" | "normal" | "high" | "urgent"
    tags: string[]
    customerContext: Record<string, unknown>
  } | null
  content: string | null
  model: {
    provider: string
    name: string
    mode: "fast" | "deep" | "backup" | null
  } | null
  image: {
    fileName: string
    mimeType: InternalCsBridgeImageMimeType
    base64: string
    analyze: boolean
    instruction: string | null
  } | null
  includeOriginalAssets: boolean
  acknowledgeSensitiveData: boolean
}

export type ParseInternalCsInboundResult =
  | { ok: true; value: InternalCsInboundPayload }
  | { ok: false; error: string }

const MAX_CONTENT_LENGTH = 12_000
const MAX_BASE64_LENGTH = 11_200_000
const MAX_IMAGE_BYTES = 8 * 1024 * 1024
const EVENT_TYPE_SET = new Set<string>(INTERNAL_CS_INBOUND_EVENT_TYPES)
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const ALLOWED_IMAGE_MIME_TYPES = new Set<InternalCsBridgeImageMimeType>([
  "image/jpeg",
  "image/png",
  "image/webp",
])

function trimTo(value: unknown, maxLength: number) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : ""
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value)
}

function stringList(value: unknown, limit: number, itemLength: number) {
  if (!Array.isArray(value)) return []
  return [...new Set(value.map((item) => trimTo(item, itemLength)).filter(Boolean))].slice(0, limit)
}

function safeObject(value: unknown) {
  return isRecord(value) ? value : {}
}

export function signInternalCsBridgeBody(rawBody: string, secret: string) {
  return createHmac("sha256", secret).update(rawBody).digest("hex")
}

export function verifyInternalCsBridgeSignature(
  rawBody: string,
  signatureHeader: string | null,
  secret: string
) {
  if (!signatureHeader || !secret) return false
  const signature = signatureHeader.trim().replace(/^sha256=/i, "").toLowerCase()
  if (!/^[0-9a-f]{64}$/.test(signature)) return false
  const expected = signInternalCsBridgeBody(rawBody, secret)
  const actualBuffer = Buffer.from(signature, "hex")
  const expectedBuffer = Buffer.from(expected, "hex")
  return actualBuffer.length === expectedBuffer.length && timingSafeEqual(actualBuffer, expectedBuffer)
}

export function decodeInternalCsInboundImage(image: InternalCsInboundPayload["image"]):
  | {
      ok: true
      buffer: Buffer
      mimeType: InternalCsBridgeImageMimeType
      fileName: string
    }
  | { ok: false; error: string } {
  if (!image) return { ok: false, error: "image is required" }
  if (image.base64.length > MAX_BASE64_LENGTH) return { ok: false, error: "image is too large" }
  if (!/^(?:[a-z0-9+/]{4})*(?:[a-z0-9+/]{2}==|[a-z0-9+/]{3}=)?$/i.test(image.base64)) {
    return { ok: false, error: "image.base64 must be valid base64 without a data URL prefix" }
  }

  const buffer = Buffer.from(image.base64, "base64")
  if (buffer.length === 0 || buffer.length > MAX_IMAGE_BYTES) {
    return { ok: false, error: "image must be between 1 byte and 8 MB" }
  }
  const detected = detectImageMime(buffer)
  if (detected !== image.mimeType || !ALLOWED_IMAGE_MIME_TYPES.has(image.mimeType)) {
    return { ok: false, error: "image MIME type does not match its file signature" }
  }
  return { ok: true, buffer, mimeType: image.mimeType, fileName: image.fileName }
}

export function parseInternalCsInboundPayload(value: unknown): ParseInternalCsInboundResult {
  if (!isRecord(value)) return { ok: false, error: "JSON body must be an object" }
  if (value.version !== INTERNAL_CS_BRIDGE_VERSION) {
    return { ok: false, error: `version must be ${INTERNAL_CS_BRIDGE_VERSION}` }
  }
  if (typeof value.eventType !== "string" || !EVENT_TYPE_SET.has(value.eventType)) {
    return { ok: false, error: "eventType is not supported" }
  }

  const sourceSystem = trimTo(value.sourceSystem, 80)
  const idempotencyKey = trimTo(value.idempotencyKey, 160)
  if (!sourceSystem) return { ok: false, error: "sourceSystem is required" }
  if (!idempotencyKey) return { ok: false, error: "idempotencyKey is required" }

  const transport = value.transport === undefined ? "webhook" : value.transport
  if (transport !== "webhook" && transport !== "mcp") {
    return { ok: false, error: "transport must be webhook or mcp" }
  }

  const conversationId = trimTo(value.conversationId, 80) || null
  if (conversationId && !UUID_PATTERN.test(conversationId)) {
    return { ok: false, error: "conversationId must be a UUID" }
  }

  let conversation: InternalCsInboundPayload["conversation"] = null
  if (value.conversation !== undefined) {
    if (!isRecord(value.conversation)) return { ok: false, error: "conversation must be an object" }
    const priority = value.conversation.priority ?? "normal"
    if (!new Set(["low", "normal", "high", "urgent"]).has(String(priority))) {
      return { ok: false, error: "conversation.priority is invalid" }
    }
    conversation = {
      title: trimTo(value.conversation.title, 200) || null,
      priority: priority as "low" | "normal" | "high" | "urgent",
      tags: stringList(value.conversation.tags, 20, 80),
      customerContext: safeObject(value.conversation.customerContext),
    }
  }

  const eventType = value.eventType as InternalCsInboundEventType
  if (eventType === "cs.context.request" && !conversationId) {
    return { ok: false, error: "conversationId is required for cs.context.request" }
  }
  if (!conversationId && !conversation && eventType !== "cs.context.request") {
    return { ok: false, error: "conversationId or conversation is required" }
  }

  const content = trimTo(value.content, MAX_CONTENT_LENGTH) || null
  if (
    (eventType === "cs.message.created" ||
      eventType === "cs.observation.created" ||
      eventType === "cs.analysis.created") &&
    !content
  ) {
    return { ok: false, error: "content is required for this eventType" }
  }

  let model: InternalCsInboundPayload["model"] = null
  if (value.model !== undefined) {
    if (!isRecord(value.model)) return { ok: false, error: "model must be an object" }
    const provider = trimTo(value.model.provider, 80)
    const name = trimTo(value.model.name, 120)
    const mode = value.model.mode ?? null
    if (!provider || !name) return { ok: false, error: "model.provider and model.name are required" }
    if (mode !== null && !new Set(["fast", "deep", "backup"]).has(String(mode))) {
      return { ok: false, error: "model.mode is invalid" }
    }
    model = { provider, name, mode: mode as "fast" | "deep" | "backup" | null }
  }

  let image: InternalCsInboundPayload["image"] = null
  if (value.image !== undefined) {
    if (!isRecord(value.image)) return { ok: false, error: "image must be an object" }
    if ("url" in value.image || "remoteUrl" in value.image) {
      return { ok: false, error: "remote image URLs are not accepted; send base64 bytes" }
    }
    const mimeType = trimTo(value.image.mimeType, 80) as InternalCsBridgeImageMimeType
    const base64 = typeof value.image.base64 === "string" ? value.image.base64.trim() : ""
    if (!ALLOWED_IMAGE_MIME_TYPES.has(mimeType)) {
      return { ok: false, error: "image.mimeType must be image/jpeg, image/png, or image/webp" }
    }
    if (!base64) return { ok: false, error: "image.base64 is required" }
    image = {
      fileName: trimTo(value.image.fileName, 200) || "bridge-image",
      mimeType,
      base64,
      analyze: value.image.analyze !== false,
      instruction: trimTo(value.image.instruction, 2_000) || null,
    }
  }
  if (eventType === "cs.asset.created" && !image) {
    return { ok: false, error: "image is required for cs.asset.created" }
  }

  const includeOriginalAssets = value.includeOriginalAssets === true
  const acknowledgeSensitiveData = value.acknowledgeSensitiveData === true
  if (includeOriginalAssets && !acknowledgeSensitiveData) {
    return {
      ok: false,
      error: "acknowledgeSensitiveData must be true when includeOriginalAssets is requested",
    }
  }

  return {
    ok: true,
    value: {
      version: INTERNAL_CS_BRIDGE_VERSION,
      eventType,
      sourceSystem,
      transport,
      idempotencyKey,
      correlationId: trimTo(value.correlationId, 160) || null,
      conversationId,
      conversation,
      content,
      model,
      image,
      includeOriginalAssets,
      acknowledgeSensitiveData,
    },
  }
}

export function buildInternalCsRedactedEventPayload(payload: InternalCsInboundPayload) {
  return {
    version: payload.version,
    eventType: payload.eventType,
    sourceSystem: payload.sourceSystem,
    transport: payload.transport,
    contentLength: payload.content?.length ?? 0,
    model: payload.model,
    image: payload.image
      ? {
          fileName: payload.image.fileName,
          mimeType: payload.image.mimeType,
          encodedLength: payload.image.base64.length,
          analyze: payload.image.analyze,
        }
      : null,
    includeOriginalAssets: payload.includeOriginalAssets,
  }
}
