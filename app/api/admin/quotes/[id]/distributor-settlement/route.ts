import { NextRequest, NextResponse } from "next/server"

import { CRM_STAFF_ADMIN_API_ROLES, requireVerifiedAdminContext } from "@/lib/admin-auth"
import { logAdminAudit } from "@/lib/auth/audit"
import { computeDistributorTotals, validateDistributorSettlementInput } from "@/lib/distributor-settlements"
import {
  cancelDistributorSettlement,
  getDistributorSettlementByQuote,
  saveDistributorSettlementDraft,
} from "@/lib/repositories/distributor-settlements"
import {
  distributorActor,
  distributorWriteError,
  loadDistributorSettlementPayload,
  readJsonObject,
} from "@/lib/server/distributor-settlement-api"
import { loadQuoteContext } from "@/lib/server/distributor-settlement-issue"

// 견적별 총판 정산(2026-10-23).
//
// GET    — { available, warning, quote, settlement, payments, draftLines, versionChanged, defaults, templates, shareUrl }.
//          표 미적용이면 200 available:false(고객 견적은 그대로).
// PUT    {distributorName, distributorEmail?, issueTrigger, autoEmail, priceTemplateId?, lines, vatIncluded, dueDate?, notes?}
//          — 발행 전 건만 저장(200 {settlement}). 발행된 건은 409, 표 미적용 503.
// DELETE — 취소(공유 링크 차단). 입금이 있는 건은 409.

type RouteParams = { params: Promise<{ id: string }> }

export async function GET(req: NextRequest, { params }: RouteParams) {
  const admin = await requireVerifiedAdminContext(req, CRM_STAFF_ADMIN_API_ROLES)
  if (admin instanceof NextResponse) return admin
  const { id } = await params

  try {
    const payload = await loadDistributorSettlementPayload(id, req.nextUrl.origin)
    if (!payload) return NextResponse.json({ error: "견적서를 찾을 수 없습니다." }, { status: 404 })
    return NextResponse.json(payload, { headers: { "Cache-Control": "no-store" } })
  } catch (error) {
    console.error("[GET distributor-settlement]", error instanceof Error ? error.message : error)
    return NextResponse.json({ error: "총판 정산을 불러오지 못했습니다." }, { status: 500 })
  }
}

export async function PUT(req: NextRequest, { params }: RouteParams) {
  const admin = await requireVerifiedAdminContext(req, CRM_STAFF_ADMIN_API_ROLES)
  if (admin instanceof NextResponse) return admin
  const { id } = await params

  const body = await readJsonObject(req)
  if (!body) return NextResponse.json({ error: "요청 본문이 올바르지 않습니다." }, { status: 400 })
  const validated = validateDistributorSettlementInput(body)
  if (!validated.ok) return NextResponse.json({ error: validated.error }, { status: 400 })

  try {
    const context = await loadQuoteContext(id)
    if (!context) return NextResponse.json({ error: "견적서를 찾을 수 없습니다." }, { status: 404 })

    const totals = computeDistributorTotals(validated.value.lines, validated.value.vatIncluded)
    const settlement = await saveDistributorSettlementDraft({
      quoteDocumentId: id,
      dealId: context.document.deal_id,
      sourceVersionId: context.version.id,
      customerTotalAmount: context.version.total_amount,
      input: validated.value,
      totals,
      actor: distributorActor(admin),
    })
    if (!settlement) {
      return NextResponse.json(
        { error: "이미 발행된 총판 견적서는 고칠 수 없습니다. 취소 후 다시 만들어 주세요." },
        { status: 409 }
      )
    }

    await logAdminAudit({
      admin,
      action: "quotes.distributor_settlement.save",
      targetType: "distributor_settlement",
      targetId: settlement.id,
      payload: {
        quoteDocumentId: id,
        distributorName: settlement.distributorName,
        issueTrigger: settlement.issueTrigger,
        totalAmount: settlement.totalAmount,
      },
    })
    return NextResponse.json({ settlement })
  } catch (error) {
    return distributorWriteError(error, "PUT distributor-settlement", "총판 정산을 저장하지 못했습니다.")
  }
}

export async function DELETE(req: NextRequest, { params }: RouteParams) {
  const admin = await requireVerifiedAdminContext(req, CRM_STAFF_ADMIN_API_ROLES)
  if (admin instanceof NextResponse) return admin
  const { id } = await params

  try {
    const read = await getDistributorSettlementByQuote(id)
    if (!read.available) return NextResponse.json({ error: read.warning }, { status: 503 })
    if (!read.value) return NextResponse.json({ error: "총판 정산이 없습니다." }, { status: 404 })

    const cancelled = await cancelDistributorSettlement(read.value.id, distributorActor(admin))
    if (!cancelled) {
      return NextResponse.json(
        { error: "입금 기록이 있거나 이미 취소된 총판 정산은 취소할 수 없습니다." },
        { status: 409 }
      )
    }

    await logAdminAudit({
      admin,
      action: "quotes.distributor_settlement.cancel",
      targetType: "distributor_settlement",
      targetId: cancelled.id,
      payload: { quoteDocumentId: id, previousStatus: read.value.status },
    })
    return NextResponse.json({ settlement: cancelled })
  } catch (error) {
    return distributorWriteError(error, "DELETE distributor-settlement", "총판 정산을 취소하지 못했습니다.")
  }
}
