import { NextRequest, NextResponse } from "next/server";

import { verifyAdmin } from "@/lib/admin-auth";
import { listLegacyCustomerListItems } from "@/lib/portal/repositories/legacy";
import {
  listAllCustomerListItems,
  listCustomerDealSummaries,
  listCustomerListItems,
} from "@/lib/portal/repositories/customers";

export async function GET(req: NextRequest) {
  const err = await verifyAdmin(req);
  if (err) return err;

  const partnerAccountId = req.nextUrl.searchParams.get("partner_account_id");
  const summariesOnly = req.nextUrl.searchParams.get("summaries") === "true";

  try {
    if (partnerAccountId && summariesOnly) {
      const summaries = await listCustomerDealSummaries(partnerAccountId);
      return NextResponse.json({ summaries });
    }

    if (partnerAccountId) {
      const customers = await listCustomerListItems(partnerAccountId, {
        includeCrmCoverage: true,
        crmCoverageDepth: "summary",
      });
      return NextResponse.json({ customers });
    }

    const customers = await listAllCustomerListItems({
      includeCrmCoverage: true,
      crmCoverageDepth: "summary",
    });
    return NextResponse.json({ customers });
  } catch (error) {
    console.warn("[GET /api/admin/customers] falling back to legacy model", error);
    try {
      const customers = await listLegacyCustomerListItems();
      if (customers.length > 0) {
        return NextResponse.json({ customers, mode: "legacy" });
      }
      return NextResponse.json({ customers: [], mode: "legacy" });
    } catch (legacyError) {
      console.error("[GET /api/admin/customers]", legacyError);
      return NextResponse.json(
        { error: "Failed to fetch customers" },
        { status: 500 }
      );
    }
  }
}
