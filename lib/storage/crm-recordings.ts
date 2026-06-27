import "server-only"

import { randomUUID } from "crypto"

import { createSupabaseAdminClient } from "@/lib/supabase/admin"

export const CRM_RECORDINGS_BUCKET = "crm-recordings"

const MAX_RECORDING_BYTES = 50 * 1024 * 1024
const ALLOWED_RECORDING_TYPES = new Set([
  "audio/mpeg",
  "audio/mp3",
  "audio/mp4",
  "audio/x-m4a",
  "audio/aac",
  "audio/wav",
  "audio/webm",
  "audio/ogg",
  "video/mp4",
  "video/quicktime",
])

const EXTENSION_BY_TYPE: Record<string, string> = {
  "audio/mpeg": "mp3",
  "audio/mp3": "mp3",
  "audio/mp4": "m4a",
  "audio/x-m4a": "m4a",
  "audio/aac": "aac",
  "audio/wav": "wav",
  "audio/webm": "webm",
  "audio/ogg": "ogg",
  "video/mp4": "mp4",
  "video/quicktime": "mov",
}

export type CrmRecordingUploadError =
  | { kind: "missing" }
  | { kind: "bad_type" }
  | { kind: "too_large"; maxBytes: number }
  | { kind: "storage_error"; message: string }

export type CrmRecordingUploadResult =
  | {
      ok: true
      path: string
      fileName: string
      mimeType: string
      sizeBytes: number
    }
  | { ok: false; error: CrmRecordingUploadError }

function safeExtension(file: File) {
  const fromType = EXTENSION_BY_TYPE[file.type]
  if (fromType) return fromType

  const ext = file.name.split(".").pop()?.toLowerCase()
  if (ext && /^[a-z0-9]{2,8}$/.test(ext)) return ext
  return "bin"
}

function monthPath(date = new Date()) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`
}

export async function uploadCrmRecording(file: File | null): Promise<CrmRecordingUploadResult> {
  if (!file || file.size <= 0) return { ok: false, error: { kind: "missing" } }
  if (file.size > MAX_RECORDING_BYTES) {
    return { ok: false, error: { kind: "too_large", maxBytes: MAX_RECORDING_BYTES } }
  }

  const mimeType = file.type || "application/octet-stream"
  if (!ALLOWED_RECORDING_TYPES.has(mimeType)) {
    return { ok: false, error: { kind: "bad_type" } }
  }

  const buffer = Buffer.from(await file.arrayBuffer())
  const path = `${monthPath()}/${Date.now()}-${randomUUID()}.${safeExtension(file)}`
  const supabase = createSupabaseAdminClient()
  const { error } = await supabase.storage.from(CRM_RECORDINGS_BUCKET).upload(path, buffer, {
    contentType: mimeType,
    upsert: false,
  })

  if (error) {
    return { ok: false, error: { kind: "storage_error", message: error.message } }
  }

  return {
    ok: true,
    path,
    fileName: file.name,
    mimeType,
    sizeBytes: file.size,
  }
}

export async function createCrmRecordingSignedUrl(path: string, expiresInSeconds = 60 * 60) {
  const supabase = createSupabaseAdminClient()
  const { data, error } = await supabase.storage
    .from(CRM_RECORDINGS_BUCKET)
    .createSignedUrl(path, expiresInSeconds)

  if (error) return null
  return data.signedUrl
}
