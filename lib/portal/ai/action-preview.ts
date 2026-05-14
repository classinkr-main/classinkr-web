"server-only";

import { createHmac, timingSafeEqual } from "node:crypto";

import type { PartnerAccountContext } from "@/lib/portal/context";
import { getCustomerDetailForPartnerAccount } from "@/lib/portal/repositories/customers";
import { getDealDetailForPartnerAccount } from "@/lib/portal/repositories/deals";

import type { PartnerAiActionPlan, PartnerAiActionPreview, PartnerAiIntent } from "./types";

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((item) => stableStringify(item)).join(",")}]`;

  const entries = Object.entries(value as Record<string, unknown>).sort(([left], [right]) =>
    left.localeCompare(right)
  );
  return `{${entries
    .map(([key, entryValue]) => `${JSON.stringify(key)}:${stableStringify(entryValue)}`)
    .join(",")}}`;
}

function getSigningSecret() {
  return (
    process.env.PARTNER_AI_ACTION_SECRET ??
    process.env.NEXT_PUBLIC_SITE_URL ??
    "partner-ai-action-secret"
  );
}

function signPreviewPayload(requestId: string, intent: PartnerAiIntent, finalPayload: Record<string, unknown>) {
  const canonical = stableStringify({
    request_id: requestId,
    intent,
    final_payload: finalPayload,
  });
  const signature = createHmac("sha256", getSigningSecret()).update(canonical).digest("hex");
  return `${Buffer.from(canonical).toString("base64url")}.${signature}`;
}

export function verifyPreviewToken(
  token: string,
  requestId: string,
  intent: PartnerAiIntent,
  finalPayload: Record<string, unknown>
) {
  const [encodedPayload, providedSignature] = token.split(".");
  if (!encodedPayload || !providedSignature) return false;

  const canonical = stableStringify({
    request_id: requestId,
    intent,
    final_payload: finalPayload,
  });

  if (Buffer.from(canonical).toString("base64url") !== encodedPayload) {
    return false;
  }

  const expectedSignature = createHmac("sha256", getSigningSecret()).update(canonical).digest("hex");

  if (providedSignature.length !== expectedSignature.length) {
    return false;
  }

  return timingSafeEqual(Buffer.from(providedSignature), Buffer.from(expectedSignature));
}

function createCreationDiff(finalPayload: Record<string, unknown>) {
  return Object.entries(finalPayload)
    .filter(([, value]) => value !== null && value !== undefined && value !== "")
    .map(([field, value]) => ({
      field,
      before: null,
      after: value,
    }));
}

export async function buildPartnerActionPreview(
  context: PartnerAccountContext,
  plan: PartnerAiActionPlan
): Promise<PartnerAiActionPreview> {
  if (!context.partnerAccountId) {
    throw new Error("Partner V2 account context is required");
  }

  if (plan.intent === "unknown") {
    return {
      request_id: plan.request_id,
      intent: plan.intent,
      summary: "요청을 실행 가능한 액션으로 정리하지 못했습니다.",
      target_label: null,
      final_payload: {},
      diff: [],
      missing_fields: plan.missing_fields,
      warnings: plan.warnings,
      can_execute: false,
      confirmation_token: null,
    };
  }

  if (plan.missing_fields.length > 0) {
    return {
      request_id: plan.request_id,
      intent: plan.intent,
      summary: "필수 정보가 더 필요합니다.",
      target_label: plan.target_candidates[0]?.label ?? null,
      final_payload: plan.proposed_fields,
      diff: createCreationDiff(plan.proposed_fields),
      missing_fields: plan.missing_fields,
      warnings: plan.warnings,
      can_execute: false,
      confirmation_token: null,
    };
  }

  if (plan.intent === "create_deal") {
    const customerId = String(plan.proposed_fields.customer_id ?? "");
    const customerDetail = await getCustomerDetailForPartnerAccount(customerId, context.partnerAccountId);
    const finalPayload = {
      customer_id: customerId,
      title: String(plan.proposed_fields.title ?? ""),
      expected_amount: plan.proposed_fields.expected_amount ?? null,
      notes: plan.proposed_fields.notes ?? null,
      starts_at: plan.proposed_fields.starts_at ?? null,
    };

    return {
      request_id: plan.request_id,
      intent: plan.intent,
      summary: `${customerDetail?.customer.name ?? "선택 고객"}에 새 거래를 생성합니다.`,
      target_label: customerDetail?.customer.name ?? null,
      final_payload: finalPayload,
      diff: createCreationDiff(finalPayload),
      missing_fields: [],
      warnings: plan.warnings,
      can_execute: true,
      confirmation_token: signPreviewPayload(plan.request_id, plan.intent, finalPayload),
    };
  }

  if (plan.intent === "create_meeting") {
    const dealId = String(plan.proposed_fields.deal_id ?? "");
    const detail = await getDealDetailForPartnerAccount(dealId, context.partnerAccountId);
    const finalPayload = {
      deal_id: dealId,
      title: String(plan.proposed_fields.title ?? ""),
      starts_at: String(plan.proposed_fields.starts_at ?? ""),
      ends_at: String(plan.proposed_fields.ends_at ?? ""),
      timezone: String(plan.proposed_fields.timezone ?? plan.context.timezone),
      location: plan.proposed_fields.location ?? null,
      description: plan.proposed_fields.description ?? null,
    };

    return {
      request_id: plan.request_id,
      intent: plan.intent,
      summary: `${detail?.deal.title ?? "선택 거래"}에 미팅 일정을 추가합니다.`,
      target_label: detail?.deal.title ?? null,
      final_payload: finalPayload,
      diff: createCreationDiff(finalPayload),
      missing_fields: [],
      warnings: plan.warnings,
      can_execute: true,
      confirmation_token: signPreviewPayload(plan.request_id, plan.intent, finalPayload),
    };
  }

  if (plan.intent === "create_installation") {
    const dealId = String(plan.proposed_fields.deal_id ?? "");
    const detail = await getDealDetailForPartnerAccount(dealId, context.partnerAccountId);
    const finalPayload = {
      deal_id: dealId,
      title: String(plan.proposed_fields.title ?? ""),
      scheduled_start_at: String(plan.proposed_fields.scheduled_start_at ?? ""),
      scheduled_end_at: String(plan.proposed_fields.scheduled_end_at ?? ""),
      timezone: String(plan.proposed_fields.timezone ?? plan.context.timezone),
      location: plan.proposed_fields.location ?? null,
      assigned_team: plan.proposed_fields.assigned_team ?? null,
      notes: plan.proposed_fields.notes ?? null,
    };

    return {
      request_id: plan.request_id,
      intent: plan.intent,
      summary: `${detail?.deal.title ?? "선택 거래"}에 설치 일정을 추가합니다.`,
      target_label: detail?.deal.title ?? null,
      final_payload: finalPayload,
      diff: createCreationDiff(finalPayload),
      missing_fields: [],
      warnings: plan.warnings,
      can_execute: true,
      confirmation_token: signPreviewPayload(plan.request_id, plan.intent, finalPayload),
    };
  }

  if (plan.intent === "update_customer") {
    const customerId = String(plan.proposed_fields.customer_id ?? "");
    const customerDetail = await getCustomerDetailForPartnerAccount(customerId, context.partnerAccountId);
    const fields = (plan.proposed_fields.fields ?? {}) as Record<string, unknown>;
    const finalPayload = {
      customer_id: customerId,
      fields,
    };
    const customer = customerDetail?.customer ?? null;
    const diff = Object.entries(fields).map(([field, value]) => ({
      field,
      before: customer ? ((customer as unknown as Record<string, unknown>)[field] ?? null) : null,
      after: value,
    }));

    return {
      request_id: plan.request_id,
      intent: plan.intent,
      summary: `${customer?.name ?? "선택 고객"}의 고객 정보를 수정합니다.`,
      target_label: customer?.name ?? null,
      final_payload: finalPayload,
      diff,
      missing_fields: [],
      warnings: plan.warnings,
      can_execute: true,
      confirmation_token: signPreviewPayload(plan.request_id, plan.intent, finalPayload),
    };
  }

  return {
    request_id: plan.request_id,
    intent: plan.intent,
    summary: "미리보기를 만들지 못했습니다.",
    target_label: null,
    final_payload: {},
    diff: [],
    missing_fields: plan.missing_fields,
    warnings: plan.warnings,
    can_execute: false,
    confirmation_token: null,
  };
}
