import { NextRequest, NextResponse } from "next/server";

import {
  cancelCalendarEventForPartnerAccount,
  updateCalendarEventForPartnerAccount,
} from "@/lib/partner-portal/repositories/calendar-write";
import { resolvePartnerAccountContext } from "@/lib/partner-portal/context";

type RouteContext = {
  params: Promise<{
    eventId: string;
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
    const { eventId } = await params;
    const body = (await req.json()) as {
      title?: string | null;
      starts_at?: string;
      ends_at?: string;
      timezone?: string | null;
      location?: string | null;
      description?: string | null;
      notes?: string | null;
      status?: "active" | "cancelled" | "completed";
    };

    const result =
      body.status === "cancelled" && Object.keys(body).length === 1
        ? await cancelCalendarEventForPartnerAccount(context, eventId)
        : await updateCalendarEventForPartnerAccount(context, eventId, body);

    return NextResponse.json(result);
  } catch (error) {
    console.error("[PATCH /api/partner/calendar/[eventId]]", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to update calendar event" },
      { status: 500 }
    );
  }
}
