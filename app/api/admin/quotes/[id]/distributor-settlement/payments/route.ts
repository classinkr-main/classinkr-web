import { NextRequest, NextResponse } from "next/server"

import { CRM_STAFF_ADMIN_API_ROLES, requireVerifiedAdminContext } from "@/lib/admin-auth"
import { logAdminAudit } from "@/lib/auth/audit"
import { validateDistributorPaymentInput, type DistributorSettlementRecord } from "@/lib/distributor-settlements"
import {
  addDistributorPayment,
  deleteDistributorPayment,
  getDistributorSettlementByQuote,
} from "@/lib/repositories/distributor-settlements"
import {
  proposeLedgerDraftForDistributorPayment,
  withdrawLedgerDraftForDistributorPayment,
} from "@/lib/admin/handoff/distributor-payment-to-ledger-draft"
import { distributorActor, distributorWriteError, readJsonObject } from "@/lib/server/distributor-settlement-api"
import { loadQuoteContext } from "@/lib/server/distributor-settlement-issue"

// 총판 입금 기록(2026-10-23) — 발행된 총판 정산에만 붙는다. 기록 후 paid_amount·상태(일부/완료)를 다시 계산한다.
// C1 매출은 총판 입금 확인 시점이므로, 입금 1건마다 매출 원장 입력 큐에 초안을 올린다(검수·적용은 사람).
//
// POST   {amount, paidOn: YYYY-MM-DD, memo?} — 201 {settlement, payments, payment, ledger}
// DELETE ?paymentId= — 잘못 넣은 입금 삭제. 아직 draft 인 매출 초안도 함께 지운다. 200 {settlement, payments, ledger}

type RouteParams = { params: Promise<{ id: string }> }

async function loadIssuedSettlement(
  quoteDocumentId: string
): Promise<{ error: NextResponse; settlement: null } | { error: null; settlement: DistributorSettlementRecord }> {
  const read = await getDistributorSettlementByQuote(quoteDocumentId)
  if (!read.available) {
    return { error: NextResponse.json({ error: read.warning }, { status: 503 }), settlement: null }
  }
  const settlement = read.value
  if (!settlement || !["issued", "partial", "paid"].includes(settlement.status)) {
    return {
      error: NextResponse.json({ error: "발행된 총판 견적서에만 입금을 기록할 수 있습니다." }, { status: 409 }),
      settlement: null,
    }
  }
  return { error: null, settlement }
}

export async function POST(req: NextRequest, { params }: RouteParams) {
  const admin = await requireVerifiedAdminContext(req, CRM_STAFF_ADMIN_API_ROLES)
  if (admin instanceof NextResponse) return admin
  const { id } = await params

  const validated = validateDistributorPaymentInput(await readJsonObject(req))
  if (!validated.ok) return NextResponse.json({ error: validated.error }, { status: 400 })

  try {
    const loaded = await loadIssuedSettlement(id)
    if (loaded.error) return loaded.error
    const result = await addDistributorPayment({
      settlement: loaded.settlement,
      ...validated.value,
      actor: distributorActor(admin),
    })
    const context = await loadQuoteContext(id).catch(() => null)
    const ledger = await proposeLedgerDraftForDistributorPayment({
      settlement: result.settlement,
      payment: result.payment,
      customerName: context?.customerName ?? null,
      quoteNumber: context?.document.quote_number ?? null,
    })
    if (ledger.status === "error") console.error("[POST distributor-settlement/payments] 매출 초안 실패:", ledger.error)
    await logAdminAudit({
      admin,
      action: "quotes.distributor_settlement.payment_add",
      targetType: "distributor_settlement",
      targetId: loaded.settlement.id,
      payload: {
        quoteDocumentId: id,
        amount: validated.value.amount,
        paidOn: validated.value.paidOn,
        ledgerDraft: ledger.status,
      },
    })
    return NextResponse.json({ ...result, ledger }, { status: 201 })
  } catch (error) {
    return distributorWriteError(error, "POST distributor-settlement/payments", "총판 입금을 기록하지 못했습니다.")
  }
}

export async function DELETE(req: NextRequest, { params }: RouteParams) {
  const admin = await requireVerifiedAdminContext(req, CRM_STAFF_ADMIN_API_ROLES)
  if (admin instanceof NextResponse) return admin
  const { id } = await params
  const paymentId = req.nextUrl.searchParams.get("paymentId")?.trim()
  if (!paymentId) return NextResponse.json({ error: "paymentId 가 필요합니다." }, { status: 400 })

  try {
    const loaded = await loadIssuedSettlement(id)
    if (loaded.error) return loaded.error
    const result = await deleteDistributorPayment({
      settlement: loaded.settlement,
      paymentId,
      actor: distributorActor(admin),
    })
    if (!result) return NextResponse.json({ error: "입금 기록을 찾을 수 없습니다." }, { status: 404 })
    const ledger = await withdrawLedgerDraftForDistributorPayment(paymentId)
    await logAdminAudit({
      admin,
      action: "quotes.distributor_settlement.payment_delete",
      targetType: "distributor_settlement",
      targetId: loaded.settlement.id,
      payload: { quoteDocumentId: id, paymentId, ledgerDraft: ledger.status },
    })
    return NextResponse.json({ ...result, ledger })
  } catch (error) {
    return distributorWriteError(error, "DELETE distributor-settlement/payments", "총판 입금 기록을 지우지 못했습니다.")
  }
}
