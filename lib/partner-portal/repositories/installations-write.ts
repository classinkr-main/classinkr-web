"server-only";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type {
  CalendarEventRow,
  DealRow,
  InsertCalendarEvent,
  InsertInstallationEvent,
  InstallationEventRow,
  UpdateInstallationEvent,
} from "@/lib/supabase/database.types.v2";
import type { PartnerAccountContext } from "@/lib/partner-portal/context";
import { writeActivityLog } from "@/lib/partner-portal/services/activity-log-write";
import {
  normalizeOptionalText,
  normalizeRequiredText,
} from "@/lib/partner-portal/services/mutation-utils";

export type CreateInstallationInput = {
  deal_id: string;
  title?: string | null;
  scheduled_start_at: string;
  scheduled_end_at: string;
  timezone?: string | null;
  location?: string | null;
  assigned_team?: string | null;
  notes?: string | null;
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

function composeInstallationCalendarDescription(
  location?: string | null,
  notes?: string | null
) {
  const locationText = normalizeOptionalText(location);
  const noteText = normalizeOptionalText(notes);

  if (locationText && noteText) {
    return `장소: ${locationText}\n${noteText}`;
  }

  if (locationText) {
    return `장소: ${locationText}`;
  }

  return noteText;
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

async function getCalendarEventForInstallation(
  partnerAccountId: string,
  installationId: string
) {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("calendar_events")
    .select("*")
    .eq("partner_account_id", partnerAccountId)
    .eq("source_type", "installation")
    .eq("source_id", installationId)
    .single();

  if (error || !data) {
    return null;
  }

  return data as CalendarEventRow;
}

export type UpdateInstallationInput = {
  title?: string | null;
  scheduled_start_at?: string;
  scheduled_end_at?: string;
  timezone?: string | null;
  location?: string | null;
  assigned_team?: string | null;
  notes?: string | null;
  description?: string | null;
  status?: InstallationEventRow["status"];
};

type UpdateInstallationResult = {
  installation: InstallationEventRow;
  calendarEvent: CalendarEventRow | null;
};

function buildInstallationUpdatePayload(
  current: InstallationEventRow,
  input: UpdateInstallationInput
): UpdateInstallationEvent {
  const payload: UpdateInstallationEvent = {};

  if (input.scheduled_start_at !== undefined) {
    payload.scheduled_start_at = normalizeRequiredText(
      input.scheduled_start_at,
      "scheduled_start_at"
    );
  }

  if (input.scheduled_end_at !== undefined) {
    payload.scheduled_end_at = normalizeRequiredText(
      input.scheduled_end_at,
      "scheduled_end_at"
    );
  }

  if (input.timezone !== undefined) {
    payload.timezone = normalizeOptionalText(input.timezone) ?? current.timezone;
  }

  if (input.location !== undefined) {
    payload.location = normalizeOptionalText(input.location);
  }

  if (input.assigned_team !== undefined) {
    payload.assigned_team = normalizeOptionalText(input.assigned_team);
  }

  if (input.notes !== undefined) {
    payload.notes = normalizeOptionalText(input.notes);
  } else if (input.description !== undefined) {
    payload.notes = normalizeOptionalText(input.description);
  }

  if (input.status !== undefined) {
    payload.status = input.status;
  }

  return payload;
}

function buildCalendarSyncPayload(
  current: CalendarEventRow | null,
  currentInstallation: InstallationEventRow,
  input: UpdateInstallationInput
): Partial<Pick<
  CalendarEventRow,
  "starts_at" | "ends_at" | "timezone" | "title" | "description" | "status"
>> {
  const payload: Partial<Pick<
    CalendarEventRow,
    "starts_at" | "ends_at" | "timezone" | "title" | "description" | "status"
  >> = {};

  if (input.scheduled_start_at !== undefined) {
    payload.starts_at = normalizeRequiredText(
      input.scheduled_start_at,
      "scheduled_start_at"
    );
  }

  if (input.scheduled_end_at !== undefined) {
    payload.ends_at = normalizeRequiredText(
      input.scheduled_end_at,
      "scheduled_end_at"
    );
  }

  if (input.timezone !== undefined) {
    payload.timezone = normalizeOptionalText(input.timezone) ?? currentInstallation.timezone;
  }

  if (input.title !== undefined) {
    const normalizedTitle = normalizeOptionalText(input.title);
    if (normalizedTitle) {
      payload.title = normalizedTitle;
    }
  } else if (current?.title) {
    payload.title = current.title;
  } else {
    payload.title = `${currentInstallation.deal_id} ?ㅼ튂 ?쇱젙`;
  }

  const nextLocation =
    input.location !== undefined ? input.location : currentInstallation.location;
  const nextNotes =
    input.notes !== undefined
      ? input.notes
      : input.description !== undefined
      ? input.description
      : currentInstallation.notes;
  payload.description = composeInstallationCalendarDescription(nextLocation, nextNotes);

  if (input.status !== undefined) {
    payload.status = input.status === "cancelled" ? "cancelled" : input.status === "completed" ? "completed" : "active";
  }

  return payload;
}

export async function updateInstallationForPartnerAccount(
  context: PartnerAccountContext,
  installationId: string,
  input: UpdateInstallationInput
) {
  const partnerAccountId = ensurePartnerAccountId(context);
  const currentInstallation = await getInstallationForPartnerAccount(
    partnerAccountId,
    installationId
  );
  const currentCalendarEvent = await getCalendarEventForInstallation(
    partnerAccountId,
    installationId
  );
  const supabase = createSupabaseAdminClient();
  const installationPayload = buildInstallationUpdatePayload(
    currentInstallation,
    input
  );

  if (Object.keys(installationPayload).length === 0) {
    throw new Error("No installation fields provided");
  }

  const { data, error } = await supabase
    .from("installation_events")
    .update(installationPayload)
    .eq("id", installationId)
    .eq("partner_account_id", partnerAccountId)
    .select("*")
    .single();

  if (error) {
    throw error;
  }

  const installation = data as InstallationEventRow;
  const calendarPayload = buildCalendarSyncPayload(
    currentCalendarEvent,
    currentInstallation,
    input
  );
  let calendarEvent: CalendarEventRow | null = currentCalendarEvent;

  if (currentCalendarEvent) {
    const { data: calendarData, error: calendarError } = await supabase
      .from("calendar_events")
      .update(calendarPayload)
      .eq("id", currentCalendarEvent.id)
      .eq("partner_account_id", partnerAccountId)
      .select("*")
      .single();

    if (calendarError) {
      throw calendarError;
    }

    calendarEvent = calendarData as CalendarEventRow;
  }

  await writeActivityLog({
    partner_account_id: partnerAccountId,
    customer_id: installation.customer_id,
    deal_id: installation.deal_id,
    actor_user_id: context.userId,
    actor_role: "partner",
    action_type:
      input.status === "cancelled"
        ? "installation_cancelled"
        : "installation_updated",
    target_type: "installation_event",
    target_id: installation.id,
    summary:
      input.status === "cancelled"
        ? `${installation.deal_id} 설치 일정이 취소됨`
        : `${installation.deal_id} 설치 일정이 수정됨`,
    before_json: currentInstallation as unknown as Record<string, unknown>,
    after_json: {
      installation: installation as unknown as Record<string, unknown>,
      calendar_event: calendarEvent
        ? (calendarEvent as unknown as Record<string, unknown>)
        : null,
    },
  });

  return {
    installation,
    calendarEvent,
  } satisfies UpdateInstallationResult;
}

export async function cancelInstallationForPartnerAccount(
  context: PartnerAccountContext,
  installationId: string
) {
  return updateInstallationForPartnerAccount(context, installationId, {
    status: "cancelled",
  });
}

export async function createInstallationForPartnerAccount(
  context: PartnerAccountContext,
  input: CreateInstallationInput
) {
  const partnerAccountId = ensurePartnerAccountId(context);
  const deal = await getDealForPartnerAccount(partnerAccountId, input.deal_id);
  const supabase = createSupabaseAdminClient();

  const installationPayload: InsertInstallationEvent = {
    partner_account_id: partnerAccountId,
    customer_id: deal.customer_id,
    deal_id: deal.id,
    scheduled_start_at: normalizeRequiredText(
      input.scheduled_start_at,
      "scheduled_start_at"
    ),
    scheduled_end_at: normalizeRequiredText(
      input.scheduled_end_at,
      "scheduled_end_at"
    ),
    timezone: normalizeOptionalText(input.timezone) ?? "Asia/Seoul",
    location: normalizeOptionalText(input.location),
    assigned_team: normalizeOptionalText(input.assigned_team),
    status: "planned",
    created_by_role: "partner",
    notes: normalizeOptionalText(input.notes),
    created_by: context.userId,
  };

  const { data: installationData, error: installationError } = await supabase
    .from("installation_events")
    .insert(installationPayload)
    .select("*")
    .single();

  if (installationError) {
    throw installationError;
  }

  const installation = installationData as InstallationEventRow;
  const eventPayload: InsertCalendarEvent = {
    partner_account_id: partnerAccountId,
    customer_id: deal.customer_id,
    deal_id: deal.id,
    source_type: "installation",
    source_id: installation.id,
    starts_at: installation.scheduled_start_at,
    ends_at: installation.scheduled_end_at,
    timezone: installation.timezone,
    title:
      normalizeOptionalText(input.title) ?? `${deal.title} 설치 일정`,
    description: composeInstallationCalendarDescription(
      installation.location,
      installation.notes
    ),
    status: "active",
    created_by: context.userId,
  };

  const { data: calendarData, error: calendarError } = await supabase
    .from("calendar_events")
    .insert(eventPayload)
    .select("*")
    .single();

  if (calendarError) {
    throw calendarError;
  }

  const calendarEvent = calendarData as CalendarEventRow;

  await writeActivityLog({
    partner_account_id: partnerAccountId,
    customer_id: deal.customer_id,
    deal_id: deal.id,
    actor_user_id: context.userId,
    actor_role: "partner",
    action_type: "installation_scheduled",
    target_type: "installation_event",
    target_id: installation.id,
    summary: `${deal.title} 설치 일정이 등록됨`,
    before_json: null,
    after_json: {
      installation_id: installation.id,
      calendar_event_id: calendarEvent.id,
      starts_at: installation.scheduled_start_at,
      ends_at: installation.scheduled_end_at,
    },
  });

  return { installation, calendarEvent };
}
