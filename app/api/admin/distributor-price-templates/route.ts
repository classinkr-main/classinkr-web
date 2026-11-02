import { NextRequest, NextResponse } from "next/server"

import { CRM_STAFF_ADMIN_API_ROLES, requireVerifiedAdminContext } from "@/lib/admin-auth"
import { logAdminAudit } from "@/lib/auth/audit"
import { validateDistributorPriceTemplateInput } from "@/lib/distributor-settlements"
import {
  createDistributorPriceTemplate,
  listDistributorPriceTemplates,
} from "@/lib/repositories/distributor-settlements"
import { distributorActor, distributorWriteError, readJsonObject } from "@/lib/server/distributor-settlement-api"

// 원가 템플릿(2026-10-23) — 품목 코드 × 최소 대수 구간 → 원가.
//
// GET  — { available, warning, templates[] }. 표 미적용이면 200 available:false.
// POST {name, rules: [{itemCode, itemName?, minQuantity, unitPrice}], notes?} — 201 {template}. 400 검증 · 503 미적용.

export async function GET(req: NextRequest) {
  const admin = await requireVerifiedAdminContext(req, CRM_STAFF_ADMIN_API_ROLES)
  if (admin instanceof NextResponse) return admin

  try {
    const read = await listDistributorPriceTemplates()
    return NextResponse.json(
      { available: read.available, warning: read.warning, templates: read.value ?? [] },
      { headers: { "Cache-Control": "no-store" } }
    )
  } catch (error) {
    console.error("[GET /api/admin/distributor-price-templates]", error instanceof Error ? error.message : error)
    return NextResponse.json({ error: "원가 템플릿을 불러오지 못했습니다." }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  const admin = await requireVerifiedAdminContext(req, CRM_STAFF_ADMIN_API_ROLES)
  if (admin instanceof NextResponse) return admin

  const validated = validateDistributorPriceTemplateInput(await readJsonObject(req))
  if (!validated.ok) return NextResponse.json({ error: validated.error }, { status: 400 })

  try {
    const template = await createDistributorPriceTemplate(validated.value, distributorActor(admin))
    await logAdminAudit({
      admin,
      action: "quotes.distributor_price_template.create",
      targetType: "distributor_price_template",
      targetId: template.id,
      payload: { name: template.name, rules: template.rules.length },
    })
    return NextResponse.json({ template }, { status: 201 })
  } catch (error) {
    return distributorWriteError(error, "POST /api/admin/distributor-price-templates", "원가 템플릿을 저장하지 못했습니다.")
  }
}
