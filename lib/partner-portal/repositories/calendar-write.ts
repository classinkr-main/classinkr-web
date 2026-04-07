"server-only";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type {
  CalendarEventRow,
  DealRow,
  InsertCalendarEvent,
} from "@/lib/supabase/database.types.v2";
import type { PartnerAccountContext } from "@/lib/partner-portal/context";
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

  const event = data as CalendarEventRow;

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
