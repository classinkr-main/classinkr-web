import { branchManagerFromRequest } from "@/lib/admin/personal-branch"
import { branchManagerMatches } from "@/lib/branch/personal-scope";
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
  const manager = await branchManagerFromRequest(req.nextUrl, req);
  if (manager && result.state === "ready") {
    const snapshot = result.snapshot;
    return NextResponse.json({ ...result, snapshot: {
      ...snapshot,
      roster: snapshot.roster.filter((person) => branchManagerMatches(person.name, manager)),
      kpi: { ...snapshot.kpi, report: { ...snapshot.kpi.report, people: snapshot.kpi.report.people.filter((person) => branchManagerMatches(person.name, manager)) } },
      revenue: { ...snapshot.revenue, period: null, people: snapshot.revenue.people.filter((person) => branchManagerMatches(person.person, manager)) },
    } }, { headers: { "Cache-Control": "private, no-store" } });
  }
  return NextResponse.json(result, { headers: { "Cache-Control": "private, no-store" } });
}
