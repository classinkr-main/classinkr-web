import { NextRequest, NextResponse } from "next/server";

import { verifyAdmin } from "@/lib/admin-auth";
import { getCustomerDetail } from "@/lib/partner-portal/repositories/customers";
import { getLegacyCustomerDetail } from "@/lib/partner-portal/repositories/legacy";

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
    let customer = await getCustomerDetail(id);

    if (!customer) {
      customer = await getLegacyCustomerDetail(id);
    }

    if (!customer) {
      return NextResponse.json({ error: "Customer not found" }, { status: 404 });
    }

    return NextResponse.json({ customer });
  } catch (error) {
    console.warn("[GET /api/admin/customers/[id]] falling back to legacy model", error);
    try {
      const { id } = await params;
      const legacyCustomer = await getLegacyCustomerDetail(id);
      if (legacyCustomer) {
        return NextResponse.json({ customer: legacyCustomer, mode: "legacy" });
      }
      return NextResponse.json({ error: "Customer not found" }, { status: 404 });
    } catch (legacyError) {
      console.error("[GET /api/admin/customers/[id]]", legacyError);
      return NextResponse.json(
        { error: "Failed to fetch customer detail" },
        { status: 500 }
      );
    }
  }
}
