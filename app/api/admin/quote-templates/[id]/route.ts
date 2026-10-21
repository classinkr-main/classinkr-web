import { NextRequest, NextResponse } from "next/server"

import { CRM_STAFF_ADMIN_API_ROLES, requireVerifiedAdminContext } from "@/lib/admin-auth"
import { logAdminAudit } from "@/lib/auth/audit"
import {
  canEditQuoteTemplate,
  isQuoteTemplateVisibleTo,
  teamQuoteTemplateView,
  validateQuoteTemplateInput,
} from "@/lib/quote-team-templates"
import {
  archiveQuoteTeamTemplate,
  getQuoteTeamTemplate,
  updateQuoteTeamTemplate,
} from "@/lib/repositories/quote-team-templates"

import { quoteTemplateActor, quoteTemplateViewer, quoteTemplateWriteError, readJsonObject } from "../template-response"

// 견적 팀 템플릿 수정·보관(2026-10-21).
//
// PATCH  {name?, productLine?, sourceTemplateId?, items?, defaults?, scope?, showInMenu?} — 보낸 키만 바꾼다.
//        소유자, 또는 팀 템플릿이면 관리자(STAFF_ADMIN). 200 {template}.
// DELETE — 보관(archived_at, 물리 삭제 없음). 같은 권한. 200 {ok:true}.
// 404 = 없음·보관됨·남의 '나만' · 403 = 보이지만 수정 권한 없음 · 503 = 표 미적용.

type RouteContext = { params: Promise<{ id: string }> }

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const NOT_FOUND = { error: "템플릿을 찾을 수 없습니다." }
const FORBIDDEN = { error: "이 템플릿을 고칠 권한이 없습니다. 복제해서 내 템플릿으로 만드세요." }

async function loadEditable(req: NextRequest, { params }: RouteContext) {
  const admin = await requireVerifiedAdminContext(req, CRM_STAFF_ADMIN_API_ROLES)
  if (admin instanceof NextResponse) return admin
  const { id } = await params
  if (!UUID_RE.test(id)) return NextResponse.json(NOT_FOUND, { status: 404 })

  const viewer = quoteTemplateViewer(admin)
  const record = await getQuoteTeamTemplate(id)
  if (!record || record.archivedAt || !isQuoteTemplateVisibleTo(record, viewer)) {
    return NextResponse.json(NOT_FOUND, { status: 404 })
  }
  if (!canEditQuoteTemplate(record, viewer)) return NextResponse.json(FORBIDDEN, { status: 403 })
  return { admin, record }
}

export async function PATCH(req: NextRequest, context: RouteContext) {
  try {
    const loaded = await loadEditable(req, context)
    if (loaded instanceof NextResponse) return loaded
    const { admin, record } = loaded

    const body = await readJsonObject(req)
    if (!body) return NextResponse.json({ error: "요청 본문이 올바르지 않습니다." }, { status: 400 })
    const validated = validateQuoteTemplateInput(body, record)
    if (!validated.ok) return NextResponse.json({ error: validated.error }, { status: 400 })
    if (validated.value.scope === "mine" && !record.ownerUserId) {
      return NextResponse.json({ error: "소유자 정보가 없는 템플릿은 '나만'으로 바꿀 수 없습니다." }, { status: 400 })
    }

    const updated = await updateQuoteTeamTemplate(record.id, validated.value, quoteTemplateActor(admin))
    if (!updated) return NextResponse.json(NOT_FOUND, { status: 404 })
    await logAdminAudit({
      admin,
      action: "quotes.templates.update",
      targetType: "quote_team_template",
      targetId: updated.id,
      payload: { name: updated.name, scope: updated.scope, showInMenu: updated.showInMenu },
    })
    return NextResponse.json({ template: teamQuoteTemplateView(updated, true) })
  } catch (error) {
    return quoteTemplateWriteError(error, "PATCH /api/admin/quote-templates/[id]")
  }
}

export async function DELETE(req: NextRequest, context: RouteContext) {
  try {
    const loaded = await loadEditable(req, context)
    if (loaded instanceof NextResponse) return loaded
    const { admin, record } = loaded

    const archived = await archiveQuoteTeamTemplate(record.id, quoteTemplateActor(admin))
    if (!archived) return NextResponse.json(NOT_FOUND, { status: 404 })
    await logAdminAudit({
      admin,
      action: "quotes.templates.archive",
      targetType: "quote_team_template",
      targetId: record.id,
      payload: { name: record.name },
    })
    return NextResponse.json({ ok: true })
  } catch (error) {
    return quoteTemplateWriteError(error, "DELETE /api/admin/quote-templates/[id]")
  }
}
