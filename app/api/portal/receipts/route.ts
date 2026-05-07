import { NextRequest, NextResponse } from "next/server";

import {
  requirePortalContext,
  isErrorResponse,
} from "@/lib/partner-portal/portal-context";
import {
  resolvePartnerAccountId,
  getActorInfo,
} from "@/lib/partner-portal/portal-authorize";
import { createReceipt, getPayment } from "@/lib/partner-portal/repositories/payments";
import { getDeal } from "@/lib/partner-portal/repositories/deals";
import { logActivity } from "@/lib/partner-portal/repositories/activity";

export async function POST(req: NextRequest) {
  const result = await requirePortalContext(req);
  if (isErrorResponse(result)) return result;
  const ctx = result;

  try {
    const body = await req.json();
    const partnerAccountId = resolvePartnerAccountId(ctx, body.partner_account_id);

    if (!partnerAccountId || !body.customer_id || !body.deal_id) {
      return NextResponse.json(
        { error: "partner_account_id, customer_id, deal_id 필수" },
        { status: 400 }
      );
    }

    const deal = await getDeal(body.deal_id);
    if (!deal) {
      return NextResponse.json({ error: "deal not found" }, { status: 404 });
    }
    if (
      deal.partner_account_id !== partnerAccountId ||
      deal.customer_id !== body.customer_id
    ) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    if (body.payment_id) {
      const payment = await getPayment(body.payment_id);
      if (
        !payment ||
        payment.partner_account_id !== partnerAccountId ||
        payment.customer_id !== body.customer_id ||
        payment.deal_id !== body.deal_id
      ) {
        return NextResponse.json({ error: "payment not found" }, { status: 404 });
      }
    }

    const receipt = await createReceipt({
      partner_account_id: partnerAccountId,
      customer_id: body.customer_id,
      deal_id: body.deal_id,
      payment_id: body.payment_id ?? null,
      total_amount: body.total_amount ?? 0,
      pdf_url: body.pdf_url ?? null,
      notes: body.notes ?? null,
      created_by: ctx.userId ?? null,
    });

    const actor = getActorInfo(ctx);
    await logActivity({
      partner_account_id: partnerAccountId,
      customer_id: body.customer_id,
      deal_id: body.deal_id,
      ...actor,
      action_type: "create",
      target_type: "receipt",
      target_id: receipt.id,
      summary: `영수증 ${receipt.receipt_number} 발행`,
      before_json: null,
      after_json: receipt as unknown as Record<string, unknown>,
    });

    return NextResponse.json({ receipt }, { status: 201 });
  } catch (err) {
    console.error("[portal/receipts] POST error:", err);
    return NextResponse.json({ error: "영수증 발행 실패" }, { status: 500 });
  }
}
