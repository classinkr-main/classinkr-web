import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getSupabaseBrowserEnv, hasSupabaseBrowserEnv } from "@/lib/supabase/public-env";
import { listInstallSchedules, createInstallSchedule, updateInstallSchedule, getSalesSummary } from "@/lib/repositories/install-schedules";
import type { Database } from "@/lib/supabase/database.types";

async function verifyPartner(req: NextRequest): Promise<string | null> {
  if (!hasSupabaseBrowserEnv()) return null;
  const { url, publishableKey } = getSupabaseBrowserEnv();
  const supabase = createServerClient<Database>(url, publishableKey, {
    cookies: { getAll() { return req.cookies.getAll() }, setAll() {} },
  });
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return null;
  const admin = createSupabaseAdminClient();
  const { data } = await admin.from("partner_users").select("partner_id").eq("user_id", user.id).eq("status", "active").single();
  return data?.partner_id ?? null;
}

export async function GET(req: NextRequest) {
  const partnerId = await verifyPartner(req);
  if (!partnerId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const p = req.nextUrl.searchParams;
    if (p.get("summary") === "true") {
      return NextResponse.json({ summary: await getSalesSummary() });
    }
    const schedules = await listInstallSchedules({
      contractId: p.get("contract_id") ?? undefined,
      teamId: p.get("team_id") ?? undefined,
      status: p.get("status") ?? undefined,
      from: p.get("from") ?? undefined,
      to: p.get("to") ?? undefined,
    });
    return NextResponse.json({ schedules });
  } catch (e) {
    return NextResponse.json({ error: "Failed to fetch schedules" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const partnerId = await verifyPartner(req);
  if (!partnerId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const body = await req.json();
    const schedule = await createInstallSchedule({ ...body, partner_id: partnerId, requested_by: "partner" });
    return NextResponse.json({ schedule }, { status: 201 });
  } catch (e) {
    return NextResponse.json({ error: "Failed to create schedule" }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  const partnerId = await verifyPartner(req);
  if (!partnerId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const { id, ...body } = await req.json();
    if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
    const schedule = await updateInstallSchedule(id, body);
    return NextResponse.json({ schedule });
  } catch (e) {
    return NextResponse.json({ error: "Failed to update schedule" }, { status: 500 });
  }
}
