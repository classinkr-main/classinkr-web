import { NextRequest, NextResponse } from "next/server";

import {
  requirePortalContext,
  isErrorResponse,
} from "@/lib/portal/portal-context";
import { authorizeForAccount } from "@/lib/portal/portal-authorize";
import {
  getDeal,
  createDealLineItem,
  updateDealLineItemForDeal,
  deleteDealLineItemForDeal,
} from "@/lib/portal/repositories/deals";
import type { UpdateDealLineItem } from "@/lib/supabase/database.types.v2";

function hasOwn(input: Record<string, unknown>, key: string) {
  return Object.prototype.hasOwnProperty.call(input, key);
}

function parseNonNegativeNumber(value: unknown, fallback: number) {
  const amount = typeof value === "number" ? value : Number(value);
  return Number.isFinite(amount) && amount >= 0 ? amount : fallback;
}

function parsePositiveNumber(value: unknown, fallback: number) {
  const amount = typeof value === "number" ? value : Number(value);
  return Number.isFinite(amount) && amount > 0 ? amount : fallback;
}

function pickLineItemPatch(body: Record<string, unknown>): UpdateDealLineItem {
  const patch: UpdateDealLineItem = {};

  if (hasOwn(body, "sku")) patch.sku = typeof body.sku === "string" ? body.sku : null;
  if (typeof body.category === "string") patch.category = body.category as UpdateDealLineItem["category"];
  if (typeof body.product_name === "string") patch.product_name = body.product_name;
  if (hasOwn(body, "quantity")) patch.quantity = parsePositiveNumber(body.quantity, 1);
  if (hasOwn(body, "unit_price")) patch.unit_price = parseNonNegativeNumber(body.unit_price, 0);
  if (typeof body.sort_order === "number") patch.sort_order = body.sort_order;
  if (hasOwn(body, "notes")) patch.notes = typeof body.notes === "string" ? body.notes : null;

  if (patch.quantity != null && patch.unit_price != null) {
    patch.amount = patch.quantity * patch.unit_price;
  }

  return patch;
}

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
    const quantity = parsePositiveNumber(body.quantity, 1);
    const unitPrice = parseNonNegativeNumber(body.unit_price, 0);
    const item = await createDealLineItem({
      deal_id: dealId,
      sku: body.sku ?? null,
      category: body.category,
      product_name: body.product_name,
      quantity,
      unit_price: unitPrice,
      amount: quantity * unitPrice,
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

    const body = (await req.json()) as Record<string, unknown>;
    if (!body.id) return NextResponse.json({ error: "id 필수" }, { status: 400 });
    if (hasOwn(body, "quantity") !== hasOwn(body, "unit_price")) {
      return NextResponse.json(
        { error: "quantity and unit_price must be updated together" },
        { status: 400 }
      );
    }

    const patch = pickLineItemPatch(body);
    if (Object.keys(patch).length === 0) {
      return NextResponse.json({ error: "no allowed fields" }, { status: 400 });
    }

    const item = await updateDealLineItemForDeal(
      dealId,
      String(body.id),
      patch
    );
    if (!item) return NextResponse.json({ error: "line item not found" }, { status: 404 });
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

    const deleted = await deleteDealLineItemForDeal(dealId, itemId);
    if (!deleted) return NextResponse.json({ error: "line item not found" }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[portal/deals/[id]/line-items] DELETE error:", err);
    return NextResponse.json({ error: "라인 아이템 삭제 실패" }, { status: 500 });
  }
}
