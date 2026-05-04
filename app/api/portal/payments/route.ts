import { NextRequest, NextResponse } from "next/server";

import {
  requirePortalContext,
  isErrorResponse,
} from "@/lib/partner-portal/portal-context";
import {
  resolvePartnerAccountId,
  getActorInfo,
} from "@/lib/partner-portal/portal-authorize";
import { createPayment } from "@/lib/partner-portal/repositories/payments";
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

    const payment = await createPayment({
      partner_account_id: partnerAccountId,
      customer_id: body.customer_id,
      deal_id: body.deal_id,
      amount: body.amount ?? 0,
      paid_at: body.paid_at ?? new Date().toISOString(),
      payment_method: body.payment_method ?? "bank_transfer",
      memo: body.memo ?? null,
      created_by: ctx.userId ?? null,
    });

    const actor = getActorInfo(ctx);
    await logActivity({
      partner_account_id: partnerAccountId,
      customer_id: body.customer_id,
      deal_id: body.deal_id,
      ...actor,
      action_type: "create",
      target_type: "payment",
      target_id: payment.id,
      summary: `결제 ${payment.amount.toLocaleString()}원 등록`,
      before_json: null,
      after_json: payment as unknown as Record<string, unknown>,
    });

    return NextResponse.json({ payment }, { status: 201 });
  } catch (err) {
    console.error("[portal/payments] POST error:", err);
    return NextResponse.json({ error: "결제 등록 실패" }, { status: 500 });
  }
}
