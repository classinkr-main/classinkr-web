import { NextRequest, NextResponse } from "next/server"

import { CRM_STAFF_ADMIN_API_ROLES, requireVerifiedAdminContext } from "@/lib/admin-auth"
import { logAdminAudit } from "@/lib/auth/audit"
import { teamQuoteTemplateView, validateQuoteTemplateInput } from "@/lib/quote-team-templates"
import { createQuoteTeamTemplate, listQuoteTemplatesFor } from "@/lib/repositories/quote-team-templates"

import { quoteTemplateActor, quoteTemplateViewer, quoteTemplateWriteError, readJsonObject } from "./template-response"

// 견적 템플릿(2026-10-21) — 기본 템플릿(코드) + 팀 템플릿(quote_team_templates).
//
// GET  — 역할 CRM_STAFF. { available, warning, base[], team[] } — 견적 작성기·설정 화면 공용.
//        팀 템플릿은 '팀 전체' + 내 '나만'만 싣는다. 표 미적용이면 200 available:false + 기본 템플릿만.
// POST {name, productLine, sourceTemplateId?, items, defaults?, scope?, showInMenu?} — 201 {template}.
//      400 검증(공급자 섞임 포함) · 503 표 미적용.

export async function GET(req: NextRequest) {
  const admin = await requireVerifiedAdminContext(req, CRM_STAFF_ADMIN_API_ROLES)
  if (admin instanceof NextResponse) return admin

  try {
    return NextResponse.json(await listQuoteTemplatesFor(quoteTemplateViewer(admin)), {
      headers: { "Cache-Control": "no-store" },
    })
  } catch (error) {
    console.error("[GET /api/admin/quote-templates]", error instanceof Error ? error.message : error)
    return NextResponse.json({ error: "견적 템플릿을 불러오지 못했습니다." }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  const admin = await requireVerifiedAdminContext(req, CRM_STAFF_ADMIN_API_ROLES)
  if (admin instanceof NextResponse) return admin

  const body = await readJsonObject(req)
  if (!body) return NextResponse.json({ error: "요청 본문이 올바르지 않습니다." }, { status: 400 })

  const validated = validateQuoteTemplateInput(body)
  if (!validated.ok) return NextResponse.json({ error: validated.error }, { status: 400 })
  // 사용자 id 가 없는 세션(레거시 비밀번호 로그인)에서 '나만'으로 만들면 아무에게도 보이지 않는다.
  if (validated.value.scope === "mine" && !admin.userId) {
    return NextResponse.json(
      { error: "로그인 사용자 정보가 없어 '나만' 템플릿을 만들 수 없습니다. 팀 전체로 저장해 주세요." },
      { status: 400 }
    )
  }

  try {
    const record = await createQuoteTeamTemplate({
      input: validated.value,
      ownerUserId: admin.userId ?? null,
      ownerName: admin.name?.trim() || null,
      actor: quoteTemplateActor(admin),
    })
    await logAdminAudit({
      admin,
      action: "quotes.templates.create",
      targetType: "quote_team_template",
      targetId: record.id,
      payload: { name: record.name, productLine: record.productLine, scope: record.scope },
    })
    return NextResponse.json({ template: teamQuoteTemplateView(record, true) }, { status: 201 })
  } catch (error) {
    return quoteTemplateWriteError(error, "POST /api/admin/quote-templates")
  }
}
