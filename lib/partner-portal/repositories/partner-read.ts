"server-only";

import { getDemoCustomerDetail, getDemoDealDetail, listDemoCustomerListItems } from "@/lib/partner-portal/repositories/demo";
import { getLegacyCustomerDetail, getLegacyDealDetail, listLegacyCustomerListItems } from "@/lib/partner-portal/repositories/legacy";
import { getCustomerDetailForPartnerAccount, listCustomerListItems } from "@/lib/partner-portal/repositories/customers";
import { getDealDetailForPartnerAccount, listDealListItems } from "@/lib/partner-portal/repositories/deals";
import type { PartnerAccountContext } from "@/lib/partner-portal/context";
import type {
  ActivityLog,
  CalendarEvent,
  CustomerDetailPayload,
  CustomerListItem,
  DealDetailPayload,
  DealListItem,
  InstallationEvent,
  PaymentRecord,
} from "@/lib/partner-portal/types";

export type PartnerReadMode = "v2" | "legacy" | "demo";

export interface PartnerOverviewMetrics {
  customer_count: number;
  active_deal_count: number;
  installation_deal_count: number;
  unpaid_deal_count: number;
  contracted_amount: number;
  installed_amount: number;
  paid_amount: number;
  outstanding_amount: number;
}

export interface PartnerOverviewPayload {
  mode: PartnerReadMode;
  metrics: PartnerOverviewMetrics;
  customers: CustomerListItem[];
  deals: DealListItem[];
  recent_activity: ActivityLog[];
  upcoming_installations: InstallationEvent[];
  recent_payments: PaymentRecord[];
  recent_calendar_events: CalendarEvent[];
}

function isTruthy<T>(value: T | null | undefined): value is T {
  return value !== null && value !== undefined;
}

function sortByDateDesc<T>(items: T[], getDate: (item: T) => string | null | undefined) {
  return [...items].sort((left, right) => {
    const leftTime = new Date(getDate(left) ?? 0).getTime();
    const rightTime = new Date(getDate(right) ?? 0).getTime();
    return rightTime - leftTime;
  });
}

function historyToDealListItem(
  detail: CustomerDetailPayload,
  history: CustomerDetailPayload["deals"][number]
): DealListItem {
  return {
    id: history.deal_id,
    partner_account_id: detail.customer.partner_account_id,
    customer_id: history.customer_id,
    deal_code: history.deal_code,
    title: history.deal_title,
    status: history.deal_status,
    current_stage: history.current_stage,
    expected_amount: history.expected_amount,
    contracted_amount: history.contracted_amount,
    installed_amount: history.installed_amount,
    paid_amount: history.paid_amount,
    outstanding_amount: history.outstanding_amount,
    payment_status: history.payment_status,
    starts_at: history.deal_created_at,
    closed_at: history.deal_status === "closed" ? history.deal_updated_at : null,
    notes: null,
    created_by: null,
    created_at: history.deal_created_at,
    updated_at: history.deal_updated_at,
    customer_name: detail.customer.name,
    customer_contact_name: detail.customer.contact_name,
    customer_region_label: detail.customer.region_label,
    customer_campus_name: detail.customer.campus_name,
  };
}

function flattenDetails(details: DealDetailPayload[]) {
  const activityLogs = details.flatMap((detail) => detail.activity_logs);
  const installations = details.flatMap((detail) => detail.installations);
  const payments = details.flatMap((detail) => detail.payments);
  const calendarEvents = details.flatMap((detail) => detail.calendar_events);

  return {
    activityLogs: sortByDateDesc(activityLogs, (item) => item.created_at),
    installations: sortByDateDesc(installations, (item) => item.scheduled_start_at),
    payments: sortByDateDesc(payments, (item) => item.paid_at),
    calendarEvents: sortByDateDesc(calendarEvents, (item) => item.starts_at),
  };
}

async function loadV2Customers(
  partnerAccountId: string
): Promise<CustomerListItem[] | null> {
  try {
    const customers = await listCustomerListItems(partnerAccountId);
    return customers.length > 0 ? customers : [];
  } catch (error) {
    console.warn("[partner-read] v2 customers fallback", error);
    return null;
  }
}

async function loadLegacyCustomers(): Promise<CustomerListItem[] | null> {
  try {
    const customers = await listLegacyCustomerListItems();
    return customers.length > 0 ? customers : null;
  } catch (error) {
    console.warn("[partner-read] legacy customers fallback", error);
    return null;
  }
}

export async function loadPartnerCustomers(
  context: PartnerAccountContext
): Promise<{ mode: PartnerReadMode; customers: CustomerListItem[] }> {
  if (context.partnerAccountId) {
    const v2Customers = await loadV2Customers(context.partnerAccountId);
    if (v2Customers) return { mode: "v2", customers: v2Customers };
  }

  const legacyCustomers = await loadLegacyCustomers();
  if (legacyCustomers) return { mode: "legacy", customers: legacyCustomers };

  return { mode: "demo", customers: await listDemoCustomerListItems() };
}

export async function loadPartnerCustomerDetail(
  context: PartnerAccountContext,
  customerId: string
): Promise<{ mode: PartnerReadMode; customer: CustomerDetailPayload | null }> {
  if (context.partnerAccountId) {
    try {
      const customer = await getCustomerDetailForPartnerAccount(
        customerId,
        context.partnerAccountId
      );
      if (customer) return { mode: "v2", customer };
    } catch (error) {
      console.warn("[partner-read] v2 customer detail fallback", error);
    }
  }

  if (context.legacyPartnerId) {
    const customer = await getLegacyCustomerDetail(customerId);
    if (customer) return { mode: "legacy", customer };
  }

  const customer = await getDemoCustomerDetail(customerId);
  return { mode: "demo", customer };
}

