import { NextRequest, NextResponse } from "next/server"

import { CRM_STAFF_ADMIN_API_ROLES, requireVerifiedAdminContext } from "@/lib/admin-auth"
import { logAdminAudit } from "@/lib/auth/audit"
import { validateDistributorPriceTemplateInput } from "@/lib/distributor-settlements"
import {
  archiveDistributorPriceTemplate,
  updateDistributorPriceTemplate,
} from "@/lib/repositories/distributor-settlements"
import { distributorActor, distributorWriteError, readJsonObject } from "@/lib/server/distributor-settlement-api"

// 원가 템플릿 1건 — PUT 수정(200 {template}) · DELETE 보관(200 {ok}). 없거나 보관됐으면 404.
// 이미 발행된 총판 견적서는 발행 시점 금액을 따로 저장하므로 템플릿을 바꿔도 영향받지 않는다.

type RouteParams = { params: Promise<{ id: string }> }

export async function PUT(req: NextRequest, { params }: RouteParams) {
  const admin = await requireVerifiedAdminContext(req, CRM_STAFF_ADMIN_API_ROLES)
  if (admin instanceof NextResponse) return admin
  const { id } = await params

  const validated = validateDistributorPriceTemplateInput(await readJsonObject(req))
  if (!validated.ok) return NextResponse.json({ error: validated.error }, { status: 400 })

  try {
    const template = await updateDistributorPriceTemplate(id, validated.value, distributorActor(admin))
    if (!template) return NextResponse.json({ error: "템플릿을 찾을 수 없습니다." }, { status: 404 })
    await logAdminAudit({
      admin,
      action: "quotes.distributor_price_template.update",
      targetType: "distributor_price_template",
      targetId: id,
      payload: { name: template.name, rules: template.rules.length },
    })
    return NextResponse.json({ template })
  } catch (error) {
    return distributorWriteError(error, "PUT /api/admin/distributor-price-templates/[id]", "원가 템플릿을 저장하지 못했습니다.")
  }
}

export async function DELETE(req: NextRequest, { params }: RouteParams) {
  const admin = await requireVerifiedAdminContext(req, CRM_STAFF_ADMIN_API_ROLES)
  if (admin instanceof NextResponse) return admin
  const { id } = await params

  try {
    const archived = await archiveDistributorPriceTemplate(id, distributorActor(admin))
    if (!archived) return NextResponse.json({ error: "템플릿을 찾을 수 없습니다." }, { status: 404 })
    await logAdminAudit({
      admin,
      action: "quotes.distributor_price_template.archive",
      targetType: "distributor_price_template",
      targetId: id,
    })
    return NextResponse.json({ ok: true })
  } catch (error) {
    return distributorWriteError(error, "DELETE /api/admin/distributor-price-templates/[id]", "원가 템플릿을 보관하지 못했습니다.")
  }
}
