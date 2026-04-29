"server-only";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { listDealListItems } from "@/lib/partner-portal/repositories/deals";
import type { InsertCustomer, UpdateCustomer } from "@/lib/supabase/database.types.v2";
import type {
  ActivityLog,
  CalendarEvent,
  CalendarSourceType,
  Customer,
  CustomerDealHistoryItem,
  CustomerDealPreview,
  CustomerDealSummary,
  CustomerDetailPayload,
  CustomerInsight,
  CustomerListItem,
  DealListItem,
} from "@/lib/partner-portal/types";

function compareIsoAsc(left: string, right: string) {
  return new Date(left).getTime() - new Date(right).getTime();
}

function compareIsoDesc(left: string, right: string) {
  return new Date(right).getTime() - new Date(left).getTime();
}

function isOpenDeal(deal: DealListItem) {
  return deal.status !== "closed" && deal.status !== "cancelled";
}

function emptyCustomerDealSummary(customer: Customer): CustomerDealSummary {
  return {
    customer_id: customer.id,
    partner_account_id: customer.partner_account_id,
    customer_name: customer.name,
    total_deals: 0,
    active_deals: 0,
    installation_deals: 0,
    unpaid_deals: 0,
    contracted_amount: 0,
    installed_amount: 0,
    paid_amount: 0,
    outstanding_amount: 0,
    last_deal_updated_at: null,
  };
}

function resolveAttentionLevel({
  summary,
  activeDealCount,
  primaryStage,
  nextEventAt,
  recentActivityAt,
}: {
  summary: CustomerDealSummary | null;
  activeDealCount: number;
  primaryStage: DealListItem["current_stage"] | null;
  nextEventAt: string | null;
  recentActivityAt: string | null;
}): CustomerInsight["attention_level"] {
  const now = Date.now();
  let score = 0;

  if ((summary?.outstanding_amount ?? 0) > 0) score += 2;
  if (activeDealCount > 1) score += 1;

  if (nextEventAt) {
    const diffDays = (new Date(nextEventAt).getTime() - now) / (1000 * 60 * 60 * 24);
    if (diffDays <= 1) score += 2;
    else if (diffDays <= 7) score += 1;
  } else if (primaryStage === "confirmed") {
    score += 3;
  } else if (activeDealCount > 0) {
    score += 1;
  }

  if (recentActivityAt) {
    const inactiveDays = (now - new Date(recentActivityAt).getTime()) / (1000 * 60 * 60 * 24);
    if (inactiveDays >= 14 && activeDealCount > 0) score += 1;
  } else if (activeDealCount > 0) {
    score += 1;
  }

  if (score >= 4) return "high";
  if (score >= 2) return "medium";
  return "low";
}

