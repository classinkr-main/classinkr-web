import "server-only"

import { createHash } from "crypto"

import { createSupabaseAdminClient } from "@/lib/supabase/admin"
import { validateImageFile } from "@/lib/server/image-validation"

const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"] as const
const MAX_SIZE = 5 * 1024 * 1024
const BUCKET = "blog-images"
const EXTENSION_BY_TYPE: Record<(typeof ALLOWED_TYPES)[number], string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
}

export type BlogImageUploadError =
  | { kind: "missing" }
  | { kind: "bad_type" }
  | { kind: "bad_signature" }
  | { kind: "too_large" }
  | { kind: "storage_error"; message: string }

export type BlogImageUploadResult =
  | { ok: true; url: string; reused?: boolean }
  | { ok: false; error: BlogImageUploadError }

function isExistingObjectError(error: { message?: string; statusCode?: number | string }) {
  const statusCode = String(error.statusCode ?? "")
  const message = error.message?.toLowerCase() ?? ""
  return statusCode === "409" || message.includes("already") || message.includes("exists") || message.includes("duplicate")
}

function getPublicBlogImageUrl(filename: string) {
  const supabase = createSupabaseAdminClient()
  return supabase.storage.from(BUCKET).getPublicUrl(filename).data.publicUrl
}

export async function uploadBlogImage(file: File): Promise<BlogImageUploadResult> {
  if (!file) return { ok: false, error: { kind: "missing" } }

  const validated = await validateImageFile(file, {
    allowedTypes: ALLOWED_TYPES,
    maxBytes: MAX_SIZE,
  })
  if (!validated.ok) return { ok: false, error: { kind: validated.error } }

  const ext = EXTENSION_BY_TYPE[file.type as (typeof ALLOWED_TYPES)[number]] ?? "jpg"
  const hash = createHash("sha256").update(validated.buffer).digest("hex").slice(0, 32)
  const filename = `${hash}.${ext}`

  const supabase = createSupabaseAdminClient()
  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(filename, validated.buffer, { contentType: file.type, upsert: false })

  if (uploadError) {
    if (isExistingObjectError(uploadError)) {
      return { ok: true, url: getPublicBlogImageUrl(filename), reused: true }
    }

    return { ok: false, error: { kind: "storage_error", message: uploadError.message } }
  }

  return { ok: true, url: getPublicBlogImageUrl(filename) }
}
