import { NextRequest, NextResponse } from "next/server";
import { STAFF_ADMIN_API_ROLES, verifyAdmin } from "@/lib/admin-auth";
import { listTeams, createTeam } from "@/lib/repositories/teams";

export async function GET(req: NextRequest) {
  const err = await verifyAdmin(req, STAFF_ADMIN_API_ROLES);
  if (err) return err;
  try {
    const teams = await listTeams(req.nextUrl.searchParams.get("active") === "true");
    return NextResponse.json({ teams });
  } catch {
    return NextResponse.json({ error: "Failed to fetch teams" }, { status: 500 });
  }
}
export async function POST(req: NextRequest) {
  const err = await verifyAdmin(req, STAFF_ADMIN_API_ROLES);
  if (err) return err;
  try {
    const team = await createTeam(await req.json());
    return NextResponse.json({ team }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Failed to create team" }, { status: 500 });
  }
}
