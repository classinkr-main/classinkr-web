import { NextRequest, NextResponse } from "next/server";

import {
  requirePortalContext,
  isErrorResponse,
} from "@/lib/portal/portal-context";
import { authorizeForAccount, getActorInfo } from "@/lib/portal/portal-authorize";
import {
  dealHasBlockingDependents,
  deleteDeal,
  getDeal,
  getDealDetail,
  getDealDetailForPartnerAccount,
  updateDeal,
} from "@/lib/portal/repositories/deals";
import { logActivity } from "@/lib/portal/repositories/activity";
import type { UpdateDeal } from "@/lib/supabase/database.types.v2";

function hasOwn(input: Record<string, unknown>, key: string) {
  return Object.prototype.hasOwnProperty.call(input, key);
}

function pickDealPatch(body: Record<string, unknown>, isAdmin: boolean): UpdateDeal {
  const patch: UpdateDeal = {};

  if (typeof body.title === "string") patch.title = body.title;
  if (typeof body.status === "string") patch.status = body.status as UpdateDeal["status"];
  if (typeof body.current_stage === "string") {
    patch.current_stage = body.current_stage as UpdateDeal["current_stage"];
  }
  if (isAdmin) {
    if (typeof body.expected_amount === "number") patch.expected_amount = body.expected_amount;
    if (typeof body.contracted_amount === "number") patch.contracted_amount = body.contracted_amount;
    if (typeof body.installed_amount === "number") patch.installed_amount = body.installed_amount;
    if (typeof body.paid_amount === "number") patch.paid_amount = body.paid_amount;
    if (typeof body.outstanding_amount === "number") patch.outstanding_amount = body.outstanding_amount;
    if (typeof body.payment_status === "string") {
      patch.payment_status = body.payment_status as UpdateDeal["payment_status"];
    }
  }
  if (hasOwn(body, "starts_at")) {
    patch.starts_at = typeof body.starts_at === "string" ? body.starts_at : null;
  }
  if (hasOwn(body, "closed_at")) {
    patch.closed_at = typeof body.closed_at === "string" ? body.closed_at : null;
  }
  if (hasOwn(body, "notes")) patch.notes = typeof body.notes === "string" ? body.notes : null;

  return patch;
}

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

    const body = (await req.json()) as Record<string, unknown>;
    const patch = pickDealPatch(body, ctx.type === "admin");
    if (Object.keys(patch).length === 0) {
      return NextResponse.json({ error: "no allowed fields" }, { status: 400 });
    }

    const deal = await updateDeal(dealId, patch);

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

// 빈 딜만 삭제한다. 견적서 생성 롤백(고아 정리) 등에서 사용.
// deals 자식 FK가 전부 ON DELETE CASCADE이므로, 문서·정산 이력이 있는 딜은
// 삭제를 거부해(409) 실제 데이터가 조용히 지워지는 것을 막는다.
export async function DELETE(
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

    if (await dealHasBlockingDependents(dealId)) {
      return NextResponse.json(
        { error: "문서·정산 이력이 있는 딜은 삭제할 수 없습니다." },
        { status: 409 }
      );
    }

    await deleteDeal(dealId);

    const actor = getActorInfo(ctx);
    await logActivity({
      partner_account_id: existing.partner_account_id,
      // 삭제된 딜을 FK로 참조하지 않도록 deal_id는 비운다(활동 로그만 남긴다).
      customer_id: existing.customer_id,
      deal_id: null,
      ...actor,
      action_type: "delete",
      target_type: "deal",
      target_id: dealId,
      summary: `딜 "${existing.title}" 삭제`,
      before_json: existing as unknown as Record<string, unknown>,
      after_json: null,
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[portal/deals/[id]] DELETE error:", err);
    return NextResponse.json({ error: "딜 삭제 실패" }, { status: 500 });
  }
}
