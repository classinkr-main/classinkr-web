"server-only";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type {
  CalendarEventRow,
  DealRow,
  InsertCalendarEvent,
  UpdateCalendarEvent,
  InstallationEventRow,
} from "@/lib/supabase/database.types.v2";
import type { PartnerAccountContext } from "@/lib/partner-portal/context";
import { syncPartnerCalendarEventToGoogle } from "@/lib/partner-portal/services/google-calendar-sync";
import { writeActivityLog } from "@/lib/partner-portal/services/activity-log-write";
import {
  normalizeOptionalText,
  normalizeRequiredText,
} from "@/lib/partner-portal/services/mutation-utils";

export type CreateMeetingEventInput = {
  deal_id: string;
  title: string;
  starts_at: string;
  ends_at: string;
  timezone?: string | null;
  location?: string | null;
  description?: string | null;
};

function ensurePartnerAccountId(context: PartnerAccountContext) {
  if (!context.partnerAccountId) {
    throw new Error("Partner account context is required");
  }

  return context.partnerAccountId;
}

async function getDealForPartnerAccount(
  partnerAccountId: string,
  dealId: string
) {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("deals")
    .select("*")
    .eq("id", dealId)
    .eq("partner_account_id", partnerAccountId)
    .single();

  if (error || !data) {
    throw new Error("Deal not found");
  }

  return data as DealRow;
}

function composeDescription(location?: string | null, description?: string | null) {
  const locationText = normalizeOptionalText(location);
  const descriptionText = normalizeOptionalText(description);

  if (locationText && descriptionText) {
    return `장소: ${locationText}\n${descriptionText}`;
  }

  if (locationText) {
    return `장소: ${locationText}`;
  }

  return descriptionText;
}

async function getCalendarEventForPartnerAccount(
  partnerAccountId: string,
  eventId: string
) {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("calendar_events")
    .select("*")
    .eq("id", eventId)
    .eq("partner_account_id", partnerAccountId)
    .single();

  if (error || !data) {
    throw new Error("Calendar event not found");
  }

  return data as CalendarEventRow;
}

async function getInstallationForPartnerAccount(
  partnerAccountId: string,
  installationId: string
) {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("installation_events")
    .select("*")
    .eq("id", installationId)
    .eq("partner_account_id", partnerAccountId)
    .single();

  if (error || !data) {
    throw new Error("Installation not found");
  }

  return data as InstallationEventRow;
}

async function persistGoogleCalendarSyncState(
  partnerAccountId: string,
  eventId: string,
  patch: Pick<
    UpdateCalendarEvent,
    | "google_calendar_event_id"
    | "google_calendar_last_synced_at"
    | "google_calendar_sync_error"
  >
) {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("calendar_events")
    .update(patch)
    .eq("id", eventId)
    .eq("partner_account_id", partnerAccountId)
    .select("*")
    .single();

  if (error) {
    throw error;
  }

  return data as CalendarEventRow;
}

export type UpdateCalendarEventInput = {
  title?: string | null;
  starts_at?: string;
  ends_at?: string;
  timezone?: string | null;
  location?: string | null;
  description?: string | null;
  notes?: string | null;
  status?: CalendarEventRow["status"];
};

type UpdateCalendarSyncResult = {
  event: CalendarEventRow;
  installation?: InstallationEventRow | null;
};

function buildCalendarUpdatePayload(
  current: CalendarEventRow,
  input: UpdateCalendarEventInput
): UpdateCalendarEvent {
  const payload: UpdateCalendarEvent = {};
  const hasLocation = input.location !== undefined;
  const hasText = input.description !== undefined || input.notes !== undefined;

  if (input.title !== undefined) {
    payload.title = normalizeRequiredText(input.title, "title");
  }

  if (input.starts_at !== undefined) {
    payload.starts_at = normalizeRequiredText(input.starts_at, "starts_at");
  }

  if (input.ends_at !== undefined) {
    payload.ends_at = normalizeRequiredText(input.ends_at, "ends_at");
  }

  if (input.timezone !== undefined) {
    payload.timezone = normalizeOptionalText(input.timezone) ?? current.timezone;
  }

  if (hasLocation || hasText) {
    const nextLocation = hasLocation ? input.location : undefined;
    const nextNotes =
      input.notes !== undefined
        ? input.notes
        : input.description !== undefined
        ? input.description
        : undefined;
    payload.description = composeDescription(nextLocation, nextNotes);
  }

  if (input.status !== undefined) {
    payload.status = input.status;
  }

  return payload;
}

