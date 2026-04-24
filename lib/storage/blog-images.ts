import "server-only"

import { createSupabaseAdminClient } from "@/lib/supabase/admin"

const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"] as const
const MAX_SIZE = 5 * 1024 * 1024
const BUCKET = "blog-images"

export type BlogImageUploadError =
  | { kind: "missing" }
  | { kind: "bad_type" }
  | { kind: "too_large" }
  | { kind: "storage_error"; message: string }

export type BlogImageUploadResult =
  | { ok: true; url: string }
  | { ok: false; error: BlogImageUploadError }

export async function uploadBlogImage(file: File): Promise<BlogImageUploadResult> {
  if (!file) return { ok: false, error: { kind: "missing" } }
  if (!ALLOWED_TYPES.includes(file.type as (typeof ALLOWED_TYPES)[number])) {
    return { ok: false, error: { kind: "bad_type" } }
  }
  if (file.size > MAX_SIZE) return { ok: false, error: { kind: "too_large" } }

  const ext = file.name.split(".").pop() ?? "jpg"
  const filename = `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`
  const arrayBuffer = await file.arrayBuffer()
  const buffer = new Uint8Array(arrayBuffer)

  const supabase = createSupabaseAdminClient()
  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(filename, buffer, { contentType: file.type, upsert: false })

  if (uploadError) {
    return { ok: false, error: { kind: "storage_error", message: uploadError.message } }
  }

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(filename)
  return { ok: true, url: data.publicUrl }
}
