import "server-only"

import { createHash } from "crypto"

import { detectImageMime, validateImageFile } from "@/lib/server/image-validation"
import { createSupabaseAdminClient } from "@/lib/supabase/admin"

export const INTERNAL_CS_ASSETS_BUCKET = "internal-cs-assets"
export const INTERNAL_CS_ASSET_MAX_BYTES = 8 * 1024 * 1024
export const INTERNAL_CS_ASSET_MIME_TYPES = ["image/jpeg", "image/png", "image/webp"] as const

export type InternalCsAssetMimeType = (typeof INTERNAL_CS_ASSET_MIME_TYPES)[number]

const EXTENSION_BY_TYPE: Record<InternalCsAssetMimeType, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
}
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export type InternalCsAssetUploadError =
  | { kind: "missing" }
  | { kind: "bad_conversation_id" }
  | { kind: "bad_type" }
  | { kind: "bad_signature" }
  | { kind: "too_large"; maxBytes: number }
  | { kind: "storage_error"; message: string }

export type InternalCsAssetUploadResult =
  | {
      ok: true
      path: string
      fileName: string
      mimeType: InternalCsAssetMimeType
      sizeBytes: number
      sha256: string
      reused: boolean
    }
  | { ok: false; error: InternalCsAssetUploadError }

export interface UploadInternalCsAssetBufferInput {
  buffer: Buffer | Uint8Array
  conversationId: string
  fileName: string
  mimeType: string
}

function isAllowedMimeType(value: string): value is InternalCsAssetMimeType {
  return INTERNAL_CS_ASSET_MIME_TYPES.includes(value as InternalCsAssetMimeType)
}

function cleanFileName(value: string) {
  const trimmed = value.trim().replace(/[\u0000-\u001f\u007f]/g, "")
  return (trimmed || "capture").slice(0, 255)
}

function isExistingObjectError(error: { message?: string; statusCode?: number | string }) {
  const statusCode = String(error.statusCode ?? "")
  const message = error.message?.toLowerCase() ?? ""
  return statusCode === "409" || message.includes("already") || message.includes("exists") || message.includes("duplicate")
}

async function uploadValidatedInternalCsAsset(input: {
  buffer: Uint8Array
  conversationId: string
  fileName: string
  mimeType: InternalCsAssetMimeType
}): Promise<InternalCsAssetUploadResult> {
  if (!UUID_PATTERN.test(input.conversationId)) {
    return { ok: false, error: { kind: "bad_conversation_id" } }
  }
  if (input.buffer.byteLength === 0) return { ok: false, error: { kind: "missing" } }
  if (input.buffer.byteLength > INTERNAL_CS_ASSET_MAX_BYTES) {
    return {
      ok: false,
      error: { kind: "too_large", maxBytes: INTERNAL_CS_ASSET_MAX_BYTES },
    }
  }

  const detectedType = detectImageMime(input.buffer)
  if (!detectedType || detectedType !== input.mimeType || !isAllowedMimeType(detectedType)) {
    return { ok: false, error: { kind: "bad_signature" } }
  }

  const sha256 = createHash("sha256").update(input.buffer).digest("hex")
  const path = `${input.conversationId.toLowerCase()}/${sha256}.${EXTENSION_BY_TYPE[input.mimeType]}`
  const supabase = createSupabaseAdminClient()
  const { error } = await supabase.storage
    .from(INTERNAL_CS_ASSETS_BUCKET)
    .upload(path, input.buffer, {
      contentType: input.mimeType,
      upsert: false,
    })

  if (error && !isExistingObjectError(error)) {
    return { ok: false, error: { kind: "storage_error", message: error.message } }
  }

  return {
    ok: true,
    path,
    fileName: cleanFileName(input.fileName),
    mimeType: input.mimeType,
    sizeBytes: input.buffer.byteLength,
    sha256,
    reused: Boolean(error),
  }
}

export async function uploadInternalCsAsset(
  file: File | null,
  options: { conversationId: string }
): Promise<InternalCsAssetUploadResult> {
  if (!file || file.size <= 0) return { ok: false, error: { kind: "missing" } }
  if (!UUID_PATTERN.test(options.conversationId)) {
    return { ok: false, error: { kind: "bad_conversation_id" } }
  }
  if (!isAllowedMimeType(file.type)) return { ok: false, error: { kind: "bad_type" } }

  const validated = await validateImageFile(file, {
    allowedTypes: INTERNAL_CS_ASSET_MIME_TYPES,
    maxBytes: INTERNAL_CS_ASSET_MAX_BYTES,
  })
  if (!validated.ok) {
    return {
      ok: false,
      error: validated.error === "too_large"
        ? { kind: "too_large", maxBytes: INTERNAL_CS_ASSET_MAX_BYTES }
        : { kind: validated.error },
    }
  }

  return uploadValidatedInternalCsAsset({
    buffer: validated.buffer,
    conversationId: options.conversationId,
    fileName: file.name,
    mimeType: file.type,
  })
}

export const uploadInternalCsImage = uploadInternalCsAsset

export async function uploadInternalCsAssetBuffer(
  input: UploadInternalCsAssetBufferInput
): Promise<InternalCsAssetUploadResult> {
  if (!isAllowedMimeType(input.mimeType)) return { ok: false, error: { kind: "bad_type" } }
  const buffer = input.buffer instanceof Uint8Array ? input.buffer : new Uint8Array(input.buffer)
  return uploadValidatedInternalCsAsset({
    buffer,
    conversationId: input.conversationId,
    fileName: input.fileName,
    mimeType: input.mimeType,
  })
}

export async function createInternalCsAssetSignedUrls(
  paths: string[],
  expiresInSeconds = 15 * 60
): Promise<Map<string, string>> {
  const result = new Map<string, string>()
  const unique = [...new Set(paths.map((path) => path.trim()).filter(Boolean))]
  if (unique.length === 0) return result

  const supabase = createSupabaseAdminClient()
  const { data, error } = await supabase.storage
    .from(INTERNAL_CS_ASSETS_BUCKET)
    .createSignedUrls(unique, expiresInSeconds)

  if (error || !data) return result
  for (const entry of data) {
    if (entry.path && entry.signedUrl) result.set(entry.path, entry.signedUrl)
  }
  return result
}

export async function deleteInternalCsAsset(path: string) {
  const normalized = path.trim()
  if (!normalized) return false
  const supabase = createSupabaseAdminClient()
  const { error } = await supabase.storage.from(INTERNAL_CS_ASSETS_BUCKET).remove([normalized])
  return !error
}
