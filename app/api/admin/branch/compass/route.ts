import { NextRequest, NextResponse } from "next/server";
import { CRM_STAFF_ADMIN_API_ROLES, verifyAdmin } from "@/lib/admin-auth";
import { readCompassKrTeam } from "@/lib/compass/kr-team";
import { getBusinessDateParts } from "@/lib/business-time";
import { parseYmMonth } from "@/lib/branch/fiscal";

export async function GET(req: NextRequest) {
  const denied = await verifyAdmin(req, CRM_STAFF_ADMIN_API_ROLES);
  if (denied) return denied;
  const month = req.nextUrl.searchParams.get("month") ?? getBusinessDateParts(new Date()).date.slice(0, 7);
  if (!parseYmMonth(month)) return NextResponse.json({ error: "Invalid month query" }, { status: 400 });
  const result = await readCompassKrTeam(month);
  return NextResponse.json(result, { headers: { "Cache-Control": "private, no-store" } });
}
