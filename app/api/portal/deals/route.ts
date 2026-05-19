import { NextRequest, NextResponse } from "next/server";

import {
  requirePortalContext,
  getPartnerAccountFilter,
  isErrorResponse,
} from "@/lib/portal/portal-context";
import {
  resolvePartnerAccountId,
  getActorInfo,
} from "@/lib/portal/portal-authorize";
import { listDealListItems, createDeal } from "@/lib/portal/repositories/deals";
import { getCustomer } from "@/lib/portal/repositories/customers";
import { logActivity } from "@/lib/portal/repositories/activity";
import type { DealStage, DealStatus } from "@/lib/portal/types";

export async function GET(req: NextRequest) {
  const result = await requirePortalContext(req);
  if (isErrorResponse(result)) return result;
  const ctx = result;

  const { searchParams } = new URL(req.url);
  const customerId = searchParams.get("customer_id") ?? undefined;
  const stage = (searchParams.get("stage") as DealStage) ?? undefined;
  const status = (searchParams.get("status") as DealStatus) ?? undefined;

  try {
    const partnerAccountId = getPartnerAccountFilter(ctx) ?? undefined;
    const deals = await listDealListItems({
      partnerAccountId,
      customerId,
      stage,
      status,
    });

    return NextResponse.json({ deals });
  } catch (err) {
    console.error("[portal/deals] GET error:", err);
    return NextResponse.json(
      { error: "딜 목록 조회 실패" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  const result = await requirePortalContext(req);
  if (isErrorResponse(result)) return result;
  const ctx = result;

  try {
    const body = await req.json();
    const partnerAccountId = resolvePartnerAccountId(ctx, body.partner_account_id);

    if (!partnerAccountId) {
      return NextResponse.json({ error: "partner_account_id 필수" }, { status: 400 });
    }
    if (!body.customer_id) {
      return NextResponse.json({ error: "customer_id 필수" }, { status: 400 });
    }

    const customer = await getCustomer(body.customer_id);
    if (!customer) {
      return NextResponse.json({ error: "customer not found" }, { status: 404 });
    }
    if (customer.partner_account_id !== partnerAccountId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const deal = await createDeal({
      partner_account_id: partnerAccountId,
      customer_id: body.customer_id,
      title: body.title ?? "새 딜",
      status: body.status ?? "active",
      current_stage: body.current_stage ?? "contact",
      expected_amount: body.expected_amount ?? 0,
      contracted_amount: body.contracted_amount ?? 0,
      installed_amount: body.installed_amount ?? 0,
      paid_amount: body.paid_amount ?? 0,
      outstanding_amount: body.outstanding_amount ?? 0,
      payment_status: body.payment_status ?? "unpaid",
      starts_at: body.starts_at ?? null,
      closed_at: null,
      notes: body.notes ?? null,
      created_by: ctx.userId ?? null,
    });

    const actor = getActorInfo(ctx);
    await logActivity({
      partner_account_id: partnerAccountId,
      customer_id: body.customer_id,
      deal_id: deal.id,
      ...actor,
      action_type: "create",
      target_type: "deal",
      target_id: deal.id,
      summary: `딜 "${deal.title}" 생성`,
      before_json: null,
      after_json: deal as unknown as Record<string, unknown>,
    });

    return NextResponse.json({ deal }, { status: 201 });
  } catch (err) {
    console.error("[portal/deals] POST error:", err);
    return NextResponse.json({ error: "딜 생성 실패" }, { status: 500 });
  }
}
