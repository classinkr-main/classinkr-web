import { NextRequest, NextResponse } from "next/server"
import { verifyAdmin } from "@/lib/admin-auth"
import { sanitizePublicUrl } from "@/lib/safe-public-url"
import { validateImageFile } from "@/lib/server/image-validation"
import { checkRateLimit, getClientIp } from "@/lib/server/rate-limit"
import { createSupabaseAdminClient } from "@/lib/supabase/admin"

const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"] as const
const EXTENSION_BY_TYPE: Record<(typeof ALLOWED_TYPES)[number], string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
}
const MAX_IMAGE_BYTES = 5 * 1024 * 1024
const UPLOAD_RATE_LIMIT = { windowMs: 60_000, max: 20 }

export async function POST(req: NextRequest) {
  const err = await verifyAdmin(req)
  if (err) return err

  const ip = getClientIp(req)
  const { allowed } = checkRateLimit(ip, "admin-event-image-upload", UPLOAD_RATE_LIMIT)
  if (!allowed) {
    return NextResponse.json({ error: "Too many requests." }, { status: 429 })
  }

  try {
    const formData = await req.formData()
    const file = formData.get("file") as File | null
    if (!file) {
      return NextResponse.json({ error: "file은 필수입니다." }, { status: 400 })
    }
    const validated = await validateImageFile(file, {
      allowedTypes: ALLOWED_TYPES,
      maxBytes: MAX_IMAGE_BYTES,
    })
    if (!validated.ok) {
      return NextResponse.json({ error: "허용되지 않는 파일 형식입니다. (jpeg, png, webp, gif만 허용)" }, { status: 400 })
    }
    const supabase = createSupabaseAdminClient()
    const ext = EXTENSION_BY_TYPE[file.type as (typeof ALLOWED_TYPES)[number]] ?? "jpg"
    const storagePath = `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`
    const { error } = await supabase.storage
      .from("event-images")
      .upload(storagePath, validated.buffer, { contentType: file.type, upsert: true })
    if (error) throw error
    const { data } = supabase.storage.from("event-images").getPublicUrl(storagePath)
    const url = sanitizePublicUrl(data.publicUrl, "")
    if (!url) throw new Error("Invalid upload URL")
    return NextResponse.json({ path: storagePath, url })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "이미지 업로드에 실패했습니다." },
      { status: 500 }
    )
  }
}
