"server-only";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { InsertCustomer, UpdateCustomer } from "@/lib/supabase/database.types.v2";
import type {
  ActivityLog,
  CalendarEvent,
  Customer,
  CustomerDealHistoryItem,
  CustomerDealSummary,
  CustomerDetailPayload,
  CustomerListItem,
} from "@/lib/partner-portal/types";

export async function listCustomers(partnerAccountId?: string): Promise<Customer[]> {
  const supabase = createSupabaseAdminClient();

  let query = supabase
    .from("customers")
    .select("*")
    .order("created_at", { ascending: false });

  if (partnerAccountId) {
    query = query.eq("partner_account_id", partnerAccountId);
  }

  const { data, error } = await query;
  if (error) throw error;

  return (data ?? []) as Customer[];
}

export async function listCustomerListItems(
  partnerAccountId: string
): Promise<CustomerListItem[]> {
  const [customers, summaries] = await Promise.all([
    listCustomers(partnerAccountId),
    listCustomerDealSummaries(partnerAccountId),
  ]);

  const summaryMap = new Map(
    summaries.map((summary) => [summary.customer_id, summary])
  );

  return customers.map((customer) => ({
    customer,
    summary: summaryMap.get(customer.id) ?? null,
  }));
}

export async function listAllCustomerListItems(): Promise<CustomerListItem[]> {
  const [customers, summaries] = await Promise.all([
    listCustomers(),
    listCustomerDealSummaries(),
  ]);

  const summaryMap = new Map(
    summaries.map((summary) => [summary.customer_id, summary])
  );

  return customers.map((customer) => ({
    customer,
    summary: summaryMap.get(customer.id) ?? null,
  }));
}

export async function getCustomer(customerId: string): Promise<Customer | null> {
  const supabase = createSupabaseAdminClient();

  const { data, error } = await supabase
    .from("customers")
    .select("*")
    .eq("id", customerId)
    .single();

  if (error) return null;
  return data as Customer;
}

export async function getCustomerDealSummary(
  customerId: string
): Promise<CustomerDealSummary | null> {
  const supabase = createSupabaseAdminClient();

  const { data, error } = await supabase
    .from("customer_deal_summary")
    .select("*")
    .eq("customer_id", customerId)
    .single();

  if (error) return null;
  return data as CustomerDealSummary;
}

export async function listCustomerDealSummaries(
  partnerAccountId?: string
): Promise<CustomerDealSummary[]> {
  const supabase = createSupabaseAdminClient();

  let query = supabase
    .from("customer_deal_summary")
    .select("*")
    .order("last_deal_updated_at", { ascending: false, nullsFirst: false });

  if (partnerAccountId) {
    query = query.eq("partner_account_id", partnerAccountId);
  }

  const { data, error } = await query;

  if (error) throw error;
  return (data ?? []) as CustomerDealSummary[];
}

export async function listCustomerDealHistory(
  customerId: string
): Promise<CustomerDealHistoryItem[]> {
  const supabase = createSupabaseAdminClient();

  const { data, error } = await supabase
    .from("customer_deal_history")
    .select("*")
    .eq("customer_id", customerId)
    .order("deal_updated_at", { ascending: false });

  if (error) throw error;
  return (data ?? []) as CustomerDealHistoryItem[];
}

export async function listRecentCustomerActivity(
  customerId: string,
  limit = 20
): Promise<ActivityLog[]> {
  const supabase = createSupabaseAdminClient();

  const { data, error } = await supabase
    .from("activity_logs")
    .select("*")
    .eq("customer_id", customerId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) throw error;
  return (data ?? []) as ActivityLog[];
}

export async function listRecentCustomerCalendarEvents(
  customerId: string,
  limit = 20
): Promise<CalendarEvent[]> {
  const supabase = createSupabaseAdminClient();

  const { data, error } = await supabase
    .from("calendar_events")
    .select("*")
    .eq("customer_id", customerId)
    .order("starts_at", { ascending: false })
    .limit(limit);

  if (error) throw error;
  return (data ?? []) as CalendarEvent[];
}

export async function getCustomerDetail(
  customerId: string
): Promise<CustomerDetailPayload | null> {
  const [customer, summary, deals, recentActivity, recentCalendarEvents] =
    await Promise.all([
      getCustomer(customerId),
      getCustomerDealSummary(customerId),
      listCustomerDealHistory(customerId),
      listRecentCustomerActivity(customerId, 12),
      listRecentCustomerCalendarEvents(customerId, 12),
    ]);

  if (!customer || !summary) {
    return null;
  }

  return {
    customer,
    summary,
    deals,
    recent_activity: recentActivity,
    recent_calendar_events: recentCalendarEvents,
  };
}

export async function getCustomerDetailForPartnerAccount(
  customerId: string,
  partnerAccountId: string
): Promise<CustomerDetailPayload | null> {
  const detail = await getCustomerDetail(customerId);
  if (!detail) return null;
  if (detail.customer.partner_account_id !== partnerAccountId) return null;
  return detail;
}

/* ─── Write Operations ──────────────────────────────────── */

export async function createCustomer(
  input: InsertCustomer
): Promise<Customer> {
  const supabase = createSupabaseAdminClient();

  const { data, error } = await supabase
    .from("customers")
    .insert(input)
    .select()
    .single();

  if (error) throw error;
  return data as Customer;
}

export async function updateCustomer(
  customerId: string,
  input: UpdateCustomer
): Promise<Customer> {
  const supabase = createSupabaseAdminClient();

  const { data, error } = await supabase
    .from("customers")
    .update(input)
    .eq("id", customerId)
    .select()
    .single();

  if (error) throw error;
  return data as Customer;
}

export async function deleteCustomer(customerId: string): Promise<void> {
  const supabase = createSupabaseAdminClient();

  const { error } = await supabase
    .from("customers")
    .delete()
    .eq("id", customerId);

  if (error) throw error;
}
