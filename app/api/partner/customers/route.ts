import { NextRequest, NextResponse } from "next/server";

import { resolvePartnerAccountContext } from "@/lib/partner-portal/context";
import { createCustomerForPartnerAccount } from "@/lib/partner-portal/repositories/customers-write";
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

export async function POST(req: NextRequest) {
  const context = await resolvePartnerAccountContext(req);
  if (!context?.partnerAccountId) {
    return NextResponse.json(
      { error: "Partner V2 account is required" },
      { status: 409 }
    );
  }

  try {
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

    if (!body.name) {
      return NextResponse.json({ error: "name is required" }, { status: 400 });
    }

    const customer = await createCustomerForPartnerAccount(context, body);
    return NextResponse.json({ customer }, { status: 201 });
  } catch (error) {
    console.error("[POST /api/partner/customers]", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to create customer" },
      { status: 500 }
    );
  }
}
