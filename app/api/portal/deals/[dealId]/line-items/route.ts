import { NextRequest, NextResponse } from "next/server";

import {
  requirePortalContext,
  isErrorResponse,
} from "@/lib/partner-portal/portal-context";
import { authorizeForAccount } from "@/lib/partner-portal/portal-authorize";
import {
  getDeal,
  createDealLineItem,
  updateDealLineItem,
  deleteDealLineItem,
} from "@/lib/partner-portal/repositories/deals";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ dealId: string }> }
) {
  const result = await requirePortalContext(req);
  if (isErrorResponse(result)) return result;
  const ctx = result;
  const { dealId } = await params;

  try {
    const deal = await getDeal(dealId);
    if (!deal) return NextResponse.json({ error: "딜 없음" }, { status: 404 });
    if (ctx.type === "partner") {
      const f = authorizeForAccount(ctx, deal.partner_account_id);
      if (f) return f;
    }

    const body = await req.json();
    const item = await createDealLineItem({
      deal_id: dealId,
      sku: body.sku ?? null,
      category: body.category,
      product_name: body.product_name,
      quantity: body.quantity ?? 1,
      unit_price: body.unit_price ?? 0,
      amount: body.amount ?? (body.quantity ?? 1) * (body.unit_price ?? 0),
      sort_order: body.sort_order ?? 0,
      notes: body.notes ?? null,
    });

    return NextResponse.json({ item }, { status: 201 });
  } catch (err) {
    console.error("[portal/deals/[id]/line-items] POST error:", err);
    return NextResponse.json({ error: "라인 아이템 추가 실패" }, { status: 500 });
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
    const deal = await getDeal(dealId);
    if (!deal) return NextResponse.json({ error: "딜 없음" }, { status: 404 });
    if (ctx.type === "partner") {
      const f = authorizeForAccount(ctx, deal.partner_account_id);
      if (f) return f;
    }

    const body = await req.json();
    if (!body.id) return NextResponse.json({ error: "id 필수" }, { status: 400 });

    const item = await updateDealLineItem(body.id, body);
    return NextResponse.json({ item });
  } catch (err) {
    console.error("[portal/deals/[id]/line-items] PUT error:", err);
    return NextResponse.json({ error: "라인 아이템 수정 실패" }, { status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ dealId: string }> }
) {
  const result = await requirePortalContext(req);
  if (isErrorResponse(result)) return result;
  const ctx = result;
  const { dealId } = await params;

  try {
    const deal = await getDeal(dealId);
    if (!deal) return NextResponse.json({ error: "딜 없음" }, { status: 404 });
    if (ctx.type === "partner") {
      const f = authorizeForAccount(ctx, deal.partner_account_id);
      if (f) return f;
    }

    const { searchParams } = new URL(req.url);
    const itemId = searchParams.get("id");
    if (!itemId) return NextResponse.json({ error: "id 필수" }, { status: 400 });

    await deleteDealLineItem(itemId);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[portal/deals/[id]/line-items] DELETE error:", err);
    return NextResponse.json({ error: "라인 아이템 삭제 실패" }, { status: 500 });
  }
}
