import { NextRequest, NextResponse } from "next/server";

import { resolvePartnerAccountContext } from "@/lib/partner-portal/context";
import { updateCustomerForPartnerAccount } from "@/lib/partner-portal/repositories/customers-write";
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

export async function PATCH(req: NextRequest, context: RouteContext) {
  const partnerContext = await resolvePartnerAccountContext(req);
  if (!partnerContext?.partnerAccountId) {
    return NextResponse.json(
      { error: "Partner V2 account is required" },
      { status: 409 }
    );
  }

  try {
    const { customerId } = await context.params;
    const body = (await req.json()) as {
      name?: string;
      contact_name?: string | null;
      email?: string | null;
      phone?: string | null;
      address?: string | null;
      business_number?: string | null;
      campus_name?: string | null;
      region_label?: string | null;
      notes?: string | null;
    };

    const customer = await updateCustomerForPartnerAccount(
      partnerContext,
      customerId,
      body
    );

    return NextResponse.json({ customer });
  } catch (error) {
    console.error("[PATCH /api/partner/customers/[customerId]]", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to update customer" },
      { status: 500 }
    );
  }
}
