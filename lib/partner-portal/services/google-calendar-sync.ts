"server-only";

import type { UpdateCalendarEvent, CalendarEventRow } from "@/lib/supabase/database.types.v2";
import {
  deleteGoogleCalendarEvent,
  isGoogleCalendarSyncConfigured,
  upsertGoogleCalendarEvent,
} from "@/lib/google-calendar-sync";

type PartnerCalendarSyncState = Pick<
  UpdateCalendarEvent,
  | "google_calendar_event_id"
  | "google_calendar_last_synced_at"
  | "google_calendar_sync_error"
>;

function toErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

export async function syncPartnerCalendarEventToGoogle(
  event: CalendarEventRow
): Promise<PartnerCalendarSyncState> {
  if (!isGoogleCalendarSyncConfigured()) {
    return {
      google_calendar_event_id: event.google_calendar_event_id ?? null,
      google_calendar_last_synced_at: null,
      google_calendar_sync_error:
        "Google Calendar sync is not configured. Set GOOGLE_CALENDAR_ID and service account credentials.",
    };
  }

  try {
    if (event.status === "cancelled") {
      if (event.google_calendar_event_id) {
        await deleteGoogleCalendarEvent(event.google_calendar_event_id);
      }

      return {
        google_calendar_event_id: null,
        google_calendar_last_synced_at: new Date().toISOString(),
        google_calendar_sync_error: null,
      };
    }

    const googleEvent = await upsertGoogleCalendarEvent({
      googleEventId: event.google_calendar_event_id,
      title: event.title,
      description: event.description,
      range: {
        kind: "timed",
        startISO: event.starts_at,
        endISO: event.ends_at,
        timeZone: event.timezone,
      },
      metadata: {
        classin_source: "partner_portal",
        classin_local_event_id: event.id,
        classin_partner_account_id: event.partner_account_id,
        classin_source_type: event.source_type,
        classin_source_id: event.source_id,
        classin_deal_id: event.deal_id,
        classin_customer_id: event.customer_id,
      },
    });

    return {
      google_calendar_event_id: googleEvent.id ?? event.google_calendar_event_id ?? null,
      google_calendar_last_synced_at: new Date().toISOString(),
      google_calendar_sync_error: null,
    };
  } catch (error) {
    return {
      google_calendar_event_id: event.google_calendar_event_id ?? null,
      google_calendar_last_synced_at: event.google_calendar_last_synced_at ?? null,
      google_calendar_sync_error: toErrorMessage(error),
    };
  }
}
