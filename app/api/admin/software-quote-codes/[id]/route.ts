import { NextRequest, NextResponse } from "next/server"

import { STAFF_ADMIN_API_ROLES, verifyAdmin } from "@/lib/admin-auth"
import { createSupabaseAdminClient } from "@/lib/supabase/admin"

interface RouteContext {
  params: Promise<{ id: string }>
}

export async function PATCH(req: NextRequest, context: RouteContext) {
  const authError = await verifyAdmin(req, STAFF_ADMIN_API_ROLES)
  if (authError) return authError

  try {
    const { id } = await context.params
    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null
    if (!body) {
      return NextResponse.json({ error: "요청 본문을 읽을 수 없습니다." }, { status: 400 })
    }

    const updates: Record<string, unknown> = {}
    if (typeof body.notes === "string") updates.notes = body.notes.trim() || null
    if (typeof body.expiresAt === "string") {
      updates.expires_at = body.expiresAt.trim() ? new Date(body.expiresAt).toISOString() : null
    }
    if (body.cancel === true) {
      // 즉시 만료 처리
      updates.expires_at = new Date().toISOString()
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: "변경할 내용이 없습니다." }, { status: 400 })
    }

    const supabase = createSupabaseAdminClient()
    const { data, error } = await supabase
      .from("software_quote_codes")
      .update(updates)
      .eq("id", id)
      .select("*")
      .single()
    if (error) throw error

    return NextResponse.json({ code: data })
  } catch (error) {
    console.error("[admin/software-quote-codes] PATCH error:", error)
    return NextResponse.json({ error: "코드 수정에 실패했습니다." }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest, context: RouteContext) {
  const authError = await verifyAdmin(req, STAFF_ADMIN_API_ROLES)
  if (authError) return authError

  try {
    const { id } = await context.params
    const supabase = createSupabaseAdminClient()

    // 사용된 코드는 삭제 대신 만료 처리
    const { data: existing, error: fetchError } = await supabase
      .from("software_quote_codes")
      .select("id, redeemed_at")
      .eq("id", id)
      .maybeSingle()
    if (fetchError) throw fetchError
    if (!existing) {
      return NextResponse.json({ error: "코드를 찾지 못했습니다." }, { status: 404 })
    }
    if (existing.redeemed_at) {
      return NextResponse.json(
        { error: "이미 사용된 코드는 삭제할 수 없습니다. 만료 처리만 가능합니다." },
        { status: 400 }
      )
    }

    const { error: deleteError } = await supabase
      .from("software_quote_codes")
      .delete()
      .eq("id", id)
    if (deleteError) throw deleteError

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error("[admin/software-quote-codes] DELETE error:", error)
    return NextResponse.json({ error: "코드 삭제에 실패했습니다." }, { status: 500 })
  }
}