async function syncInstallationFromCalendarEventPatch(
  partnerAccountId: string,
  currentEvent: CalendarEventRow,
  input: UpdateCalendarEventInput
) {
  if (currentEvent.source_type !== "installation" || !currentEvent.source_id) {
    return null;
  }

  const currentInstallation = await getInstallationForPartnerAccount(
    partnerAccountId,
    currentEvent.source_id
  );
  const supabase = createSupabaseAdminClient();

  const installationPayload: Partial<Pick<
    InstallationEventRow,
    "scheduled_start_at" | "scheduled_end_at" | "timezone" | "location" | "notes" | "status"
  >> = {};

  if (input.starts_at !== undefined) {
    installationPayload.scheduled_start_at = normalizeRequiredText(input.starts_at, "starts_at");
  }

  if (input.ends_at !== undefined) {
    installationPayload.scheduled_end_at = normalizeRequiredText(input.ends_at, "ends_at");
  }

  if (input.timezone !== undefined) {
    installationPayload.timezone = normalizeOptionalText(input.timezone) ?? currentInstallation.timezone;
  }

  if (input.location !== undefined) {
    installationPayload.location = normalizeOptionalText(input.location);
  }

  if (input.notes !== undefined) {
    installationPayload.notes = normalizeOptionalText(input.notes);
  } else if (input.description !== undefined) {
    installationPayload.notes = normalizeOptionalText(input.description);
  }

  if (input.status !== undefined) {
    installationPayload.status =
      input.status === "active"
        ? "planned"
        : input.status === "cancelled" || input.status === "completed"
        ? input.status
        : currentInstallation.status;
  }

  if (Object.keys(installationPayload).length === 0) {
    return currentInstallation;
  }

  const { data, error } = await supabase
    .from("installation_events")
    .update(installationPayload)
    .eq("id", currentInstallation.id)
    .eq("partner_account_id", partnerAccountId)
    .select("*")
    .single();

  if (error) {
    throw error;
  }

  return data as InstallationEventRow;
}

export async function updateCalendarEventForPartnerAccount(
  context: PartnerAccountContext,
  eventId: string,
  input: UpdateCalendarEventInput
) {
  const partnerAccountId = ensurePartnerAccountId(context);
  const currentEvent = await getCalendarEventForPartnerAccount(partnerAccountId, eventId);
  const supabase = createSupabaseAdminClient();
  const payload = buildCalendarUpdatePayload(currentEvent, input);

  if (Object.keys(payload).length === 0) {
    throw new Error("No calendar event fields provided");
  }

  const { data, error } = await supabase
    .from("calendar_events")
    .update(payload)
    .eq("id", eventId)
    .eq("partner_account_id", partnerAccountId)
    .select("*")
    .single();

  if (error) {
    throw error;
  }

  let event = data as CalendarEventRow;
  const syncedInstallation = await syncInstallationFromCalendarEventPatch(
    partnerAccountId,
    currentEvent,
    input
  );
  try {
    event = await persistGoogleCalendarSyncState(
      partnerAccountId,
      event.id,
      await syncPartnerCalendarEventToGoogle(event)
    );
  } catch (syncPersistError) {
    console.error("[calendar-write] failed to persist Google sync state", syncPersistError);
  }

  await writeActivityLog({
    partner_account_id: partnerAccountId,
    customer_id: event.customer_id,
    deal_id: event.deal_id,
    actor_user_id: context.userId,
    actor_role: "partner",
    action_type:
      input.status === "cancelled" ? "calendar_event_cancelled" : "calendar_event_updated",
    target_type: "calendar_event",
    target_id: event.id,
    summary:
      input.status === "cancelled"
        ? `${event.title} 일정이 취소됨`
        : `${event.title} 일정이 수정됨`,
    before_json: currentEvent as unknown as Record<string, unknown>,
    after_json: {
      event,
      installation: syncedInstallation ? (syncedInstallation as unknown as Record<string, unknown>) : null,
    },
  });

  return {
    event,
    installation: syncedInstallation,
  } satisfies UpdateCalendarSyncResult;
}

export async function cancelCalendarEventForPartnerAccount(
  context: PartnerAccountContext,
  eventId: string
) {
  return updateCalendarEventForPartnerAccount(context, eventId, {
    status: "cancelled",
  });
}

export async function createMeetingEventForPartnerAccount(
  context: PartnerAccountContext,
  input: CreateMeetingEventInput
) {
  const partnerAccountId = ensurePartnerAccountId(context);
  const deal = await getDealForPartnerAccount(partnerAccountId, input.deal_id);
  const supabase = createSupabaseAdminClient();

  const payload: InsertCalendarEvent = {
    partner_account_id: partnerAccountId,
    customer_id: deal.customer_id,
    deal_id: deal.id,
    source_type: "meeting",
    source_id: null,
    starts_at: normalizeRequiredText(input.starts_at, "starts_at"),
    ends_at: normalizeRequiredText(input.ends_at, "ends_at"),
    timezone: normalizeOptionalText(input.timezone) ?? "Asia/Seoul",
    title: normalizeRequiredText(input.title, "title"),
    description: composeDescription(input.location, input.description),
    status: "active",
    created_by: context.userId,
  };

  const { data, error } = await supabase
    .from("calendar_events")
    .insert(payload)
    .select("*")
    .single();

  if (error) {
    throw error;
  }

  let event = data as CalendarEventRow;
  try {
    event = await persistGoogleCalendarSyncState(
      partnerAccountId,
      event.id,
      await syncPartnerCalendarEventToGoogle(event)
    );
  } catch (syncPersistError) {
    console.error("[calendar-write] failed to persist Google sync state", syncPersistError);
  }

  await writeActivityLog({
    partner_account_id: partnerAccountId,
    customer_id: deal.customer_id,
    deal_id: deal.id,
    actor_user_id: context.userId,
    actor_role: "partner",
    action_type: "meeting_scheduled",
    target_type: "calendar_event",
    target_id: event.id,
    summary: `${deal.title} 미팅 일정이 등록됨`,
    before_json: null,
    after_json: {
      starts_at: event.starts_at,
      ends_at: event.ends_at,
      title: event.title,
    },
  });

  return event;
}
