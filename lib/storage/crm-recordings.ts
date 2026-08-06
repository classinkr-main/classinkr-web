import "server-only"

import { randomUUID } from "crypto"

import { createSupabaseAdminClient } from "@/lib/supabase/admin"

export const CRM_RECORDINGS_BUCKET = "crm-recordings"

// 상한은 폼과 공유하는 계약(activity-contract)에서 가져온다 — 두 값이 갈라지면
// 클라이언트가 통과시킨 파일을 서버가 거절하는 상태가 조용히 생긴다.
import { CRM_RECORDING_MAX_BYTES as MAX_RECORDING_BYTES } from "@/components/admin/crm/rail/activity-contract"
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

// 여러 경로를 한 번의 storage 라운드트립으로 서명 — 행마다 createSignedUrl 호출(N+1) 회피.
// 반환: path → signedUrl Map(서명 실패/누락 경로는 빠짐, 호출부에서 null 폴백).
export async function createCrmRecordingSignedUrls(
  paths: string[],
  expiresInSeconds = 60 * 60
): Promise<Map<string, string>> {
  const result = new Map<string, string>()
  const unique = [...new Set(paths.filter(Boolean))]
  if (unique.length === 0) return result

  const supabase = createSupabaseAdminClient()
  const { data, error } = await supabase.storage
    .from(CRM_RECORDINGS_BUCKET)
    .createSignedUrls(unique, expiresInSeconds)

  if (error || !data) return result
  for (const entry of data) {
    if (entry.path && entry.signedUrl) result.set(entry.path, entry.signedUrl)
  }
  return result
}
