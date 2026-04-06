import { NextRequest, NextResponse } from "next/server";
import { verifyAdmin } from "@/lib/admin-auth";
import { listInstallSchedules, createInstallSchedule, getSalesSummary } from "@/lib/repositories/install-schedules";

export async function GET(req: NextRequest) {
  const err = await verifyAdmin(req);
  if (err) return err;
  try {
    const p = req.nextUrl.searchParams;
    if (p.get("summary") === "true") return NextResponse.json({ summary: await getSalesSummary() });
    return NextResponse.json({ schedules: await listInstallSchedules({
      contractId: p.get("contract_id") ?? undefined,
      partnerId: p.get("partner_id") ?? undefined,
      teamId: p.get("team_id") ?? undefined,
      status: p.get("status") ?? undefined,
      from: p.get("from") ?? undefined,
      to: p.get("to") ?? undefined,
    })});
  } catch {
    return NextResponse.json({ error: "Failed to fetch schedules" }, { status: 500 });
  }
}
export async function POST(req: NextRequest) {
  const err = await verifyAdmin(req);
  if (err) return err;
  try {
    const body = await req.json();
    return NextResponse.json({ schedule: await createInstallSchedule({ ...body, requested_by: "admin" }) }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Failed to create schedule" }, { status: 500 });
  }
}
