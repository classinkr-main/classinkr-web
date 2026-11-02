import { NextRequest, NextResponse } from "next/server"

import { requireVerifiedAdminContext, STAFF_ADMIN_API_ROLES } from "@/lib/admin-auth"
import { logAdminAudit } from "@/lib/auth/audit"
import { getQuoteDocument, setQuoteDeleted } from "@/lib/portal/repositories/quote-documents"

type RouteContext = { params: Promise<{ id: string }> }
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

async function changeDeleted(req: NextRequest, context: RouteContext, deleted: boolean) {
  const admin = await requireVerifiedAdminContext(req, STAFF_ADMIN_API_ROLES)
  if (admin instanceof NextResponse) return admin
  const { id } = await context.params
  if (!UUID.test(id)) return NextResponse.json({ error: "견적서를 찾을 수 없습니다." }, { status: 404 })

  try {
    const before = await getQuoteDocument(id, true)
    if (!before) return NextResponse.json({ error: "견적서를 찾을 수 없습니다." }, { status: 404 })
    const updated = await setQuoteDeleted(id, deleted)
    if (!updated) return NextResponse.json({ error: deleted ? "이미 삭제된 견적서입니다." : "삭제된 견적서가 아닙니다." }, { status: 409 })
    await logAdminAudit({ admin, action: deleted ? "quotes.delete" : "quotes.restore", targetType: "quote_document", targetId: id,
      payload: { quoteNumber: before.quote_number, previousStatus: before.status } })
    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error("[admin/quotes] 삭제 상태 변경 실패", error)
    if (typeof error === "object" && error !== null && "code" in error && error.code === "42703") {
      return NextResponse.json({ error: "견적 삭제함 DB 마이그레이션이 필요합니다." }, { status: 503 })
    }
    return NextResponse.json({ error: "견적서 상태 변경에 실패했습니다." }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest, context: RouteContext) {
  return changeDeleted(req, context, true)
}

export async function POST(req: NextRequest, context: RouteContext) {
  return changeDeleted(req, context, false)
}
