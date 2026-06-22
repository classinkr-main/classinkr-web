import { NextRequest, NextResponse } from "next/server";

import { getVerifiedAdminContext, verifyAdmin } from "@/lib/admin-auth";
import { logActivity } from "@/lib/portal/repositories/activity";
import { getDeal, getDealDetail, updateDeal } from "@/lib/portal/repositories/deals";
import { getLegacyDealDetail } from "@/lib/portal/repositories/legacy";
import type { UpdateDeal } from "@/lib/supabase/database.types.v2";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

function hasOwn(input: Record<string, unknown>, key: string) {
  return Object.prototype.hasOwnProperty.call(input, key);
}

export async function GET(req: NextRequest, { params }: RouteContext) {
  const err = await verifyAdmin(req);
  if (err) return err;

  try {
    const { id } = await params;
    let deal = await getDealDetail(id);

    if (!deal) {
      deal = await getLegacyDealDetail(id);
    }

    if (!deal) {
      return NextResponse.json({ error: "Deal not found" }, { status: 404 });
    }

    return NextResponse.json({ deal });
  } catch (error) {
    console.warn("[GET /api/admin/deals/[id]] falling back to legacy model", error);
    try {
      const { id } = await params;
      const legacyDeal = await getLegacyDealDetail(id);
      if (legacyDeal) {
        return NextResponse.json({ deal: legacyDeal, mode: "legacy" });
      }
      return NextResponse.json({ error: "Deal not found" }, { status: 404 });
    } catch (legacyError) {
      console.error("[GET /api/admin/deals/[id]]", legacyError);
      return NextResponse.json(
        { error: "Failed to fetch deal detail" },
        { status: 500 }
      );
    }
  }
}

// 담당자(owner_id) 배정 + 단계/상태 변경. V2 deals 전용 (legacy 딜은 대상 아님).
export async function PATCH(req: NextRequest, { params }: RouteContext) {
  const err = await verifyAdmin(req);
  if (err) return err;

  const { id } = await params;

  try {
    const existing = await getDeal(id);
    if (!existing) {
      return NextResponse.json({ error: "Deal not found" }, { status: 404 });
    }

    const body = (await req.json()) as Record<string, unknown>;
    const patch: UpdateDeal = {};
    if (hasOwn(body, "owner_id")) {
      patch.owner_id =
        typeof body.owner_id === "string" && body.owner_id ? body.owner_id : null;
    }
    if (typeof body.current_stage === "string") {
      patch.current_stage = body.current_stage as UpdateDeal["current_stage"];
    }
    if (typeof body.status === "string") {
      patch.status = body.status as UpdateDeal["status"];
    }

    if (Object.keys(patch).length === 0) {
      return NextResponse.json({ error: "no allowed fields" }, { status: 400 });
    }

    const deal = await updateDeal(id, patch);

    const ctx = await getVerifiedAdminContext(req);
    await logActivity({
      partner_account_id: existing.partner_account_id,
      customer_id: existing.customer_id,
      deal_id: id,
      actor_user_id: ctx?.userId ?? null,
      actor_role: "admin",
      action_type: "update",
      target_type: "deal",
      target_id: id,
      summary: `딜 "${deal.title}" 담당자/단계 변경`,
      before_json: existing as unknown as Record<string, unknown>,
      after_json: deal as unknown as Record<string, unknown>,
    });

    return NextResponse.json({ deal });
  } catch (error) {
    console.error("[PATCH /api/admin/deals/[id]]", error);
    return NextResponse.json({ error: "Failed to update deal" }, { status: 500 });
  }
}
