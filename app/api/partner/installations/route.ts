import { NextRequest, NextResponse } from "next/server";

import { resolvePartnerAccountContext } from "@/lib/partner-portal/context";
import { createInstallationForPartnerAccount } from "@/lib/partner-portal/repositories/installations-write";

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
      deal_id?: string;
      title?: string | null;
      scheduled_start_at?: string;
      scheduled_end_at?: string;
      timezone?: string | null;
      location?: string | null;
      assigned_team?: string | null;
      notes?: string | null;
    };
    const {
      deal_id,
      title,
      scheduled_start_at,
      scheduled_end_at,
      timezone,
      location,
      assigned_team,
      notes,
    } = body;

    if (!deal_id || !scheduled_start_at || !scheduled_end_at) {
      return NextResponse.json(
        { error: "deal_id, scheduled_start_at, scheduled_end_at are required" },
        { status: 400 }
      );
    }

    const created = await createInstallationForPartnerAccount(context, {
      deal_id,
      title,
      scheduled_start_at,
      scheduled_end_at,
      timezone,
      location,
      assigned_team,
      notes,
    });

    return NextResponse.json(created, { status: 201 });
  } catch (error) {
    console.error("[POST /api/partner/installations]", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to create installation" },
      { status: 500 }
    );
  }
}
