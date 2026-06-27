"server-only";

import { getLegacyCustomerDetail, getLegacyDealDetail, listLegacyCustomerListItems } from "@/lib/portal/repositories/legacy";
import { getCustomerDetailForPartnerAccount, listCustomerListItems } from "@/lib/portal/repositories/customers";
import { getDealDetailForPartnerAccount, listDealListItems } from "@/lib/portal/repositories/deals";
import type { PartnerAccountContext } from "@/lib/portal/context";
import type {
  ActivityLog,
  CalendarEvent,
  ContractDocumentBundle,
  CustomerDetailPayload,
  CustomerListItem,
  DealDetailPayload,
  DealListItem,
  InstallationEvent,
  PartnerDocumentListItem,
  PartnerDocumentSummary,
  PaymentRecord,
  QuoteDocumentBundle,
  ReceiptRecord,
} from "@/lib/portal/types";

export type PortalReadMode = "v2" | "legacy";

export interface InventorySkuSummary {
  sku: string;
  product_name: string;
  pending_qty: number;
  shipped_qty: number;
  delivered_qty: number;
  total_qty: number;
}

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

export interface PortalOverviewPayload {
  mode: PortalReadMode;
  metrics: PartnerOverviewMetrics;
  customers: CustomerListItem[];
  deals: DealListItem[];
  recent_activity: ActivityLog[];
  upcoming_installations: InstallationEvent[];
  recent_payments: PaymentRecord[];
  recent_calendar_events: CalendarEvent[];
  inventory_summary: InventorySkuSummary[];
}

function isTruthy<T>(value: T | null | undefined): value is T {
  return value !== null && value !== undefined;
}

function dedupeById<T extends { id: string }>(items: T[]) {
  const seen = new Set<string>();

  return items.filter((item) => {
    if (seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  });
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
    owner_id: null,
    created_at: history.deal_created_at,
    updated_at: history.deal_updated_at,
    customer_name: detail.customer.name,
    customer_contact_name: detail.customer.contact_name,
    customer_region_label: detail.customer.region_label,
    customer_campus_name: detail.customer.campus_name,
    owner_name: null,
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

function decorateCalendarEvents(
  events: CalendarEvent[],
  deals: DealListItem[],
  customers: CustomerListItem[]
) {
  const dealMap = new Map(deals.map((deal) => [deal.id, deal]));
  const customerMap = new Map(
    customers.map((item) => [item.customer.id, item.customer])
  );

  return events.map((event) => {
    const deal = event.deal_id ? dealMap.get(event.deal_id) : null;
    const customer = event.customer_id ? customerMap.get(event.customer_id) : null;

    return {
      ...event,
      customer_name: event.customer_name ?? deal?.customer_name ?? customer?.name ?? null,
      deal_title: event.deal_title ?? deal?.title ?? null,
      deal_stage: event.deal_stage ?? deal?.current_stage ?? null,
    };
  });
}

function mapQuoteDocuments(detail: DealDetailPayload): PartnerDocumentListItem[] {
  return detail.quote_documents.map((document: QuoteDocumentBundle) => {
    const currentVersion =
      document.versions.find((version) => version.id === document.current_version_id) ??
      document.versions[0] ??
      null;

    return {
      id: document.id,
      kind: "quote",
      deal_id: detail.deal.id,
      customer_id: detail.customer.id,
      customer_name: detail.customer.name,
      deal_title: detail.deal.title,
      document_number: document.quote_number,
      status: document.status,
      version_count: document.versions.length,
      total_amount: currentVersion?.total_amount ?? null,
      updated_at: document.updated_at,
      latest_version_number: currentVersion?.version_number ?? null,
      share_count: document.shares.length,
      pdf_url: null,
    };
  });
}

function mapContractDocuments(detail: DealDetailPayload): PartnerDocumentListItem[] {
  return detail.contract_documents.map((document: ContractDocumentBundle) => {
    const currentVersion =
      document.versions.find((version) => version.id === document.current_version_id) ??
      document.versions[0] ??
      null;

    return {
      id: document.id,
      kind: "contract",
      deal_id: detail.deal.id,
      customer_id: detail.customer.id,
      customer_name: detail.customer.name,
      deal_title: detail.deal.title,
      document_number: document.contract_number,
      status: document.status,
      version_count: document.versions.length,
      total_amount: currentVersion?.total_amount ?? null,
      updated_at: document.updated_at,
      latest_version_number: currentVersion?.version_number ?? null,
      share_count: document.shares.length,
      pdf_url: null,
    };
  });
}

function mapReceipts(detail: DealDetailPayload): PartnerDocumentListItem[] {
  return detail.receipts.map((receipt: ReceiptRecord) => ({
    id: receipt.id,
    kind: "receipt",
    deal_id: detail.deal.id,
    customer_id: detail.customer.id,
    customer_name: detail.customer.name,
    deal_title: detail.deal.title,
    document_number: receipt.receipt_number,
    status: "issued",
    version_count: 1,
    total_amount: receipt.total_amount,
    updated_at: receipt.updated_at,
    latest_version_number: 1,
    share_count: 0,
    pdf_url: receipt.pdf_url,
  }));
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
): Promise<{ mode: PortalReadMode; customers: CustomerListItem[] }> {
  if (context.partnerAccountId) {
    const v2Customers = await loadV2Customers(context.partnerAccountId);
    if (v2Customers) return { mode: "v2", customers: v2Customers };
  }

  const legacyCustomers = await loadLegacyCustomers();
  if (legacyCustomers) return { mode: "legacy", customers: legacyCustomers };

  return { mode: "legacy", customers: [] };
}

export async function loadPartnerCustomerDetail(
  context: PartnerAccountContext,
  customerId: string
): Promise<{ mode: PortalReadMode; customer: CustomerDetailPayload | null }> {
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

  return { mode: context.partnerAccountId ? "v2" : "legacy", customer: null };
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

export async function loadPartnerDeals(
  context: PartnerAccountContext
): Promise<{ mode: PortalReadMode; deals: DealListItem[] }> {
  if (context.partnerAccountId) {
    const v2Deals = await loadV2Deals(context.partnerAccountId);
    if (v2Deals) return { mode: "v2", deals: v2Deals };
  }

  const legacyDeals = await loadLegacyDeals();
  if (legacyDeals) return { mode: "legacy", deals: legacyDeals };

  return { mode: "legacy", deals: [] };
}

export async function loadPartnerDealDetail(
  context: PartnerAccountContext,
  dealId: string
): Promise<{ mode: PortalReadMode; deal: DealDetailPayload | null }> {
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

  return { mode: context.partnerAccountId ? "v2" : "legacy", deal: null };
}

async function loadDetailsForOverview(
  mode: PortalReadMode,
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
      return null;
    })
  );

  return details.filter(isTruthy);
}

