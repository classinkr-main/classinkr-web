import { NextRequest, NextResponse } from "next/server"

import { verifyAdmin } from "@/lib/admin-auth"
import { sanitizePublicUrl } from "@/lib/safe-public-url"
import { checkRateLimit, getClientIp } from "@/lib/server/rate-limit"
import { uploadBlogImage } from "@/lib/storage/blog-images"

const UPLOAD_RATE_LIMIT = { windowMs: 60_000, max: 20 }

export async function POST(req: NextRequest) {
  const authError = await verifyAdmin(req)
  if (authError) return authError

  const ip = getClientIp(req)
  const { allowed } = checkRateLimit(ip, "admin-blog-image-upload", UPLOAD_RATE_LIMIT)
  if (!allowed) {
    return NextResponse.json({ error: "Too many requests." }, { status: 429 })
  }

  const formData = await req.formData()
  const file = formData.get("file") as File | null

  if (!file) {
    return NextResponse.json({ error: "파일이 없습니다." }, { status: 400 })
  }

  const result = await uploadBlogImage(file)
  if (!result.ok) {
    switch (result.error.kind) {
      case "missing":
        return NextResponse.json({ error: "파일이 없습니다." }, { status: 400 })
      case "bad_type":
      case "bad_signature":
        return NextResponse.json(
          { error: "JPEG, PNG, WEBP, GIF만 업로드 가능합니다." },
          { status: 400 }
        )
      case "too_large":
        return NextResponse.json(
          { error: "파일 크기는 5MB 이하여야 합니다." },
          { status: 400 }
        )
      case "storage_error":
        console.error("[upload]", result.error.message)
        return NextResponse.json({ error: "업로드에 실패했습니다." }, { status: 500 })
    }
  }

  const url = sanitizePublicUrl(result.url, "")
  if (!url) {
    console.error("[upload] unsafe public URL returned")
    return NextResponse.json({ error: "업로드에 실패했습니다." }, { status: 500 })
  }

  return NextResponse.json({ url })
}
