"server-only";

import type { PartnerAccountContext } from "@/lib/portal/context";
import { createMeetingEventForPartnerAccount } from "@/lib/portal/repositories/calendar-write";
import { updateCustomerForPartnerAccount } from "@/lib/portal/repositories/customers-write";
import { createDealForPartnerAccount } from "@/lib/portal/repositories/deals-write";
import { createInstallationForPartnerAccount } from "@/lib/portal/repositories/installations-write";

import { verifyPreviewToken } from "./action-preview";
import type { PartnerAiExecuteResult, PartnerAiIntent } from "./types";

export async function executePartnerAction(
  context: PartnerAccountContext,
  input: {
    request_id: string;
    intent: PartnerAiIntent;
    final_payload: Record<string, unknown>;
    confirmation_token: string;
  }
): Promise<PartnerAiExecuteResult> {
  if (!context.partnerAccountId) {
    throw new Error("Partner V2 account context is required");
  }

  const isValidToken = verifyPreviewToken(
    input.confirmation_token,
    input.request_id,
    input.intent,
    input.final_payload
  );

  if (!isValidToken) {
    throw new Error("Invalid confirmation token");
  }

  if (input.intent === "create_deal") {
    const result = await createDealForPartnerAccount(context, {
      customer_id: String(input.final_payload.customer_id ?? ""),
      title: String(input.final_payload.title ?? ""),
      expected_amount: input.final_payload.expected_amount as number | string | null | undefined,
      notes: (input.final_payload.notes as string | null | undefined) ?? null,
      starts_at: (input.final_payload.starts_at as string | null | undefined) ?? null,
    });

    return {
      request_id: input.request_id,
      result_type: "deal_created",
      entity_ids: {
        deal_id: result.deal.id,
        customer_id: result.customer.id,
      },
      success_message: `${result.customer.name} 거래가 생성되었습니다.`,
      refresh_hints: ["overview", "workspace"],
    };
  }

  if (input.intent === "create_meeting") {
    const event = await createMeetingEventForPartnerAccount(context, {
      deal_id: String(input.final_payload.deal_id ?? ""),
      title: String(input.final_payload.title ?? ""),
      starts_at: String(input.final_payload.starts_at ?? ""),
      ends_at: String(input.final_payload.ends_at ?? ""),
      timezone: (input.final_payload.timezone as string | null | undefined) ?? null,
      location: (input.final_payload.location as string | null | undefined) ?? null,
      description: (input.final_payload.description as string | null | undefined) ?? null,
    });

    return {
      request_id: input.request_id,
      result_type: "meeting_created",
      entity_ids: {
        calendar_event_id: event.id,
        deal_id: event.deal_id,
      },
      success_message: `${event.title} 일정이 생성되었습니다.`,
      refresh_hints: ["calendar", "workspace", "overview"],
    };
  }

  if (input.intent === "create_installation") {
    const result = await createInstallationForPartnerAccount(context, {
      deal_id: String(input.final_payload.deal_id ?? ""),
      title: (input.final_payload.title as string | null | undefined) ?? null,
      scheduled_start_at: String(input.final_payload.scheduled_start_at ?? ""),
      scheduled_end_at: String(input.final_payload.scheduled_end_at ?? ""),
      timezone: (input.final_payload.timezone as string | null | undefined) ?? null,
      location: (input.final_payload.location as string | null | undefined) ?? null,
      assigned_team: (input.final_payload.assigned_team as string | null | undefined) ?? null,
      notes: (input.final_payload.notes as string | null | undefined) ?? null,
    });

    return {
      request_id: input.request_id,
      result_type: "installation_created",
      entity_ids: {
        installation_id: result.installation.id,
        calendar_event_id: result.calendarEvent.id,
        deal_id: result.installation.deal_id,
      },
      success_message: `${result.calendarEvent.title} 설치 일정이 생성되었습니다.`,
      refresh_hints: ["calendar", "workspace", "overview"],
    };
  }

  if (input.intent === "update_customer") {
    const fields = (input.final_payload.fields ?? {}) as Parameters<
      typeof updateCustomerForPartnerAccount
    >[2];

    const customer = await updateCustomerForPartnerAccount(
      context,
      String(input.final_payload.customer_id ?? ""),
      fields
    );

    return {
      request_id: input.request_id,
      result_type: "customer_updated",
      entity_ids: {
        customer_id: customer.id,
      },
      success_message: `${customer.name} 고객 정보가 수정되었습니다.`,
      refresh_hints: ["overview", "workspace"],
    };
  }

  throw new Error("Unsupported AI action intent");
}
