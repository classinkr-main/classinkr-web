import { NextRequest, NextResponse } from "next/server"

import { CRM_STAFF_ADMIN_API_ROLES, requireVerifiedAdminContext } from "@/lib/admin-auth"
import { logAdminAudit } from "@/lib/auth/audit"
import {
  computeDistributorTotals,
  getDistributorReviseBlocker,
  validateDistributorSettlementInput,
} from "@/lib/distributor-settlements"
import {
  cancelDistributorSettlement,
  getDistributorSettlementByQuote,
  reviseIssuedDistributorSettlement,
  saveDistributorSettlementDraft,
} from "@/lib/repositories/distributor-settlements"
import {
  distributorActor,
  distributorWriteError,
  loadDistributorSettlementPayload,
  readJsonObject,
} from "@/lib/server/distributor-settlement-api"
import { loadQuoteContext, notifyDistributorSettlementRevised } from "@/lib/server/distributor-settlement-issue"

// 견적별 총판 정산(2026-10-23).
//
// GET    — { available, warning, quote, settlement, payments, draftLines, versionChanged, defaults, templates, shareUrl }.
//          표 미적용이면 200 available:false(고객 견적은 그대로).
// PUT    {distributorName, distributorEmail?, issueTrigger, autoEmail, priceTemplateId?, lines, vatIncluded, dueDate?, notes?}
//          — 발행 전 건은 저장(200 {settlement}). 발행된 C방식 건(입금 대기·일부 입금·입금 완료)은 금액 수정
//          (200 {settlement, revised: true}) — 방식·발행 시점은 그대로 두고, 총판 확인을 해제하고, 자동 메일이면
//          수정 메일을 보낸다. 422 수정 불가(원가 빈칸·0원·받은 입금보다 작음), 409 취소·H방식 완료·동시 입금, 503 표 미적용.
//          lines 에는 고객 견적에 없는 직접 추가 줄(sourceLineNumber 0)을 넣을 수 있다.
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
    if (!settlement) return reviseIssued(req, admin, id, validated.value)

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

/** 발행된 총판 견적서의 금액 수정(PUT 의 발행 후 분기). */
async function reviseIssued(
  req: NextRequest,
  admin: Exclude<Awaited<ReturnType<typeof requireVerifiedAdminContext>>, NextResponse>,
  quoteDocumentId: string,
  input: Extract<ReturnType<typeof validateDistributorSettlementInput>, { ok: true }>["value"]
) {
  const read = await getDistributorSettlementByQuote(quoteDocumentId)
  if (!read.available) return NextResponse.json({ error: read.warning }, { status: 503 })
  const current = read.value
  if (!current || current.fulfillmentMode !== "C" || !["issued", "partial", "paid"].includes(current.status)) {
    return NextResponse.json(
      { error: "취소됐거나 설치 완료로 처리된 총판 정산은 고칠 수 없습니다." },
      { status: 409 }
    )
  }

  const blocker = getDistributorReviseBlocker({ ...input, paidAmount: current.paidAmount })
  if (blocker) return NextResponse.json({ error: blocker }, { status: 422 })

  const actor = distributorActor(admin)
  const revised = await reviseIssuedDistributorSettlement({
    settlement: current,
    input,
    totals: computeDistributorTotals(input.lines, input.vatIncluded),
    actor,
  })
  if (!revised) {
    return NextResponse.json(
      { error: "그사이 입금이 기록되는 등 총판 정산이 바뀌었습니다. 새로고침한 뒤 다시 수정해 주세요." },
      { status: 409 }
    )
  }

  const settlement = await notifyDistributorSettlementRevised({
    settlement: revised,
    previousTotalAmount: current.totalAmount,
    origin: req.nextUrl.origin,
    actor,
  }).catch((error) => {
    console.error("[PUT distributor-settlement] revise notify failed:", error instanceof Error ? error.message : error)
    return revised
  })

  await logAdminAudit({
    admin,
    action: "quotes.distributor_settlement.revise",
    targetType: "distributor_settlement",
    targetId: settlement.id,
    payload: {
      quoteDocumentId,
      previousTotalAmount: current.totalAmount,
      totalAmount: settlement.totalAmount,
      status: settlement.status,
      emailStatus: settlement.emailStatus,
    },
  })
  return NextResponse.json({ settlement, revised: true })
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
