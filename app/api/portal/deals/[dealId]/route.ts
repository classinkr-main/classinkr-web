import { NextRequest, NextResponse } from "next/server";

import {
  requirePortalContext,
  isErrorResponse,
} from "@/lib/partner-portal/portal-context";
import { authorizeForAccount, getActorInfo } from "@/lib/partner-portal/portal-authorize";
import {
  getDeal,
  getDealDetail,
  getDealDetailForPartnerAccount,
  updateDeal,
} from "@/lib/partner-portal/repositories/deals";
import { logActivity } from "@/lib/partner-portal/repositories/activity";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ dealId: string }> }
) {
  const result = await requirePortalContext(req);
  if (isErrorResponse(result)) return result;
  const ctx = result;

  const { dealId } = await params;

  try {
    const detail =
      ctx.type === "admin"
        ? await getDealDetail(dealId)
        : await getDealDetailForPartnerAccount(dealId, ctx.partnerAccountId);

    if (!detail) {
      return NextResponse.json(
        { error: "딜을 찾을 수 없습니다" },
        { status: 404 }
      );
    }

    return NextResponse.json(detail);
  } catch (err) {
    console.error("[portal/deals/[id]] GET error:", err);
    return NextResponse.json(
      { error: "딜 상세 조회 실패" },
      { status: 500 }
    );
  }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ dealId: string }> }
) {
  const result = await requirePortalContext(req);
  if (isErrorResponse(result)) return result;
  const ctx = result;
  const { dealId } = await params;

  try {
    const existing = await getDeal(dealId);
    if (!existing) {
      return NextResponse.json({ error: "딜을 찾을 수 없습니다" }, { status: 404 });
    }
    if (ctx.type === "partner") {
      const forbidden = authorizeForAccount(ctx, existing.partner_account_id);
      if (forbidden) return forbidden;
    }

    const body = await req.json();
    const deal = await updateDeal(dealId, body);

    const actor = getActorInfo(ctx);
    await logActivity({
      partner_account_id: existing.partner_account_id,
      customer_id: existing.customer_id,
      deal_id: dealId,
      ...actor,
      action_type: "update",
      target_type: "deal",
      target_id: dealId,
      summary: `딜 "${deal.title}" 수정`,
      before_json: existing as unknown as Record<string, unknown>,
      after_json: deal as unknown as Record<string, unknown>,
    });

    return NextResponse.json({ deal });
  } catch (err) {
    console.error("[portal/deals/[id]] PUT error:", err);
    return NextResponse.json({ error: "딜 수정 실패" }, { status: 500 });
  }
}