export async function loadPortalOverview(
  context: PartnerAccountContext
): Promise<PortalOverviewPayload> {
  const { mode: customerMode, customers } = await loadPartnerCustomers(context);
  const { mode: dealMode, deals } = await loadPartnerDeals(context);
  const mode = customerMode === "v2" && dealMode === "v2" ? "v2" : "legacy";

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

  // HW 재고 요약은 레거시 hw_sales 테이블 제거로 더 이상 채우지 않는다.
  // 실제 하드웨어 재고는 branch_hw_* 경로(branch sync)에서 별도로 관리된다.
  const inventory_summary: InventorySkuSummary[] = [];

  return {
    mode,
    metrics,
    customers,
    deals,
    recent_activity: flattened.activityLogs.slice(0, 12),
    upcoming_installations: flattened.installations.slice(0, 12),
    recent_payments: flattened.payments.slice(0, 12),
    recent_calendar_events: flattened.calendarEvents.slice(0, 12),
    inventory_summary,
  };
}

export async function loadPartnerCalendar(
  context: PartnerAccountContext
): Promise<{ mode: PortalReadMode; events: CalendarEvent[] }> {
  const { mode, deals } = await loadPartnerDeals(context);

  if (deals.length === 0) {
    const overview = await loadPortalOverview(context);
    return {
      mode: overview.mode,
      events: decorateCalendarEvents(
        overview.recent_calendar_events,
        overview.deals,
        overview.customers
      ),
    };
  }

  const detailPayloads = await Promise.all(
    deals.map(async (deal) => {
      try {
        const payload = await loadPartnerDealDetail(context, deal.id);
        return payload.deal;
      } catch (error) {
        console.warn("[partner-read] calendar detail fallback", error);
        return null;
      }
    })
  );

  const events = sortByDateDesc(
    dedupeById(
      detailPayloads
        .filter(isTruthy)
        .flatMap((detail) => detail.calendar_events)
    ),
    (item) => item.starts_at
  );

  if (events.length > 0) {
    const customerPayload = await loadPartnerCustomers(context);
    return {
      mode,
      events: decorateCalendarEvents(events, deals, customerPayload.customers),
    };
  }

  const overview = await loadPortalOverview(context);
  return {
    mode: overview.mode,
    events: decorateCalendarEvents(
      overview.recent_calendar_events,
      overview.deals,
      overview.customers
    ),
  };
}

export async function loadPartnerPayments(
  context: PartnerAccountContext
): Promise<{ mode: PortalReadMode; payments: PaymentRecord[] }> {
  const overview = await loadPortalOverview(context);
  return { mode: overview.mode, payments: overview.recent_payments };
}

export async function loadPartnerDocuments(
  context: PartnerAccountContext
): Promise<{ mode: PortalReadMode; summary: PartnerDocumentSummary; documents: PartnerDocumentListItem[] }> {
  const { mode, deals } = await loadPartnerDeals(context);

  if (deals.length === 0) {
    return {
      mode,
      summary: { all: 0, quote: 0, contract: 0, receipt: 0 },
      documents: [],
    };
  }

  const detailPayloads = await Promise.all(
    deals.map(async (deal) => {
      try {
        const payload = await loadPartnerDealDetail(context, deal.id);
        return payload.deal;
      } catch (error) {
        console.warn("[partner-read] documents detail fallback", error);
        return null;
      }
    })
  );

  const documents = sortByDateDesc(
    dedupeById(
      detailPayloads
        .filter(isTruthy)
        .flatMap((detail) => [
          ...mapQuoteDocuments(detail),
          ...mapContractDocuments(detail),
          ...mapReceipts(detail),
        ])
    ),
    (item) => item.updated_at
  );

  const summary = documents.reduce<PartnerDocumentSummary>(
    (acc, item) => {
      acc.all += 1;
      acc[item.kind] += 1;
      return acc;
    },
    { all: 0, quote: 0, contract: 0, receipt: 0 }
  );

  return { mode, summary, documents };
}
