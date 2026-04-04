import { NextRequest, NextResponse } from "next/server";

import { resolvePartnerAccountContext } from "@/lib/partner-portal/context";
import { loadPartnerDocuments } from "@/lib/partner-portal/repositories/partner-read";
import type { PartnerDocumentKind } from "@/lib/partner-portal/types";

export async function GET(req: NextRequest) {
  const context = await resolvePartnerAccountContext(req);
  if (!context) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const payload = await loadPartnerDocuments(context);
    const searchParams = req.nextUrl.searchParams;
    const type = (searchParams.get("type") ?? "all") as PartnerDocumentKind | "all";
    const customerId = searchParams.get("customer_id") ?? undefined;
    const dealId = searchParams.get("deal_id") ?? undefined;
    const status = searchParams.get("status") ?? undefined;

    const documents = payload.documents.filter((item) => {
      if (type !== "all" && item.kind !== type) return false;
      if (customerId && item.customer_id !== customerId) return false;
      if (dealId && item.deal_id !== dealId) return false;
      if (status && item.status !== status) return false;
      return true;
    });

    return NextResponse.json({
      mode: payload.mode,
      summary: payload.summary,
      documents,
      context,
    });
  } catch (error) {
    console.error("[GET /api/partner/documents]", error);
    return NextResponse.json({ error: "Failed to fetch documents" }, { status: 500 });
  }
}
