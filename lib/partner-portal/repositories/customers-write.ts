"server-only";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type {
  CustomerRow,
  InsertCustomer,
  UpdateCustomer,
} from "@/lib/supabase/database.types.v2";
import type { PartnerAccountContext } from "@/lib/partner-portal/context";
import { writeActivityLog } from "@/lib/partner-portal/services/activity-log-write";
import {
  normalizeOptionalText,
  normalizeRequiredText,
} from "@/lib/partner-portal/services/mutation-utils";

export type CreatePartnerCustomerInput = {
  name: string;
  contact_name?: string | null;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
  business_number?: string | null;
  campus_name?: string | null;
  region_label?: string | null;
  notes?: string | null;
};

export type UpdatePartnerCustomerInput = Partial<CreatePartnerCustomerInput>;

function ensurePartnerAccountId(context: PartnerAccountContext) {
  if (!context.partnerAccountId) {
    throw new Error("Partner account context is required");
  }

  return context.partnerAccountId;
}

function mapCustomerInput(
  context: PartnerAccountContext,
  partnerAccountId: string,
  input: CreatePartnerCustomerInput
): InsertCustomer {
  return {
    partner_account_id: partnerAccountId,
    name: normalizeRequiredText(input.name, "name"),
    contact_name: normalizeOptionalText(input.contact_name),
    email: normalizeOptionalText(input.email),
    phone: normalizeOptionalText(input.phone),
    address: normalizeOptionalText(input.address),
    business_number: normalizeOptionalText(input.business_number),
    campus_name: normalizeOptionalText(input.campus_name),
    region_label: normalizeOptionalText(input.region_label),
    notes: normalizeOptionalText(input.notes),
    created_by: context.userId,
  };
}

function mapCustomerUpdate(input: UpdatePartnerCustomerInput): UpdateCustomer {
  return {
    ...(input.name !== undefined ? { name: normalizeRequiredText(input.name, "name") } : {}),
    ...(input.contact_name !== undefined
      ? { contact_name: normalizeOptionalText(input.contact_name) }
      : {}),
    ...(input.email !== undefined ? { email: normalizeOptionalText(input.email) } : {}),
    ...(input.phone !== undefined ? { phone: normalizeOptionalText(input.phone) } : {}),
    ...(input.address !== undefined ? { address: normalizeOptionalText(input.address) } : {}),
    ...(input.business_number !== undefined
      ? { business_number: normalizeOptionalText(input.business_number) }
      : {}),
    ...(input.campus_name !== undefined
      ? { campus_name: normalizeOptionalText(input.campus_name) }
      : {}),
    ...(input.region_label !== undefined
      ? { region_label: normalizeOptionalText(input.region_label) }
      : {}),
    ...(input.notes !== undefined ? { notes: normalizeOptionalText(input.notes) } : {}),
  };
}

export async function createCustomerForPartnerAccount(
  context: PartnerAccountContext,
  input: CreatePartnerCustomerInput
) {
  const partnerAccountId = ensurePartnerAccountId(context);
  const supabase = createSupabaseAdminClient();

  const { data, error } = await supabase
    .from("customers")
    .insert(mapCustomerInput(context, partnerAccountId, input))
    .select("*")
    .single();

  if (error) {
    throw error;
  }

  const customer = data as CustomerRow;

  await writeActivityLog({
    partner_account_id: partnerAccountId,
    customer_id: customer.id,
    deal_id: null,
    actor_user_id: context.userId,
    actor_role: "partner",
    action_type: "customer_created",
    target_type: "customer",
    target_id: customer.id,
    summary: `${customer.name} 고객이 생성됨`,
    before_json: null,
    after_json: {
      name: customer.name,
      contact_name: customer.contact_name,
      phone: customer.phone,
      region_label: customer.region_label,
    },
  });

  return customer;
}

export async function updateCustomerForPartnerAccount(
  context: PartnerAccountContext,
  customerId: string,
  input: UpdatePartnerCustomerInput
) {
  const partnerAccountId = ensurePartnerAccountId(context);
  const supabase = createSupabaseAdminClient();

  const { data: existing, error: existingError } = await supabase
    .from("customers")
    .select("*")
    .eq("id", customerId)
    .eq("partner_account_id", partnerAccountId)
    .single();

  if (existingError || !existing) {
    throw new Error("Customer not found");
  }

  const before = existing as CustomerRow;
  const { data, error } = await supabase
    .from("customers")
    .update(mapCustomerUpdate(input))
    .eq("id", customerId)
    .eq("partner_account_id", partnerAccountId)
    .select("*")
    .single();

  if (error) {
    throw error;
  }

  const customer = data as CustomerRow;

  await writeActivityLog({
    partner_account_id: partnerAccountId,
    customer_id: customer.id,
    deal_id: null,
    actor_user_id: context.userId,
    actor_role: "partner",
    action_type: "customer_updated",
    target_type: "customer",
    target_id: customer.id,
    summary: `${customer.name} 고객 정보가 수정됨`,
    before_json: before,
    after_json: customer,
  });

  return customer;
}
