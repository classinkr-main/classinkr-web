import { NextRequest, NextResponse } from "next/server";

import {
  requirePortalContext,
  getPartnerAccountFilter,
  isErrorResponse,
} from "@/lib/partner-portal/portal-context";
import {
  resolvePartnerAccountId,
  getActorInfo,
} from "@/lib/partner-portal/portal-authorize";
import {
  listCustomerListItems,
  listAllCustomerListItems,
  createCustomer,
} from "@/lib/partner-portal/repositories/customers";
import { logActivity } from "@/lib/partner-portal/repositories/activity";

export async function GET(req: NextRequest) {
  const result = await requirePortalContext(req);
  if (isErrorResponse(result)) return result;
  const ctx = result;

  try {
    const filter = getPartnerAccountFilter(ctx);
    const customers = filter
      ? await listCustomerListItems(filter)
      : await listAllCustomerListItems();

    return NextResponse.json({ customers });
  } catch (err) {
    console.error("[portal/customers] GET error:", err);
    return NextResponse.json(
      { error: "고객 목록 조회 실패" },
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
    const partnerAccountId = resolvePartnerAccountId(
      ctx,
      body.partner_account_id
    );

    if (!partnerAccountId) {
      return NextResponse.json(
        { error: "partner_account_id 필수" },
        { status: 400 }
      );
    }

    const customer = await createCustomer({
      partner_account_id: partnerAccountId,
      name: body.name,
      contact_name: body.contact_name ?? null,
      email: body.email ?? null,
      phone: body.phone ?? null,
      address: body.address ?? null,
      business_number: body.business_number ?? null,
      campus_name: body.campus_name ?? null,
      region_label: body.region_label ?? null,
      notes: body.notes ?? null,
      created_by: ctx.userId ?? null,
    });

    const actor = getActorInfo(ctx);
    await logActivity({
      partner_account_id: partnerAccountId,
      customer_id: customer.id,
      deal_id: null,
      ...actor,
      action_type: "create",
      target_type: "customer",
      target_id: customer.id,
      summary: `고객 "${customer.name}" 생성`,
      before_json: null,
      after_json: customer as unknown as Record<string, unknown>,
    });

    return NextResponse.json({ customer }, { status: 201 });
  } catch (err) {
    console.error("[portal/customers] POST error:", err);
    return NextResponse.json(
      { error: "고객 생성 실패" },
      { status: 500 }
    );
  }
}