async function loadV2Deals(
  partnerAccountId: string
): Promise<DealListItem[] | null> {
  try {
    const deals = await listDealListItems({ partnerAccountId });
    return deals.length > 0 ? deals : [];
  } catch (error) {
    console.warn("[partner-read] v2 deals fallback", error);
    return null;
  }
}

async function loadLegacyDeals(): Promise<DealListItem[] | null> {
  const customers = await loadLegacyCustomers();
  if (!customers) return null;

  const details = await Promise.all(
    customers.map((item) => getLegacyCustomerDetail(item.customer.id))
  );

  const deals = details
    .filter(isTruthy)
    .flatMap((detail) => detail.deals.map((history) => historyToDealListItem(detail, history)));

  return deals.length > 0 ? deals : null;
}

async function loadDemoDeals(): Promise<DealListItem[] | null> {
  const customers = await listDemoCustomerListItems();
  const details = await Promise.all(
    customers.map((item) => getDemoCustomerDetail(item.customer.id))
  );

  const deals = details
    .filter(isTruthy)
    .flatMap((detail) => detail.deals.map((history) => historyToDealListItem(detail, history)));

  return deals;
}

export async function loadPartnerDeals(
  context: PartnerAccountContext
): Promise<{ mode: PartnerReadMode; deals: DealListItem[] }> {
  if (context.partnerAccountId) {
    const v2Deals = await loadV2Deals(context.partnerAccountId);
    if (v2Deals) return { mode: "v2", deals: v2Deals };
  }

  const legacyDeals = await loadLegacyDeals();
  if (legacyDeals) return { mode: "legacy", deals: legacyDeals };

  return { mode: "demo", deals: (await loadDemoDeals()) ?? [] };
}

export async function loadPartnerDealDetail(
  context: PartnerAccountContext,
  dealId: string
): Promise<{ mode: PartnerReadMode; deal: DealDetailPayload | null }> {
  if (context.partnerAccountId) {
    try {
      const deal = await getDealDetailForPartnerAccount(
        dealId,
        context.partnerAccountId
      );
      if (deal) return { mode: "v2", deal };
    } catch (error) {
      console.warn("[partner-read] v2 deal detail fallback", error);
    }
  }

  if (context.legacyPartnerId) {
    const deal = await getLegacyDealDetail(dealId);
    if (deal) return { mode: "legacy", deal };
  }

  const deal = await getDemoDealDetail(dealId);
  return { mode: "demo", deal };
}

async function loadDetailsForOverview(
  mode: PartnerReadMode,
  items: CustomerListItem[] | DealListItem[],
  context: PartnerAccountContext
): Promise<DealDetailPayload[]> {
  const ids = mode === "v2"
    ? (items as DealListItem[]).slice(0, 8).map((item) => item.id)
    : (items as CustomerListItem[])
        .slice(0, 8)
        .map((item) => item.customer.id);

  const details = await Promise.all(
    ids.map(async (id) => {
      if (mode === "v2" && context.partnerAccountId) {
        const detail = await getDealDetailForPartnerAccount(id, context.partnerAccountId);
        return detail;
      }
      if (mode === "legacy") return getLegacyDealDetail(id);
      return getDemoDealDetail(id);
    })
  );

  return details.filter(isTruthy);
}

export async function loadPartnerOverview(
  context: PartnerAccountContext
): Promise<PartnerOverviewPayload> {
  const { mode: customerMode, customers } = await loadPartnerCustomers(context);
  const { mode: dealMode, deals } = await loadPartnerDeals(context);
  const mode = customerMode === "v2" && dealMode === "v2" ? "v2" : customerMode === "legacy" || dealMode === "legacy" ? "legacy" : "demo";

  const metrics = customers.reduce<PartnerOverviewMetrics>(
    (acc, item) => {
      acc.customer_count += 1;
      acc.active_deal_count += item.summary?.active_deals ?? 0;
      acc.installation_deal_count += item.summary?.installation_deals ?? 0;
      acc.unpaid_deal_count += item.summary?.unpaid_deals ?? 0;
      acc.contracted_amount += item.summary?.contracted_amount ?? 0;
      acc.installed_amount += item.summary?.installed_amount ?? 0;
      acc.paid_amount += item.summary?.paid_amount ?? 0;
      acc.outstanding_amount += item.summary?.outstanding_amount ?? 0;
      return acc;
    },
    {
      customer_count: 0,
      active_deal_count: 0,
      installation_deal_count: 0,
      unpaid_deal_count: 0,
      contracted_amount: 0,
      installed_amount: 0,
      paid_amount: 0,
      outstanding_amount: 0,
    }
  );

  const detailItems =
    mode === "v2"
      ? deals.slice(0, 8)
      : customers.slice(0, 8);
  const details = await loadDetailsForOverview(mode, detailItems, context);
  const flattened = flattenDetails(details);

  return {
    mode,
    metrics,
    customers,
    deals,
    recent_activity: flattened.activityLogs.slice(0, 12),
    upcoming_installations: flattened.installations.slice(0, 12),
    recent_payments: flattened.payments.slice(0, 12),
    recent_calendar_events: flattened.calendarEvents.slice(0, 12),
  };
}

export async function loadPartnerCalendar(
  context: PartnerAccountContext
): Promise<{ mode: PartnerReadMode; events: CalendarEvent[] }> {
  const overview = await loadPartnerOverview(context);
  return { mode: overview.mode, events: overview.recent_calendar_events };
}

export async function loadPartnerPayments(
  context: PartnerAccountContext
): Promise<{ mode: PartnerReadMode; payments: PaymentRecord[] }> {
  const overview = await loadPartnerOverview(context);
  return { mode: overview.mode, payments: overview.recent_payments };
}
