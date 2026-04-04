import { NextRequest, NextResponse } from "next/server";

import { verifyAdmin } from "@/lib/admin-auth";
import {
  getCommercialOverview,
  getDemoCommercialOverview,
  getLegacyCommercialOverview,
} from "@/lib/partner-portal/repositories/overview";

export async function GET(req: NextRequest) {
  const err = await verifyAdmin(req);
  if (err) return err;

  try {
    const overview = await getCommercialOverview();
    return NextResponse.json({ overview, mode: "v2" });
  } catch (error) {
    console.warn("[GET /api/admin/commercial/overview] falling back", error);

    try {
      const legacyOverview = await getLegacyCommercialOverview();
      return NextResponse.json({ overview: legacyOverview, mode: "legacy" });
    } catch (legacyError) {
      console.warn("[GET /api/admin/commercial/overview] demo fallback", legacyError);
      return NextResponse.json({
        overview: await getDemoCommercialOverview(),
        mode: "demo",
      });
    }
  }
}
