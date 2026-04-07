import { NextRequest, NextResponse } from "next/server";

import { resolvePartnerAccountContext } from "@/lib/partner-portal/context";
import { loadPartnerDeals } from "@/lib/partner-portal/repositories/partner-read";
import type { DealStage, DealStatus } from "@/lib/partner-portal/types";

export async function GET(req: NextRequest) {
  const context = await resolvePartnerAccountContext(req);
  if (!context) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const searchParams = req.nextUrl.searchParams;
    const customerId = searchParams.get("customer_id") ?? undefined;
    const stage = (searchParams.get("stage") ?? undefined) as DealStage | undefined;
    const status = (searchParams.get("status") ?? undefined) as DealStatus | undefined;

    const payload = await loadPartnerDeals(context);
    const deals = payload.deals.filter((deal) => {
      if (customerId && deal.customer_id !== customerId) return false;
      if (stage && deal.current_stage !== stage) return false;
      if (status && deal.status !== status) return false;
      return true;
    });

    return NextResponse.json({ deals, mode: payload.mode, context });
  } catch (error) {
    console.error("[GET /api/partner/deals]", error);
    return NextResponse.json({ error: "Failed to fetch deals" }, { status: 500 });
  }
}
