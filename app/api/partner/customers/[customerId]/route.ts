import { NextRequest, NextResponse } from "next/server";

import { resolvePartnerAccountContext } from "@/lib/partner-portal/context";
import { loadPartnerCustomerDetail } from "@/lib/partner-portal/repositories/partner-read";

type RouteContext = {
  params: Promise<{
    customerId: string;
  }>;
};

export async function GET(req: NextRequest, context: RouteContext) {
  const partnerContext = await resolvePartnerAccountContext(req);
  if (!partnerContext) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { customerId } = await context.params;
    const payload = await loadPartnerCustomerDetail(partnerContext, customerId);

    if (!payload.customer) {
      return NextResponse.json({ error: "Customer not found" }, { status: 404 });
    }

    return NextResponse.json({
      customer: payload.customer,
      mode: payload.mode,
      context: partnerContext,
    });
  } catch (error) {
    console.error("[GET /api/partner/customers/[customerId]]", error);
    return NextResponse.json(
      { error: "Failed to fetch customer detail" },
      { status: 500 }
    );
  }
}
