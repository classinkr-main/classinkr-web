import { NextRequest, NextResponse } from "next/server";

import {
  requirePortalContext,
  isErrorResponse,
} from "@/lib/portal/portal-context";
import { loadPortalOverview } from "@/lib/portal/repositories/partner-read";
import {
  getAdminPartnerPortalOverview,
  getCommercialOverview,
} from "@/lib/portal/repositories/overview";
import type { CommercialOverviewRange } from "@/lib/portal/overview-types";

export async function GET(req: NextRequest) {
  const result = await requirePortalContext(req);
  if (isErrorResponse(result)) return result;
  const ctx = result;

  const { searchParams } = new URL(req.url);
  const range = (searchParams.get("range") as CommercialOverviewRange) ?? "today";
  const shape = searchParams.get("shape");

  try {
    if (ctx.type === "admin") {
      if (shape === "partner") {
        const overview = await getAdminPartnerPortalOverview();
        return NextResponse.json({ type: "partner", ...overview });
      }

      // admin: 전체 상업 개요
      const overview = await getCommercialOverview(range);
      return NextResponse.json({ type: "commercial", ...overview });
    }

    // partner: 자기 계정 개요 (V2 → legacy → empty 폴백)
    const overview = await loadPortalOverview({
      userId: ctx.userId,
      partnerAccountId: ctx.partnerAccountId,
      legacyPartnerId: ctx.legacyPartnerId,
      customerId: null,
      role: ctx.role,
      source: ctx.legacyPartnerId ? "legacy" : "v2",
    });

    return NextResponse.json({ type: "partner", ...overview });
  } catch (err) {
    console.error("[portal/overview] GET error:", err);
    return NextResponse.json(
      { error: "개요 조회 실패" },
      { status: 500 }
    );
  }
}
