import { NextRequest, NextResponse } from "next/server";

import { resolvePartnerAccountContext } from "@/lib/partner-portal/context";
import { createMeetingEventForPartnerAccount } from "@/lib/partner-portal/repositories/calendar-write";
import { loadPartnerCalendar } from "@/lib/partner-portal/repositories/partner-read";

export async function GET(req: NextRequest) {
  const context = await resolvePartnerAccountContext(req);
  if (!context) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const payload = await loadPartnerCalendar(context);
    return NextResponse.json({ ...payload, context });
  } catch (error) {
    console.error("[GET /api/partner/calendar]", error);
    return NextResponse.json({ error: "Failed to fetch calendar events" }, { status: 500 });
  }
}

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
      title?: string;
      starts_at?: string;
      ends_at?: string;
      timezone?: string | null;
      location?: string | null;
      description?: string | null;
    };
    const {
      deal_id,
      title,
      starts_at,
      ends_at,
      timezone,
      location,
      description,
    } = body;

    if (!deal_id || !title || !starts_at || !ends_at) {
      return NextResponse.json(
        { error: "deal_id, title, starts_at, ends_at are required" },
        { status: 400 }
      );
    }

    const event = await createMeetingEventForPartnerAccount(context, {
      deal_id,
      title,
      starts_at,
      ends_at,
      timezone,
      location,
      description,
    });
    return NextResponse.json({ event }, { status: 201 });
  } catch (error) {
    console.error("[POST /api/partner/calendar]", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to create calendar event" },
      { status: 500 }
    );
  }
}
