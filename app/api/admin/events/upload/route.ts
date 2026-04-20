import { NextRequest, NextResponse } from "next/server"
import { verifyAdmin } from "@/lib/admin-auth"
import { createSupabaseAdminClient } from "@/lib/supabase/admin"

export async function POST(req: NextRequest) {
  const err = await verifyAdmin(req)
  if (err) return err
  try {
    const formData = await req.formData()
    const file = formData.get("file") as File | null
    if (!file) {
      return NextResponse.json({ error: "file은 필수입니다." }, { status: 400 })
    }
    const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"]
    if (!ALLOWED_TYPES.includes(file.type)) {
      return NextResponse.json({ error: "허용되지 않는 파일 형식입니다. (jpeg, png, webp, gif만 허용)" }, { status: 400 })
    }
    const supabase = createSupabaseAdminClient()
    const ext = file.name.split(".").pop() ?? "jpg"
    const storagePath = `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`
    const buffer = await file.arrayBuffer()
    const { error } = await supabase.storage
      .from("event-images")
      .upload(storagePath, buffer, { contentType: file.type, upsert: true })
    if (error) throw error
    const { data } = supabase.storage.from("event-images").getPublicUrl(storagePath)
    return NextResponse.json({ path: storagePath, url: data.publicUrl })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "이미지 업로드에 실패했습니다." },
      { status: 500 }
    )
  }
}
