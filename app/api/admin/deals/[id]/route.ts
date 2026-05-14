import { NextRequest, NextResponse } from "next/server";

import { verifyAdmin } from "@/lib/admin-auth";
import { getDealDetail } from "@/lib/portal/repositories/deals";
import { getLegacyDealDetail } from "@/lib/portal/repositories/legacy";

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
