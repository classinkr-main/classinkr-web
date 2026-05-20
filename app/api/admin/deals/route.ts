import { NextRequest, NextResponse } from "next/server";

import { verifyAdmin } from "@/lib/admin-auth";
import { listDealListItems } from "@/lib/portal/repositories/deals";
import type { DealStage, DealStatus } from "@/lib/portal/types";

export async function GET(req: NextRequest) {
  const err = await verifyAdmin(req);
  if (err) return err;

  try {
    const searchParams = req.nextUrl.searchParams;
    const partnerAccountId = searchParams.get("partner_account_id") ?? undefined;
    const customerId = searchParams.get("customer_id") ?? undefined;
    const stage = (searchParams.get("stage") ?? undefined) as DealStage | undefined;
    const status = (searchParams.get("status") ?? undefined) as DealStatus | undefined;

    const deals = await listDealListItems({
      partnerAccountId,
      customerId,
      stage,
      status,
    });

    return NextResponse.json({ deals });
  } catch (error) {
    console.error("[GET /api/admin/deals]", error);
    return NextResponse.json({ error: "Failed to fetch deals" }, { status: 500 });
  }
}
