"server-only";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type {
  ActivityLog,
  CalendarEvent,
  Customer,
  CustomerDealHistoryItem,
  CustomerDealSummary,
  CustomerDetailPayload,
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
