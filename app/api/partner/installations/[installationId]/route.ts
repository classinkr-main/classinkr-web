import { NextRequest, NextResponse } from "next/server";

import {
  cancelInstallationForPartnerAccount,
  updateInstallationForPartnerAccount,
} from "@/lib/partner-portal/repositories/installations-write";
import { resolvePartnerAccountContext } from "@/lib/partner-portal/context";

type RouteContext = {
  params: Promise<{
    installationId: string;
  }>;
};

export async function PATCH(req: NextRequest, { params }: RouteContext) {
  const context = await resolvePartnerAccountContext(req);
  if (!context?.partnerAccountId) {
    return NextResponse.json(
      { error: "Partner V2 account is required" },
      { status: 409 }
    );
  }

  try {
    const { installationId } = await params;
    const body = (await req.json()) as {
      title?: string | null;
      scheduled_start_at?: string;
      scheduled_end_at?: string;
      timezone?: string | null;
      location?: string | null;
      assigned_team?: string | null;
      notes?: string | null;
      description?: string | null;
      status?: "planned" | "confirmed" | "in_progress" | "completed" | "paused" | "cancelled";
    };

    const result =
      body.status === "cancelled" && Object.keys(body).length === 1
        ? await cancelInstallationForPartnerAccount(context, installationId)
        : await updateInstallationForPartnerAccount(context, installationId, body);

    return NextResponse.json(result);
  } catch (error) {
    console.error("[PATCH /api/partner/installations/[installationId]]", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to update installation" },
      { status: 500 }
    );
  }
}
