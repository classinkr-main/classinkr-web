"server-only";

import { randomUUID } from "node:crypto";

import type { PartnerAccountContext } from "@/lib/partner-portal/context";
import { listCustomerListItems } from "@/lib/partner-portal/repositories/customers";
import { listDealListItems } from "@/lib/partner-portal/repositories/deals";
import type { CustomerListItem, DealListItem } from "@/lib/partner-portal/types";

import type {
  PartnerAiActionContext,
  PartnerAiActionPlan,
  PartnerAiChannel,
  PartnerAiIntent,
  PartnerAiTargetCandidate,
} from "./types";

type BuildPartnerActionPlanInput = {
  raw_input: string;
  channel?: PartnerAiChannel;
  context?: Partial<PartnerAiActionContext>;
};

const DEFAULT_CONTEXT: PartnerAiActionContext = {
  screen: "home",
  selected_date: null,
  selected_customer_id: null,
  selected_deal_id: null,
  timezone: "Asia/Seoul",
};

function normalizeText(value: string) {
  return value.toLowerCase().replace(/[\s"'`~!@#$%^&*()_+\-=[\]{};:,.<>/?\\|]/g, "");
}

function tokenizeSearch(value: string) {
  return value
    .toLowerCase()
    .split(/[\s,./\-_:;|()[\]]+/)
    .map((token) => token.trim())
    .filter((token) => token.length >= 2 && !/^\d+$/.test(token));
}

function toDateKey(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);

  const year = parts.find((part) => part.type === "year")?.value ?? "1970";
  const month = parts.find((part) => part.type === "month")?.value ?? "01";
  const day = parts.find((part) => part.type === "day")?.value ?? "01";

  return `${year}-${month}-${day}`;
}

function addDays(dateKey: string, amount: number) {
  const [year, month, day] = dateKey.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + amount);
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(
    date.getUTCDate()
  ).padStart(2, "0")}`;
}

function buildOffsetDateTime(
  dateKey: string,
  hour: number,
  minute = 0,
  timeZone = "Asia/Seoul"
) {
  const offset = timeZone === "Asia/Seoul" ? "+09:00" : "Z";
  return `${dateKey}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00${offset}`;
}

function parseTimeToken(raw: string) {
  const match = raw.match(/(오전|오후)?\s*(\d{1,2})(?:[:시]\s*(\d{1,2}))?\s*(?:분|반|시)?/);
  if (!match) return null;

  let hour = Number(match[2]);
  const minuteRaw = match[3] ?? (raw.includes("반") ? "30" : "0");
  const minute = Number(minuteRaw);
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return null;

  if (match[1] === "오후" && hour < 12) hour += 12;
  if (match[1] === "오전" && hour === 12) hour = 0;

  return { hour, minute };
}

function extractDateKey(text: string, context: PartnerAiActionContext) {
  const explicit = text.match(/(\d{4})[./-](\d{1,2})[./-](\d{1,2})/);
  if (explicit) {
    return `${explicit[1]}-${String(Number(explicit[2])).padStart(2, "0")}-${String(
      Number(explicit[3])
    ).padStart(2, "0")}`;
  }

  const shortDate = text.match(/(\d{1,2})월\s*(\d{1,2})일/);
  if (shortDate) {
    const baseDate = context.selected_date ?? toDateKey(new Date(), context.timezone);
    return `${baseDate.slice(0, 4)}-${String(Number(shortDate[1])).padStart(2, "0")}-${String(
      Number(shortDate[2])
    ).padStart(2, "0")}`;
  }

  const baseDate = context.selected_date ?? toDateKey(new Date(), context.timezone);
  if (text.includes("모레")) return addDays(baseDate, 2);
  if (text.includes("내일")) return addDays(baseDate, 1);
  if (text.includes("오늘")) return baseDate;
  return context.selected_date ?? null;
}

function extractAmount(text: string) {
  const millionMatch = text.match(/(\d+(?:\.\d+)?)\s*만\s*원?/);
  if (millionMatch) {
    return Math.round(Number(millionMatch[1]) * 10000);
  }

  const numeric = text.match(/(\d[\d,]{4,})\s*원?/);
  if (numeric) {
    return Number(numeric[1].replace(/,/g, ""));
  }

  return null;
}

function candidateScore(input: string, fields: string[]) {
  const normalizedInput = normalizeText(input);
  const tokens = tokenizeSearch(input);
  let score = 0;

  for (const field of fields) {
    const normalizedField = normalizeText(field);
    if (!normalizedField) continue;

    if (normalizedInput.includes(normalizedField)) {
      score = Math.max(score, 0.9);
    }

    for (const token of tokens) {
      if (normalizedField.includes(normalizeText(token))) {
        score += Math.min(0.18, token.length / 20);
      }
    }
  }

  return Math.min(score, 0.98);
}

function resolveCustomerCandidates(
  rawInput: string,
  customers: CustomerListItem[],
  selectedCustomerId?: string | null
) {
  return customers
    .map((item) => {
      const label = [
        item.customer.name,
        item.customer.region_label,
        item.customer.campus_name,
      ]
        .filter(Boolean)
        .join(" / ");

      let score = candidateScore(rawInput, [
        item.customer.name,
        item.customer.region_label ?? "",
        item.customer.campus_name ?? "",
      ]);

      if (selectedCustomerId && item.customer.id === selectedCustomerId) {
        score = Math.max(score, 0.92);
      }

      return {
        id: item.customer.id,
        label,
        score,
        entity_type: "customer" as const,
      };
    })
    .filter((candidate) => candidate.score > 0)
    .sort((left, right) => right.score - left.score)
    .slice(0, 5);
}

function resolveDealCandidates(
  rawInput: string,
  deals: DealListItem[],
  selectedDealId?: string | null
) {
  return deals
    .map((deal) => {
      let score = candidateScore(rawInput, [
        deal.title,
        deal.customer_name ?? "",
        deal.customer_campus_name ?? "",
        deal.deal_code,
      ]);

      if (selectedDealId && deal.id === selectedDealId) {
        score = Math.max(score, 0.92);
      }

      return {
        id: deal.id,
        label: [deal.customer_name, deal.title].filter(Boolean).join(" / "),
        score,
        entity_type: "deal" as const,
      };
    })
    .filter((candidate) => candidate.score > 0)
    .sort((left, right) => right.score - left.score)
    .slice(0, 5);
}

function inferIntent(rawInput: string, screen: PartnerAiActionContext["screen"]): PartnerAiIntent {
  const text = rawInput.toLowerCase();

  if (
    text.includes("연락처") ||
    text.includes("전화") ||
    text.includes("이메일") ||
    text.includes("담당자") ||
    text.includes("주소")
  ) {
    return "update_customer";
  }

  if (text.includes("설치")) {
    return "create_installation";
  }

  if (text.includes("미팅") || text.includes("회의") || text.includes("상담 일정")) {
    return "create_meeting";
  }

  if (text.includes("거래") || text.includes("컨택") || text.includes("견적") || text.includes("추가")) {
    return "create_deal";
  }

  if (screen === "calendar") return "create_meeting";
  if (screen === "workspace") return "create_deal";
  return "unknown";
}

function choosePrimaryCandidate(candidates: PartnerAiTargetCandidate[]) {
  if (candidates.length === 0) return null;
  if (candidates.length === 1) return candidates[0];
  if (candidates[0].score - candidates[1].score >= 0.2) return candidates[0];
  return null;
}

function extractCustomerUpdates(rawInput: string) {
  const updates: Record<string, unknown> = {};
  const emailMatch = rawInput.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
  if (emailMatch) updates.email = emailMatch[0];

  const phoneMatch = rawInput.match(/(01\d|0\d{1,2})-?\d{3,4}-?\d{4}/);
  if (phoneMatch) updates.phone = phoneMatch[0];

  const contactMatch = rawInput.match(/담당자\s*[:은는]?\s*([가-힣A-Za-z]{2,20})/);
  if (contactMatch) updates.contact_name = contactMatch[1];

  const addressMatch = rawInput.match(/주소\s*[:은는]?\s*(.+)$/);
  if (addressMatch) updates.address = addressMatch[1].trim();

  return updates;
}

function buildMissingFields(intent: PartnerAiIntent, proposedFields: Record<string, unknown>) {
  const missingFields: string[] = [];

  if (intent === "create_deal") {
    if (!proposedFields.customer_id) missingFields.push("customer_id");
    if (!proposedFields.title) missingFields.push("title");
  }

  if (intent === "create_meeting") {
    if (!proposedFields.deal_id) missingFields.push("deal_id");
    if (!proposedFields.starts_at) missingFields.push("starts_at");
    if (!proposedFields.ends_at) missingFields.push("ends_at");
    if (!proposedFields.title) missingFields.push("title");
  }

  if (intent === "create_installation") {
    if (!proposedFields.deal_id) missingFields.push("deal_id");
    if (!proposedFields.scheduled_start_at) missingFields.push("scheduled_start_at");
    if (!proposedFields.scheduled_end_at) missingFields.push("scheduled_end_at");
  }

  if (intent === "update_customer") {
    if (!proposedFields.customer_id) missingFields.push("customer_id");
    if (!proposedFields.fields || Object.keys((proposedFields.fields as Record<string, unknown>) ?? {}).length === 0) {
      missingFields.push("fields");
    }
  }

  return missingFields;
}

function buildMeetingFields(
  rawInput: string,
  context: PartnerAiActionContext,
  primaryDeal: PartnerAiTargetCandidate | null,
  deals: DealListItem[]
) {
  const dateKey = extractDateKey(rawInput, context);
  const time =
    parseTimeToken(rawInput.match(/(오전|오후)?\s*\d{1,2}(?::\d{1,2})?\s*(?:분|반|시)?/)?.[0] ?? "") ??
    (context.selected_date ? { hour: 10, minute: 0 } : null);
  const deal = deals.find((item) => item.id === primaryDeal?.id);

  if (!dateKey || !time) {
    return {
      deal_id: primaryDeal?.id ?? null,
      title: deal ? `${deal.title} 미팅` : "미팅 일정",
      starts_at: null,
      ends_at: null,
      timezone: context.timezone,
      location: null,
      description: rawInput,
    };
  }

  return {
    deal_id: primaryDeal?.id ?? null,
    title: deal ? `${deal.title} 미팅` : "미팅 일정",
    starts_at: buildOffsetDateTime(dateKey, time.hour, time.minute, context.timezone),
    ends_at: buildOffsetDateTime(dateKey, time.hour + 1, time.minute, context.timezone),
    timezone: context.timezone,
    location: null,
    description: rawInput,
  };
}

function buildInstallationFields(
  rawInput: string,
  context: PartnerAiActionContext,
  primaryDeal: PartnerAiTargetCandidate | null,
  deals: DealListItem[]
) {
  const dateKey = extractDateKey(rawInput, context);
  const startTime =
    parseTimeToken(rawInput.match(/(오전|오후)?\s*\d{1,2}(?::\d{1,2})?\s*(?:분|반|시)?/)?.[0] ?? "") ??
    (context.selected_date ? { hour: 9, minute: 0 } : null);
  const deal = deals.find((item) => item.id === primaryDeal?.id);

  if (!dateKey || !startTime) {
    return {
      deal_id: primaryDeal?.id ?? null,
      title: deal ? `${deal.title} 설치 일정` : "설치 일정",
      scheduled_start_at: null,
      scheduled_end_at: null,
      timezone: context.timezone,
      location: null,
      assigned_team: null,
      notes: rawInput,
    };
  }

  return {
    deal_id: primaryDeal?.id ?? null,
    title: deal ? `${deal.title} 설치 일정` : "설치 일정",
    scheduled_start_at: buildOffsetDateTime(dateKey, startTime.hour, startTime.minute, context.timezone),
    scheduled_end_at: buildOffsetDateTime(dateKey, startTime.hour + 9, startTime.minute, context.timezone),
    timezone: context.timezone,
    location: null,
    assigned_team: null,
    notes: rawInput,
  };
}

export async function buildPartnerActionPlan(
  context: PartnerAccountContext,
  input: BuildPartnerActionPlanInput
): Promise<PartnerAiActionPlan> {
  if (!context.partnerAccountId) {
    throw new Error("Partner V2 account context is required");
  }

  const actionContext: PartnerAiActionContext = {
    ...DEFAULT_CONTEXT,
    ...input.context,
    selected_date: input.context?.selected_date ?? null,
    selected_customer_id: input.context?.selected_customer_id ?? null,
    selected_deal_id: input.context?.selected_deal_id ?? null,
    timezone: input.context?.timezone ?? DEFAULT_CONTEXT.timezone,
  };

  const rawInput = input.raw_input.trim();
  const [customers, deals] = await Promise.all([
    listCustomerListItems(context.partnerAccountId),
    listDealListItems({ partnerAccountId: context.partnerAccountId }),
  ]);

  const intent = inferIntent(rawInput, actionContext.screen);
  const warnings: string[] = [];
  let targetCandidates: PartnerAiTargetCandidate[] = [];
  let proposedFields: Record<string, unknown> = {};
  let confidence = intent === "unknown" ? 0.2 : 0.7;

  if (intent === "create_deal") {
    targetCandidates = resolveCustomerCandidates(
      rawInput,
      customers,
      actionContext.selected_customer_id
    );
    const primaryCustomer = choosePrimaryCandidate(targetCandidates);
    const amount = extractAmount(rawInput);
    proposedFields = {
      customer_id: primaryCustomer?.id ?? actionContext.selected_customer_id ?? null,
      title: rawInput.replace(/\d+(?:\.\d+)?\s*만\s*원?/g, "").trim() || rawInput,
      expected_amount: amount,
      notes: rawInput,
    };
    if (targetCandidates.length > 1 && !primaryCustomer) {
      warnings.push("고객 후보가 여러 건이라 워크스페이스에서 고객을 먼저 선택하면 더 정확합니다.");
      confidence = 0.58;
    } else {
      confidence = primaryCustomer ? Math.max(confidence, primaryCustomer.score) : confidence;
    }
  }

  if (intent === "create_meeting") {
    targetCandidates = resolveDealCandidates(rawInput, deals, actionContext.selected_deal_id);
    const primaryDeal = choosePrimaryCandidate(targetCandidates);
    proposedFields = buildMeetingFields(rawInput, actionContext, primaryDeal, deals);
    if (targetCandidates.length > 1 && !primaryDeal) {
      warnings.push("거래 후보가 여러 건이라 워크스페이스에서 거래를 먼저 선택하면 더 정확합니다.");
      confidence = 0.56;
    } else {
      confidence = primaryDeal ? Math.max(confidence, primaryDeal.score) : confidence;
    }
  }

  if (intent === "create_installation") {
    targetCandidates = resolveDealCandidates(rawInput, deals, actionContext.selected_deal_id);
    const primaryDeal = choosePrimaryCandidate(targetCandidates);
    proposedFields = buildInstallationFields(rawInput, actionContext, primaryDeal, deals);
    if (targetCandidates.length > 1 && !primaryDeal) {
      warnings.push("설치 대상 거래 후보가 여러 건입니다. 거래를 먼저 선택한 뒤 다시 시도해 주세요.");
      confidence = 0.55;
    } else {
      confidence = primaryDeal ? Math.max(confidence, primaryDeal.score) : confidence;
    }
  }

  if (intent === "update_customer") {
    targetCandidates = resolveCustomerCandidates(
      rawInput,
      customers,
      actionContext.selected_customer_id
    );
    const primaryCustomer = choosePrimaryCandidate(targetCandidates);
    proposedFields = {
      customer_id: primaryCustomer?.id ?? actionContext.selected_customer_id ?? null,
      fields: extractCustomerUpdates(rawInput),
    };
    if (targetCandidates.length > 1 && !primaryCustomer) {
      warnings.push("고객 후보가 여러 건이라 먼저 고객을 특정해 주세요.");
      confidence = 0.52;
    } else {
      confidence = primaryCustomer ? Math.max(confidence, primaryCustomer.score) : confidence;
    }
  }

  if (intent === "unknown") {
    warnings.push("요청을 create_deal, create_meeting, create_installation, update_customer 중 하나로 분류하지 못했습니다.");
  }

  const missingFields = buildMissingFields(intent, proposedFields);

  return {
    request_id: randomUUID(),
    channel: input.channel ?? "text",
    raw_input: rawInput,
    context: actionContext,
    intent,
    confidence: Number(confidence.toFixed(2)),
    target_entity_type:
      intent === "create_deal" || intent === "update_customer"
        ? "customer"
        : intent === "create_meeting" || intent === "create_installation"
          ? "deal"
          : null,
    target_candidates: targetCandidates,
    proposed_fields: proposedFields,
    missing_fields: missingFields,
    warnings,
    requires_confirmation: true,
  };
}
