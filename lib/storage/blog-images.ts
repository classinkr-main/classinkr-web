import "server-only"

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
  | { ok: true; url: string }
  | { ok: false; error: BlogImageUploadError }

export async function uploadBlogImage(file: File): Promise<BlogImageUploadResult> {
  if (!file) return { ok: false, error: { kind: "missing" } }

  const validated = await validateImageFile(file, {
    allowedTypes: ALLOWED_TYPES,
    maxBytes: MAX_SIZE,
  })
  if (!validated.ok) return { ok: false, error: { kind: validated.error } }

  const rawExt = file.name.toLowerCase().match(/\.([a-z0-9]+)$/)?.[1]
  const ext =
    rawExt && /^[a-z0-9]+$/.test(rawExt)
      ? rawExt
      : EXTENSION_BY_TYPE[file.type as (typeof ALLOWED_TYPES)[number]] ?? "jpg"
  const filename = `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`

  const supabase = createSupabaseAdminClient()
  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(filename, validated.buffer, { contentType: file.type, upsert: false })

  if (uploadError) {
    return { ok: false, error: { kind: "storage_error", message: uploadError.message } }
  }

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(filename)
  return { ok: true, url: data.publicUrl }
}
