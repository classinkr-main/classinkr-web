"server-only";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type {
  CustomerRow,
  DealRow,
  InsertDeal,
} from "@/lib/supabase/database.types.v2";
import type { PartnerAccountContext } from "@/lib/partner-portal/context";
import { writeActivityLog } from "@/lib/partner-portal/services/activity-log-write";
import {
  normalizeOptionalNumber,
  normalizeOptionalText,
  normalizeRequiredText,
} from "@/lib/partner-portal/services/mutation-utils";

export type CreatePartnerDealInput = {
  customer_id: string;
  title: string;
  expected_amount?: number | string | null;
  notes?: string | null;
  starts_at?: string | null;
};

function ensurePartnerAccountId(context: PartnerAccountContext) {
  if (!context.partnerAccountId) {
    throw new Error("Partner account context is required");
  }

  return context.partnerAccountId;
}

async function generateDealCode() {
  const supabase = createSupabaseAdminClient();
  const year = new Date().getFullYear();
  const prefix = `D-${year}-`;

  const { data, error } = await supabase
    .from("deals")
    .select("deal_code")
    .like("deal_code", `${prefix}%`)
    .order("deal_code", { ascending: false })
    .limit(25);

  if (error) {
    throw error;
  }

  const latestSequence = (data ?? []).reduce((maxValue, row) => {
    const match = row.deal_code?.match(/(\d+)$/);
    const sequence = match ? Number(match[1]) : 0;
    return Math.max(maxValue, sequence);
  }, 0);

  return `${prefix}${String(latestSequence + 1).padStart(3, "0")}`;
}

async function getCustomerForPartnerAccount(
  partnerAccountId: string,
  customerId: string
) {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("customers")
    .select("*")
    .eq("id", customerId)
    .eq("partner_account_id", partnerAccountId)
    .single();

  if (error || !data) {
    throw new Error("Customer not found");
  }

  return data as CustomerRow;
}

export async function createDealForPartnerAccount(
  context: PartnerAccountContext,
  input: CreatePartnerDealInput
) {
  const partnerAccountId = ensurePartnerAccountId(context);
  const customer = await getCustomerForPartnerAccount(partnerAccountId, input.customer_id);
  const dealCode = await generateDealCode();
  const supabase = createSupabaseAdminClient();

  const expectedAmount = normalizeOptionalNumber(input.expected_amount) ?? 0;
  const payload: InsertDeal = {
    partner_account_id: partnerAccountId,
    customer_id: customer.id,
    deal_code: dealCode,
    title: normalizeRequiredText(input.title, "title"),
    status: "active",
    current_stage: "contact",
    expected_amount: expectedAmount,
    contracted_amount: 0,
    installed_amount: 0,
    paid_amount: 0,
    outstanding_amount: 0,
    payment_status: "unpaid",
    starts_at: normalizeOptionalText(input.starts_at),
    closed_at: null,
    notes: normalizeOptionalText(input.notes),
    created_by: context.userId,
  };

  const { data, error } = await supabase
    .from("deals")
    .insert(payload)
    .select("*")
    .single();

  if (error) {
    throw error;
  }

  const deal = data as DealRow;

  await writeActivityLog({
    partner_account_id: partnerAccountId,
    customer_id: customer.id,
    deal_id: deal.id,
    actor_user_id: context.userId,
    actor_role: "partner",
    action_type: "deal_created",
    target_type: "deal",
    target_id: deal.id,
    summary: `${customer.name} / ${deal.title} 컨택 거래가 생성됨`,
    before_json: null,
    after_json: {
      deal_code: deal.deal_code,
      current_stage: deal.current_stage,
      expected_amount: deal.expected_amount,
    },
  });

  return { deal, customer };
}
