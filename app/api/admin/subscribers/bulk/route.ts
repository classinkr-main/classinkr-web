import { NextRequest, NextResponse } from "next/server"
import { verifyAdmin } from "@/lib/admin-auth"
import { createSupabaseAdminClient } from "@/lib/supabase/admin"

const USE_SUPABASE = process.env.USE_SUPABASE_MARKETING === "true"

// ─── PATCH: 벌크 태그 추가 ────────────────────────────────────
// body: { ids: string[], tags: string[] }
// → 각 구독자의 기존 태그에 새 태그를 병합 (중복 제거)
export async function PATCH(req: NextRequest) {
  const authError = await verifyAdmin(req)
  if (authError) return authError

  let body: { ids: string[]; tags: string[] }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "JSON 파싱 실패" }, { status: 400 })
  }

  const { ids, tags } = body

  if (!Array.isArray(ids) || ids.length === 0) {
    return NextResponse.json({ error: "ids 배열이 필요합니다" }, { status: 400 })
  }
  if (!Array.isArray(tags) || tags.length === 0) {
    return NextResponse.json({ error: "tags 배열이 필요합니다" }, { status: 400 })
  }

  if (!USE_SUPABASE) {
    // JSON 폴백 모드: 메모리 내에서 각 구독자 태그를 업데이트
    const { getAllSubscribers, upsertSubscriber } = await import("@/lib/repositories/marketing")
    const allSubscribers = await getAllSubscribers()
    let updated = 0

    for (const id of ids) {
      const subscriber = allSubscribers.find(
        (s) => String(s.id) === String(id)
      )
      if (!subscriber) continue

      const mergedTags = Array.from(new Set([...subscriber.tags, ...tags]))
      await upsertSubscriber({
        name: subscriber.name,
        email: subscriber.email,
        org: subscriber.org,
        role: subscriber.role,
        size: subscriber.size,
        phone: subscriber.phone,
        tags: mergedTags,
        source: subscriber.source,
        status: subscriber.status,
        optInAt: subscriber.optInAt,
      })
      updated++
    }

    return NextResponse.json({ updated })
  }

  const sb = createSupabaseAdminClient()

  // 각 구독자의 현재 태그를 가져와서 병합
  const { data: rows, error: fetchError } = await sb
    .from("newsletter_subscribers")
    .select("id, tags")
    .in("id", ids)

  if (fetchError) {
    return NextResponse.json({ error: fetchError.message }, { status: 500 })
  }

  let updated = 0

  for (const row of rows ?? []) {
    const existingTags: string[] = Array.isArray(row.tags) ? row.tags : []
    const mergedTags = Array.from(new Set([...existingTags, ...tags]))

    const { error: updateError } = await sb
      .from("newsletter_subscribers")
      .update({ tags: mergedTags })
      .eq("id", row.id)

    if (!updateError) updated++
  }

  return NextResponse.json({ updated })
}

// ─── DELETE: 벌크 삭제 ───────────────────────────────────────
// body: { ids: string[] }
// → ids에 해당하는 구독자 전체 삭제
export async function DELETE(req: NextRequest) {
  const authError = await verifyAdmin(req)
  if (authError) return authError

  let body: { ids: string[] }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "JSON 파싱 실패" }, { status: 400 })
  }

  const { ids } = body

  if (!Array.isArray(ids) || ids.length === 0) {
    return NextResponse.json({ error: "ids 배열이 필요합니다" }, { status: 400 })
  }

  if (!USE_SUPABASE) {
    // JSON 폴백 모드: 하나씩 삭제
    const { deleteSubscriber } = await import("@/lib/repositories/marketing")
    let deleted = 0
    for (const id of ids) {
      const ok = await deleteSubscriber(id)
      if (ok) deleted++
    }
    return NextResponse.json({ deleted })
  }

  const sb = createSupabaseAdminClient()
  const { error, count } = await sb
    .from("newsletter_subscribers")
    .delete({ count: "exact" })
    .in("id", ids)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ deleted: count ?? ids.length })
}
