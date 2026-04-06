import { NextResponse } from "next/server"
import { createSupabaseServerClient } from "@/lib/supabase/server"

// POST — 레거시 호환용 (기존 코드에서 /api/admin/auth 호출하는 경우)
export async function POST() {
  return NextResponse.json(
    { error: "이 엔드포인트는 더 이상 사용하지 않습니다. Supabase Auth를 사용하세요." },
    { status: 410 }
  )
}

// DELETE — 로그아웃
export async function DELETE() {
  const supabase = await createSupabaseServerClient()
  await supabase.auth.signOut()

  const res = NextResponse.json({ ok: true })
  // 레거시 쿠키도 함께 제거
  res.cookies.set("admin_session", "", { maxAge: 0, path: "/" })
  return res
}