async function buildCustomerListDecorations(
  customers: Customer[],
  summaryMap: Map<string, CustomerDealSummary>,
  partnerAccountId?: string
): Promise<{
  insightMap: Map<string, CustomerInsight>;
  dealPreviewMap: Map<string, CustomerDealPreview[]>;
}> {
  if (customers.length === 0) {
    return {
      insightMap: new Map(),
      dealPreviewMap: new Map(),
    };
  }

  const customerIds = customers.map((customer) => customer.id);
  const customerIdSet = new Set(customerIds);
  const supabase = createSupabaseAdminClient();
  const nowIso = new Date().toISOString();

  let activityQuery = supabase
    .from("activity_logs")
    .select("customer_id, created_at")
    .in("customer_id", customerIds)
    .order("created_at", { ascending: false });

  if (partnerAccountId) {
    activityQuery = activityQuery.eq("partner_account_id", partnerAccountId);
  }

  let eventQuery = supabase
    .from("calendar_events")
    .select("customer_id, deal_id, source_type, starts_at, ends_at, status")
    .in("customer_id", customerIds)
    .eq("status", "active")
    .gte("ends_at", nowIso)
    .order("starts_at", { ascending: true });

  if (partnerAccountId) {
    eventQuery = eventQuery.eq("partner_account_id", partnerAccountId);
  }

  const [deals, activityResult, eventResult] = await Promise.all([
    listDealListItems(partnerAccountId ? { partnerAccountId } : {}),
    activityQuery,
    eventQuery,
  ]);

  if (activityResult.error) throw activityResult.error;
  if (eventResult.error) throw eventResult.error;

  const activityRows = (activityResult.data ?? []) as Array<
    Pick<ActivityLog, "customer_id" | "created_at">
  >;
  const eventRows = (eventResult.data ?? []) as Array<
    Pick<
      CalendarEvent,
      "customer_id" | "deal_id" | "source_type" | "starts_at" | "ends_at" | "status"
    >
  >;

  const dealsByCustomerId = new Map<string, DealListItem[]>();
  for (const deal of deals) {
    if (!customerIdSet.has(deal.customer_id)) continue;
    const items = dealsByCustomerId.get(deal.customer_id) ?? [];
    items.push(deal);
    dealsByCustomerId.set(deal.customer_id, items);
  }

  for (const items of dealsByCustomerId.values()) {
    items.sort((left, right) => compareIsoDesc(left.updated_at, right.updated_at));
  }

  const recentActivityByCustomerId = new Map<string, string>();
  for (const row of activityRows) {
    if (!row.customer_id || recentActivityByCustomerId.has(row.customer_id)) continue;
    recentActivityByCustomerId.set(row.customer_id, row.created_at);
  }

  const nextEventByCustomerId = new Map<
    string,
    { starts_at: string; source_type: CalendarSourceType }
  >();
  const nextEventByDealId = new Map<string, string>();

  for (const row of eventRows) {
    if (row.customer_id && !nextEventByCustomerId.has(row.customer_id)) {
      nextEventByCustomerId.set(row.customer_id, {
        starts_at: row.starts_at,
        source_type: row.source_type,
      });
    }

    if (row.deal_id) {
      const current = nextEventByDealId.get(row.deal_id);
      if (!current || compareIsoAsc(row.starts_at, current) < 0) {
        nextEventByDealId.set(row.deal_id, row.starts_at);
      }
    }
  }

  const insightMap = new Map<string, CustomerInsight>();
  const dealPreviewMap = new Map<string, CustomerDealPreview[]>();

  for (const customer of customers) {
    const customerDeals = dealsByCustomerId.get(customer.id) ?? [];
    const activeDeals = customerDeals.filter(isOpenDeal);
    const rankedDeals = activeDeals.length > 0 ? activeDeals : customerDeals;
    const primaryDeal = rankedDeals[0] ?? null;
    const nextEvent = nextEventByCustomerId.get(customer.id) ?? null;
    const recentActivityAt = recentActivityByCustomerId.get(customer.id) ?? null;
    const summary = summaryMap.get(customer.id) ?? null;

    dealPreviewMap.set(
      customer.id,
      rankedDeals.slice(0, 2).map((deal) => ({
        deal_id: deal.id,
        title: deal.title,
        current_stage: deal.current_stage,
        status: deal.status,
        updated_at: deal.updated_at,
        next_event_at: nextEventByDealId.get(deal.id) ?? null,
      }))
    );

    insightMap.set(customer.id, {
      primary_stage: primaryDeal?.current_stage ?? null,
      next_event_at: nextEvent?.starts_at ?? null,
      next_event_type: nextEvent?.source_type ?? null,
      recent_activity_at: recentActivityAt,
      attention_level: resolveAttentionLevel({
        summary,
        activeDealCount: activeDeals.length,
        primaryStage: primaryDeal?.current_stage ?? null,
        nextEventAt: nextEvent?.starts_at ?? null,
        recentActivityAt,
      }),
    });
  }

  return { insightMap, dealPreviewMap };
}

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
  const { insightMap, dealPreviewMap } = await buildCustomerListDecorations(
    customers,
    summaryMap,
    partnerAccountId
  );

  return customers.map((customer) => ({
    customer,
    summary: summaryMap.get(customer.id) ?? null,
    insight: insightMap.get(customer.id) ?? null,
    deal_previews: dealPreviewMap.get(customer.id) ?? [],
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
  const { insightMap, dealPreviewMap } = await buildCustomerListDecorations(
    customers,
    summaryMap
  );

  return customers.map((customer) => ({
    customer,
    summary: summaryMap.get(customer.id) ?? null,
    insight: insightMap.get(customer.id) ?? null,
    deal_previews: dealPreviewMap.get(customer.id) ?? [],
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
    .select("*, deals(title, current_stage)")
    .eq("customer_id", customerId)
    .order("starts_at", { ascending: false })
    .limit(limit);

  if (error) throw error;
  return ((data ?? []) as Array<
    CalendarEvent & {
      deals?: {
        title: string | null;
        current_stage: DealListItem["current_stage"] | null;
      } | null;
    }
  >).map((event) => ({
    ...event,
    deal_title: event.deals?.title ?? null,
    deal_stage: event.deals?.current_stage ?? null,
  }));
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

  if (!customer) {
    return null;
  }

  return {
    customer,
    summary: summary ?? emptyCustomerDealSummary(customer),
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
