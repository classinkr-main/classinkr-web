import { NextRequest, NextResponse } from "next/server";

import { resolvePartnerAccountContext } from "@/lib/partner-portal/context";
import { loadPartnerCustomers } from "@/lib/partner-portal/repositories/partner-read";

export async function GET(req: NextRequest) {
  const context = await resolvePartnerAccountContext(req);
  if (!context) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const payload = await loadPartnerCustomers(context);
    return NextResponse.json({ ...payload, context });
  } catch (error) {
    console.error("[GET /api/partner/customers]", error);
    return NextResponse.json(
      { error: "Failed to fetch customers" },
      { status: 500 }
    );
  }
}
