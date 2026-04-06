"server-only";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type {
  CalendarEventRow,
  DealRow,
  InsertCalendarEvent,
  InsertInstallationEvent,
  InstallationEventRow,
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
