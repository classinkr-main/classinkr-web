import { NextRequest, NextResponse } from "next/server";

import {
  requirePortalContext,
  isErrorResponse,
} from "@/lib/partner-portal/portal-context";
import {
  authorizeForAccount,
  getActorInfo,
} from "@/lib/partner-portal/portal-authorize";
import {
  getCustomer,
  getCustomerDetail,
  getCustomerDetailForPartnerAccount,
  updateCustomer,
  deleteCustomer,
} from "@/lib/partner-portal/repositories/customers";
import { logActivity } from "@/lib/partner-portal/repositories/activity";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ customerId: string }> }
) {
  const result = await requirePortalContext(req);
  if (isErrorResponse(result)) return result;
  const ctx = result;

  const { customerId } = await params;

  try {
    const detail =
      ctx.type === "admin"
        ? await getCustomerDetail(customerId)
        : await getCustomerDetailForPartnerAccount(
            customerId,
            ctx.partnerAccountId
          );

    if (!detail) {
      return NextResponse.json(
        { error: "고객을 찾을 수 없습니다" },
        { status: 404 }
      );
    }

    // partner인 경우 소속 확인
    if (ctx.type === "partner") {
      const forbidden = authorizeForAccount(
        ctx,
        detail.customer.partner_account_id
      );
      if (forbidden) return forbidden;
    }

    return NextResponse.json(detail);
  } catch (err) {
    console.error("[portal/customers/[id]] GET error:", err);
    return NextResponse.json(
      { error: "고객 상세 조회 실패" },
      { status: 500 }
    );
  }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ customerId: string }> }
) {
  const result = await requirePortalContext(req);
  if (isErrorResponse(result)) return result;
  const ctx = result;
  const { customerId } = await params;

  try {
    const existing = await getCustomer(customerId);
    if (!existing) {
      return NextResponse.json({ error: "고객을 찾을 수 없습니다" }, { status: 404 });
    }

    if (ctx.type === "partner") {
      const forbidden = authorizeForAccount(ctx, existing.partner_account_id);
      if (forbidden) return forbidden;
    }

    const body = await req.json();
    const customer = await updateCustomer(customerId, body);

    const actor = getActorInfo(ctx);
    await logActivity({
      partner_account_id: existing.partner_account_id,
      customer_id: customerId,
      deal_id: null,
      ...actor,
      action_type: "update",
      target_type: "customer",
      target_id: customerId,
      summary: `고객 "${customer.name}" 수정`,
      before_json: existing as unknown as Record<string, unknown>,
      after_json: customer as unknown as Record<string, unknown>,
    });

    return NextResponse.json({ customer });
  } catch (err) {
    console.error("[portal/customers/[id]] PUT error:", err);
    return NextResponse.json({ error: "고객 수정 실패" }, { status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ customerId: string }> }
) {
  const result = await requirePortalContext(req);
  if (isErrorResponse(result)) return result;
  const ctx = result;
  const { customerId } = await params;

  try {
    const existing = await getCustomer(customerId);
    if (!existing) {
      return NextResponse.json({ error: "고객을 찾을 수 없습니다" }, { status: 404 });
    }

    if (ctx.type === "partner") {
      const forbidden = authorizeForAccount(ctx, existing.partner_account_id);
      if (forbidden) return forbidden;
    }

    await deleteCustomer(customerId);

    const actor = getActorInfo(ctx);
    await logActivity({
      partner_account_id: existing.partner_account_id,
      customer_id: customerId,
      deal_id: null,
      ...actor,
      action_type: "delete",
      target_type: "customer",
      target_id: customerId,
      summary: `고객 "${existing.name}" 삭제`,
      before_json: existing as unknown as Record<string, unknown>,
      after_json: null,
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[portal/customers/[id]] DELETE error:", err);
    return NextResponse.json({ error: "고객 삭제 실패" }, { status: 500 });
  }
}
