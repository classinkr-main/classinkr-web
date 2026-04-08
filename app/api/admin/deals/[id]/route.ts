import { NextRequest, NextResponse } from "next/server";

import { verifyAdmin } from "@/lib/admin-auth";
import { getDemoDealDetail } from "@/lib/partner-portal/repositories/demo";
import { getDealDetail } from "@/lib/partner-portal/repositories/deals";
import { getLegacyDealDetail } from "@/lib/partner-portal/repositories/legacy";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

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
      deal = await getDemoDealDetail(id);
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
      const demoDeal = await getDemoDealDetail(id);
      if (demoDeal) {
        return NextResponse.json({ deal: demoDeal, mode: "demo" });
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
