import { NextRequest, NextResponse } from "next/server";

import { verifyAdmin } from "@/lib/admin-auth";
import type { CommercialOverviewRange } from "@/lib/portal/overview-types";
import {
  getCommercialOverview,
  getLegacyCommercialOverview,
} from "@/lib/portal/repositories/overview";

function parseRange(value: string | null): CommercialOverviewRange {
  if (value === "week" || value === "month" || value === "quarter") {
    return value;
  }

  return "today";
}

export async function GET(req: NextRequest) {
  const err = await verifyAdmin(req);
  if (err) return err;
  const range = parseRange(req.nextUrl.searchParams.get("range"));

  try {
    const overview = await getCommercialOverview(range);
    return NextResponse.json({ overview, mode: "v2" });
  } catch (error) {
    console.warn("[GET /api/admin/commercial/overview] falling back", error);

    try {
      const legacyOverview = await getLegacyCommercialOverview(range);
      return NextResponse.json({ overview: legacyOverview, mode: "legacy" });
    } catch (legacyError) {
      console.error("[GET /api/admin/commercial/overview]", legacyError);
      return NextResponse.json(
        { error: "Failed to fetch commercial overview" },
        { status: 500 }
      );
    }
  }
}
