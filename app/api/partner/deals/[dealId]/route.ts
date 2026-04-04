import { NextRequest, NextResponse } from "next/server";

import { resolvePartnerAccountContext } from "@/lib/partner-portal/context";
import { loadPartnerDealDetail } from "@/lib/partner-portal/repositories/partner-read";

type RouteContext = {
  params: Promise<{
    dealId: string;
  }>;
};

export async function GET(req: NextRequest, { params }: RouteContext) {
  const context = await resolvePartnerAccountContext(req);
  if (!context) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { dealId } = await params;
    const payload = await loadPartnerDealDetail(context, dealId);

    if (!payload.deal) {
      return NextResponse.json({ error: "Deal not found" }, { status: 404 });
    }

    return NextResponse.json({ deal: payload.deal, mode: payload.mode, context });
  } catch (error) {
    console.error("[GET /api/partner/deals/[dealId]]", error);
    return NextResponse.json(
      { error: "Failed to fetch deal detail" },
      { status: 500 }
    );
  }
}
